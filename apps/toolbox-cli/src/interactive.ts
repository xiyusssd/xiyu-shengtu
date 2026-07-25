import * as p from "@clack/prompts";
import kleur from "kleur";
import {
  addProvider,
  getActiveProfile,
  getConfigPath,
  loadConfig,
  removeProvider,
  saveConfig,
  useProvider,
} from "@xiyu-shengtu/toolbox-core";
import { getProvider } from "@xiyu-shengtu/provider-core";
import {
  getTemplate,
  PROVIDER_TEMPLATES,
} from "@xiyu-shengtu/toolbox-core/templates";
import { renderTable } from "./table";
import { maskKey } from "@xiyu-shengtu/toolbox-core";

function bail(msg?: string): never {
  if (msg) p.cancel(msg);
  else p.cancel("已取消");
  process.exit(0);
}

function checkCancel<T>(v: T | symbol): T {
  if (p.isCancel(v)) bail();
  return v as T;
}

export async function runAddWizard(): Promise<void> {
  p.intro(kleur.bold("添加 Provider"));

  const type = checkCancel(
    await p.select({
      message: "选择 Provider 类型",
      options: PROVIDER_TEMPLATES.map((t) => ({
        value: t.type,
        label: `${t.type.padEnd(16)} ${kleur.dim(t.displayName)}`,
      })),
    })
  ) as string;

  const tpl = getTemplate(type)!;
  const cfg = loadConfig();
  const profile = getActiveProfile(cfg);

  const id = checkCancel(
    await p.text({
      message: "Provider ID（唯一标识，如 my-openai）",
      validate: (v) => {
        if (!v?.trim()) return "不能为空";
        if (!/^[a-zA-Z0-9._-]+$/.test(v)) return "只允许字母数字 . _ -";
        if (profile.providers[v]) return `ID "${v}" 已存在`;
        return undefined;
      },
    })
  ) as string;

  const entry: Record<string, string | undefined> = { type };

  for (const field of tpl.fields) {
    if (field.key === "displayName") {
      const val = checkCancel(
        await p.text({
          message: field.label,
          placeholder: field.placeholder,
          initialValue: field.default,
        })
      ) as string;
      if (val) entry.displayName = val;
    } else if (field.type === "password") {
      const val = checkCancel(
        await p.password({
          message: field.label,
          validate: field.required
            ? (v) => (!v?.trim() ? "不能为空" : undefined)
            : undefined,
        })
      ) as string;
      if (val) entry[field.key] = val;
    } else {
      const val = checkCancel(
        await p.text({
          message: field.label,
          placeholder: field.placeholder,
          initialValue: field.default,
          validate: field.required
            ? (v) => (!v?.trim() ? "不能为空" : undefined)
            : undefined,
        })
      ) as string;
      if (val) entry[field.key] = val;
    }
  }

  addProvider(cfg, id, entry as any);
  saveConfig(cfg);

  const shouldTest = checkCancel(
    await p.confirm({
      message: "立即测试连通性？",
      initialValue: true,
    })
  ) as boolean;

  if (shouldTest) {
    const spinner = p.spinner();
    spinner.start("测试中");
    const impl = getProvider(type);
    if (!impl) {
      spinner.stop("未实现的 provider 类型", 1);
    } else {
      const res = await impl.validate(entry as any);
      if (res.ok) {
        spinner.stop(
          `${kleur.green("✓")} 连通  latency=${res.latencyMs ?? "?"}ms`
        );
      } else {
        spinner.stop(
          `${kleur.red("✗")} 失败  ${res.message ?? ""}`,
          1
        );
      }
    }
  }

  p.outro(kleur.green(`✓ Provider "${id}" 已添加`));
}

async function pickProvider(action: string): Promise<string | null> {
  const cfg = loadConfig();
  const profile = getActiveProfile(cfg);
  const entries = Object.entries(profile.providers);
  if (entries.length === 0) {
    p.log.warn("当前 profile 没有任何 provider");
    return null;
  }
  const value = checkCancel(
    await p.select({
      message: `选择要${action}的 Provider`,
      options: entries.map(([id, e]) => ({
        value: id,
        label: `${profile.activeProvider === id ? "● " : "  "}${id.padEnd(18)} ${kleur.dim(e.type)}`,
      })),
    })
  );
  return value as string;
}

function renderProviderList(): void {
  const cfg = loadConfig();
  const profile = getActiveProfile(cfg);
  const entries = Object.entries(profile.providers);
  if (entries.length === 0) {
    p.log.warn("(无 provider) 用主菜单添加一个");
    return;
  }
  const rows = entries.map(([id, p]) => ({
    id: profile.activeProvider === id ? kleur.green("●") + " " + id : "  " + id,
    type: p.type,
    name: p.displayName ?? kleur.dim("(未命名)"),
    key: p.apiKey ? maskKey(p.apiKey) : kleur.dim("(空)"),
  }));
  const table = renderTable(
    [
      { key: "id", header: "ID" },
      { key: "type", header: "类型" },
      { key: "name", header: "显示名" },
      { key: "key", header: "Key" },
    ],
    rows
  );
  console.log(table);
  console.log(
    kleur.dim(
      `profile=${cfg.activeProfile} · ${getConfigPath()}`
    )
  );
}

async function actionTest(): Promise<void> {
  const id = await pickProvider("测试");
  if (!id) return;
  const cfg = loadConfig();
  const entry = getActiveProfile(cfg).providers[id];
  const impl = getProvider(entry.type);
  if (!impl) {
    p.log.error(`未实现 provider type: ${entry.type}`);
    return;
  }
  const spinner = p.spinner();
  spinner.start(`测试 ${id}`);
  const res = await impl.validate(entry);
  if (res.ok) {
    spinner.stop(`${kleur.green("✓")} 连通  latency=${res.latencyMs ?? "?"}ms  ${res.message ?? ""}`);
  } else {
    spinner.stop(`${kleur.red("✗")} 失败  ${res.message ?? ""}`, 1);
  }
}

async function actionUse(): Promise<void> {
  const id = await pickProvider("切换");
  if (!id) return;
  const cfg = loadConfig();
  useProvider(cfg, id);
  saveConfig(cfg);
  p.log.success(`当前 provider = ${kleur.bold(id)}`);
}

async function actionRemove(): Promise<void> {
  const id = await pickProvider("移除");
  if (!id) return;
  const confirmed = checkCancel(
    await p.confirm({
      message: `确认移除 "${id}"？`,
      initialValue: false,
    })
  );
  if (!confirmed) return;
  const cfg = loadConfig();
  removeProvider(cfg, id);
  saveConfig(cfg);
  p.log.success(`已移除 ${kleur.bold(id)}`);
}

async function actionOpenConfig(): Promise<void> {
  const p2 = getConfigPath();
  console.log(kleur.dim("配置文件路径："));
  console.log(kleur.cyan(p2));
  console.log(
    kleur.dim("可在编辑器中打开手工修改；主站读配置无需重启。")
  );
}

export async function runMainMenu(): Promise<void> {
  const cfg = loadConfig();
  const profile = getActiveProfile(cfg);
  const count = Object.keys(profile.providers).length;

  p.intro(kleur.bold("shengtu-tool") + kleur.dim(" · 图像 Provider 工具箱"));
  p.log.info(
    `当前 profile：${kleur.bold(cfg.activeProfile)}  ·  ${count} 个 provider  ·  激活：${kleur.bold(profile.activeProvider ?? "(无)")}`
  );

  while (true) {
    const action = checkCancel(
      await p.select({
        message: "想做什么？",
        options: [
          { value: "add", label: "添加 Provider" },
          { value: "list", label: "列出 Provider" },
          { value: "test", label: "测试连通性" },
          { value: "use", label: "切换当前 Provider" },
          { value: "remove", label: "移除 Provider" },
          { value: "config", label: "查看配置文件路径" },
          { value: "exit", label: kleur.dim("退出") },
        ],
      })
    ) as string;

    if (action === "exit") {
      p.outro("再见");
      return;
    }
    try {
      switch (action) {
        case "add":
          await runAddWizard();
          break;
        case "list":
          renderProviderList();
          break;
        case "test":
          await actionTest();
          break;
        case "use":
          await actionUse();
          break;
        case "remove":
          await actionRemove();
          break;
        case "config":
          await actionOpenConfig();
          break;
      }
    } catch (err) {
      p.log.error(err instanceof Error ? err.message : String(err));
    }
    console.log();
  }
}
