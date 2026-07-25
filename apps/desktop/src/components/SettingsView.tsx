import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Folder, Info, Moon, Sun, SunMoon } from "lucide-react";
import { AppLogo } from "@/components/AppLogo";
import { UpdateCheck } from "@/components/UpdateCheck";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  getPreferences,
  openConfigFolder,
  readConfig,
  setPreferences,
  type Preferences,
} from "@/lib/tauri";

type Theme = "light" | "dark" | "system";

const APP_VERSION = "0.1.0";

/**
 * 设置：主题切换 + 配置目录 + 关于
 */
export function SettingsView({
  currentTheme,
  onThemeChange,
}: {
  currentTheme: Theme;
  onThemeChange: (theme: Theme) => void;
}) {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [configPath, setConfigPath] = useState<string>("");
  const [totalProviders, setTotalProviders] = useState<number>(0);

  const reload = useCallback(async () => {
    try {
      const [preferences, cfg] = await Promise.all([
        getPreferences(),
        readConfig(),
      ]);
      setPrefs(preferences);
      setConfigPath(cfg.configPath);
      setTotalProviders(cfg.providers.length);
    } catch (err) {
      toast.error("加载设置失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function updateTheme(theme: Theme) {
    onThemeChange(theme);
    try {
      const next = { ...(prefs ?? {}), theme };
      await setPreferences(next);
      setPrefs(next);
    } catch (err) {
      toast.error("保存主题失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function updatePref<K extends keyof Preferences>(
    key: K,
    value: Preferences[K]
  ) {
    try {
      const patch = { [key]: value } as Preferences;
      await setPreferences(patch);
      setPrefs((prev) => ({ ...(prev ?? {}), [key]: value }));
    } catch (err) {
      toast.error("保存失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function openFolder() {
    try {
      await openConfigFolder();
    } catch (err) {
      toast.error("打开失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col gap-8 overflow-y-auto px-6 py-8">
      {/* 外观 */}
      <section className="flex flex-col gap-3">
        <div className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-subtle)]">
          外观
        </div>
        <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
          <Label>主题</Label>
          <div className="flex gap-2">
            <ThemeOption
              active={currentTheme === "light"}
              onClick={() => updateTheme("light")}
              icon={<Sun className="size-4" />}
              label="浅色"
            />
            <ThemeOption
              active={currentTheme === "dark"}
              onClick={() => updateTheme("dark")}
              icon={<Moon className="size-4" />}
              label="深色"
            />
            <ThemeOption
              active={currentTheme === "system"}
              onClick={() => updateTheme("system")}
              icon={<SunMoon className="size-4" />}
              label="跟随系统"
            />
          </div>
        </div>
      </section>

      {/* 网络 */}
      <section className="flex flex-col gap-3">
        <div className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-subtle)]">
          网络
        </div>
        <div className="grid gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="proxy">
              HTTP 代理{" "}
              <span className="text-[var(--color-text-subtle)]">
                · 空值 = 直连
              </span>
            </Label>
            <Input
              id="proxy"
              value={prefs?.httpProxy ?? ""}
              onChange={(e) =>
                setPrefs((p) => ({ ...(p ?? {}), httpProxy: e.target.value }))
              }
              onBlur={(e) => updatePref("httpProxy", e.target.value)}
              placeholder="http://127.0.0.1:7890 或 socks5://127.0.0.1:1080"
              className="font-mono text-[13px]"
            />
            <p className="text-[10px] text-[var(--color-text-subtle)]">
              企业内网 / 科学上网时填写。修改后立即生效于下次生图请求。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="timeout">请求超时（秒）</Label>
              <Input
                id="timeout"
                type="number"
                min={5}
                max={600}
                value={prefs?.requestTimeoutSecs ?? 120}
                onChange={(e) =>
                  setPrefs((p) => ({
                    ...(p ?? {}),
                    requestTimeoutSecs: Number(e.target.value) || 120,
                  }))
                }
                onBlur={(e) =>
                  updatePref(
                    "requestTimeoutSecs",
                    Math.max(5, Math.min(600, Number(e.target.value) || 120))
                  )
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="retry">失败重试（0-3 次）</Label>
              <Input
                id="retry"
                type="number"
                min={0}
                max={3}
                value={prefs?.retryCount ?? 0}
                onChange={(e) =>
                  setPrefs((p) => ({
                    ...(p ?? {}),
                    retryCount: Number(e.target.value) || 0,
                  }))
                }
                onBlur={(e) =>
                  updatePref(
                    "retryCount",
                    Math.max(0, Math.min(3, Number(e.target.value) || 0))
                  )
                }
              />
            </div>
          </div>
        </div>
      </section>

      {/* 存储 */}
      <section className="flex flex-col gap-3">
        <div className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-subtle)]">
          存储
        </div>
        <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Label>配置目录</Label>
              <p className="mt-1 truncate text-xs text-[var(--color-text-subtle)]">
                {configPath || "(加载中…)"}
              </p>
              <p className="mt-1 text-[11px] text-[var(--color-text-subtle)]">
                所有 Provider、模板、历史图片都在这里
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={openFolder}>
              <Folder className="size-3.5" />
              打开
            </Button>
          </div>
        </div>
      </section>

      {/* 更新 */}
      <section className="flex flex-col gap-3">
        <div className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-subtle)]">
          更新
        </div>
        <UpdateCheck currentVersion={APP_VERSION} />
      </section>

      {/* 关于 */}
      <section className="flex flex-col gap-3">
        <div className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-subtle)]">
          关于
        </div>
        <div className="flex items-center gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
          <AppLogo size={56} />
          <div className="flex-1">
            <div className="text-sm font-semibold">xiyu-shengtu</div>
            <div className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              极简批量生图工作台
            </div>
            <div className="mt-1 flex items-center gap-3 text-[11px] text-[var(--color-text-subtle)]">
              <span>v{APP_VERSION}</span>
              <span>·</span>
              <span>{totalProviders} providers</span>
              <span>·</span>
              <span>Tauri + Rust</span>
            </div>
          </div>
        </div>
        <div className="rounded-[var(--radius)] border border-dashed border-[var(--color-border)] bg-transparent p-3 text-[11px] leading-relaxed text-[var(--color-text-subtle)]">
          <div className="mb-1 inline-flex items-center gap-1 text-[var(--color-text-muted)]">
            <Info className="size-3" />
            提示
          </div>
          API Key 明文存储在 <code>config.json</code>，请勿把配置目录同步到公共云盘或 Git 仓库。
        </div>
      </section>
    </div>
  );
}

function ThemeOption({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-[var(--radius)] border px-3 py-2 text-xs font-medium transition-all",
        active
          ? "border-[var(--color-text)] bg-[var(--color-bg)] text-[var(--color-text)] shadow-sm"
          : "border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
