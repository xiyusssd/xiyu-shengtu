#!/usr/bin/env node
import { Command } from "commander";
import kleur from "kleur";
import {
  addProvider,
  getActiveProfile,
  getActiveProvider,
  getConfigPath,
  loadConfig,
  maskKey,
  removeProvider,
  saveConfig,
  useProfile,
  useProvider,
} from "@xiyu-shengtu/toolbox-core";
import { getProvider, listProviders } from "@xiyu-shengtu/provider-core";
import {
  getTemplate,
  PROVIDER_TEMPLATES,
} from "@xiyu-shengtu/toolbox-core/templates";
import { runAddWizard, runMainMenu } from "./interactive";
import { renderTable } from "./table";

const program = new Command();

program
  .name("shengtu-tool")
  .description(
    "xiyu-shengtu 工具箱 CLI · 管理 API Provider 配置\n\n无参数直接运行进入交互菜单"
  )
  .version("0.1.0");

program
  .command("config-path")
  .description("显示当前配置文件路径")
  .action(() => {
    console.log(getConfigPath());
  });

const providerCmd = program.command("provider").description("Provider 管理");

providerCmd
  .command("list")
  .description("列出当前 profile 的 Provider（表格形式）")
  .action(() => {
    const cfg = loadConfig();
    const profile = getActiveProfile(cfg);
    const entries = Object.entries(profile.providers);
    if (entries.length === 0) {
      console.log(
        kleur.yellow("(无 provider)") +
          " 用 " +
          kleur.cyan("shengtu-tool") +
          " 进入交互菜单添加"
      );
      return;
    }
    const rows = entries.map(([id, p]) => ({
      id:
        profile.activeProvider === id
          ? kleur.green("●") + " " + id
          : "  " + id,
      type: p.type,
      name: p.displayName ?? kleur.dim("(未命名)"),
      key: p.apiKey ? maskKey(p.apiKey) : kleur.dim("(空)"),
    }));
    console.log(
      renderTable(
        [
          { key: "id", header: "ID" },
          { key: "type", header: "类型" },
          { key: "name", header: "显示名" },
          { key: "key", header: "Key" },
        ],
        rows
      )
    );
    console.log(
      kleur.dim(`profile=${cfg.activeProfile} · ${getConfigPath()}`)
    );
  });

providerCmd
  .command("add")
  .description("添加 Provider（无参数进入向导；带 --id 走非交互模式）")
  .option("--id <id>", "Provider ID（在配置中唯一）")
  .option("--type <type>", "Provider 类型，如 mock / openai-compat")
  .option("--name <name>", "显示名")
  .option("--endpoint <url>", "接口地址")
  .option("--model <name>", "模型名")
  .option("--api-key <key>", "API Key")
  .action(async (opts: {
    id?: string;
    type?: string;
    name?: string;
    endpoint?: string;
    model?: string;
    apiKey?: string;
  }) => {
    // 无 --id 或 --type 就走向导
    if (!opts.id || !opts.type) {
      await runAddWizard();
      return;
    }
    const tpl = getTemplate(opts.type);
    if (!tpl) {
      console.error(kleur.red(`未知 provider type: ${opts.type}`));
      console.error(
        kleur.dim(`可选：${PROVIDER_TEMPLATES.map((t) => t.type).join(", ")}`)
      );
      process.exit(1);
    }
    const cfg = loadConfig();
    addProvider(cfg, opts.id, {
      type: opts.type,
      displayName: opts.name,
      endpoint: opts.endpoint,
      model: opts.model,
      apiKey: opts.apiKey,
    });
    saveConfig(cfg);
    console.log(kleur.green(`✓ 已添加 provider "${opts.id}" (${opts.type})`));
  });

providerCmd
  .command("remove <id>")
  .description("移除 Provider")
  .action((id: string) => {
    const cfg = loadConfig();
    removeProvider(cfg, id);
    saveConfig(cfg);
    console.log(kleur.green(`✓ 已移除 provider "${id}"`));
  });

providerCmd
  .command("use <id>")
  .description("切换当前激活 Provider")
  .action((id: string) => {
    const cfg = loadConfig();
    useProvider(cfg, id);
    saveConfig(cfg);
    console.log(kleur.green(`✓ 当前 provider = ${id}`));
  });

providerCmd
  .command("test [id]")
  .description("测试 Provider 连通性（不填 id 则测当前激活）")
  .action(async (id?: string) => {
    const cfg = loadConfig();
    const profile = getActiveProfile(cfg);
    const targetId = id ?? profile.activeProvider;
    if (!targetId || !profile.providers[targetId]) {
      console.error(kleur.red("没有可测试的 provider"));
      process.exit(1);
    }
    const entry = profile.providers[targetId];
    const impl = getProvider(entry.type);
    if (!impl) {
      console.error(kleur.red(`未实现的 provider type: ${entry.type}`));
      process.exit(1);
    }
    console.log(kleur.dim(`测试 ${targetId} (${entry.type})…`));
    const res = await impl.validate(entry);
    if (res.ok) {
      console.log(
        kleur.green(
          `✓ OK  latency=${res.latencyMs ?? "?"}ms  ${res.message ?? ""}`
        )
      );
    } else {
      console.log(
        kleur.red(
          `✗ FAIL  latency=${res.latencyMs ?? "?"}ms  ${res.message ?? ""}`
        )
      );
      process.exit(2);
    }
  });

providerCmd
  .command("types")
  .description("列出可用的 Provider 类型")
  .action(() => {
    const implMap = new Set(listProviders().map((p) => p.id));
    for (const tpl of PROVIDER_TEMPLATES) {
      const impl = implMap.has(tpl.type);
      const marker = impl
        ? kleur.green("●")
        : kleur.dim("○");
      const hint = impl
        ? kleur.dim("(CLI 与桌面均可用)")
        : kleur.yellow("(仅桌面 App 支持生图)");
      console.log(
        `  ${marker} ${kleur.bold(tpl.type.padEnd(18))} ${tpl.displayName}  ${hint}`
      );
    }
  });

const profileCmd = program.command("profile").description("Profile 管理");

profileCmd
  .command("list")
  .description("列出所有 profile")
  .action(() => {
    const cfg = loadConfig();
    for (const name of Object.keys(cfg.profiles)) {
      const active = cfg.activeProfile === name ? kleur.green("●") : " ";
      const count = Object.keys(cfg.profiles[name]?.providers ?? {}).length;
      console.log(`  ${active} ${kleur.bold(name)}  (${count} providers)`);
    }
  });

profileCmd
  .command("use <name>")
  .description("切换 profile")
  .action((name: string) => {
    const cfg = loadConfig();
    useProfile(cfg, name);
    saveConfig(cfg);
    console.log(kleur.green(`✓ 当前 profile = ${name}`));
  });

program
  .command("doctor")
  .description("自检：配置目录、当前 provider 是否可用")
  .action(async () => {
    const cfg = loadConfig();
    console.log(kleur.bold("配置目录："), getConfigPath());
    console.log(kleur.bold("当前 profile："), cfg.activeProfile);
    const active = getActiveProvider(cfg);
    if (!active) {
      console.log(kleur.yellow("当前 profile 无激活 provider"));
      return;
    }
    console.log(
      kleur.bold("当前 provider："),
      `${active.id} (${active.entry.type})`
    );
    const impl = getProvider(active.entry.type);
    if (!impl) {
      console.log(kleur.red(`未实现的 provider type: ${active.entry.type}`));
      return;
    }
    const res = await impl.validate(active.entry);
    console.log(
      res.ok ? kleur.green("✓ 连通") : kleur.red("✗ 连通失败"),
      res.message ?? ""
    );
  });

// 无参数进入交互菜单
async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    await runMainMenu();
    return;
  }
  await program.parseAsync();
}

main().catch((err) => {
  console.error(kleur.red("错误："), err instanceof Error ? err.message : err);
  process.exit(1);
});
