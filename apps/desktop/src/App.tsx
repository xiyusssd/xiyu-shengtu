import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { on as busOn } from "@/lib/eventBus";
import { AppLogo } from "@/components/AppLogo";
import { CommandPalette } from "@/components/CommandPalette";
import { DashboardView } from "@/components/DashboardView";
import { OnboardingScreen } from "@/components/OnboardingScreen";
import { ProfileSwitcher } from "@/components/ProfileSwitcher";
import { ShortcutsHelp } from "@/components/ShortcutsHelp";
import { Toaster } from "@/components/ui/toaster";
import { BatchWorkbench } from "@/components/BatchWorkbench";
import { ProviderManager } from "@/components/ProviderManager";
import { GalleryView } from "@/components/GalleryView";
import { SettingsView } from "@/components/SettingsView";
import { cn } from "@/lib/utils";
import { getPreferences, readConfig } from "@/lib/tauri";
import type { AvailableType } from "@/lib/types";

type Tab = "generate" | "providers" | "gallery" | "dashboard" | "settings";
type Theme = "light" | "dark" | "system";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "generate", label: "批量生图" },
  { id: "providers", label: "Provider" },
  { id: "gallery", label: "图库" },
  { id: "dashboard", label: "统计" },
  { id: "settings", label: "设置" },
];

/** 把主题应用到 <html> 的 data-theme（配合 tailwind darkMode: "class"）*/
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
    root.classList.remove("light", "dark");
  } else {
    root.setAttribute("data-theme", theme);
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  }
}

export function App() {
  const [tab, setTab] = useState<Tab>("generate");
  const [theme, setTheme] = useState<Theme>("system");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);
  const [availableTypes, setAvailableTypes] = useState<AvailableType[]>([]);
  const [updateBadge, setUpdateBadge] = useState<string | null>(null);

  // 启动 5 秒后静默检查更新（不打扰）
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (update?.available) {
          setUpdateBadge(update.version);
        }
      } catch {
        /* 网络不通 / 私有仓库时静默失败 */
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  const checkOnboarding = useCallback(async () => {
    try {
      const cfg = await readConfig();
      setAvailableTypes(cfg.availableTypes);
      setNeedsOnboarding(cfg.providers.length === 0);
    } catch {
      setNeedsOnboarding(false);
    }
  }, []);

  useEffect(() => {
    checkOnboarding();
  }, [checkOnboarding]);

  // 启动时从 Rust 侧读主题
  useEffect(() => {
    (async () => {
      try {
        const prefs = await getPreferences();
        const initial = (prefs.theme as Theme) ?? "system";
        setTheme(initial);
        applyTheme(initial);
      } catch {
        applyTheme("system");
      }
    })();
  }, []);

  // 监听菜单事件切 tab
  useEffect(() => {
    const stop = listen<string>("menu:navigate", (evt) => {
      const target = evt.payload as Tab;
      if (["generate", "providers", "gallery", "settings"].includes(target)) {
        setTab(target);
      }
    });
    return () => {
      stop.then((fn) => fn()).catch(() => {});
    };
  }, []);

  // 从 Gallery 一键复用 → 切到生图 tab
  useEffect(() => {
    const off = busOn("reuse-prompt", () => setTab("generate"));
    return off;
  }, []);

  // 命令面板导航
  useEffect(() => {
    const off = busOn<string>("cmd:navigate", (target) => {
      if (["generate", "providers", "gallery", "settings"].includes(target)) {
        setTab(target as Tab);
      }
    });
    return off;
  }, []);

  // 全局 ⌘K / Ctrl+K + F1 帮助
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (
        e.key === "F1" ||
        ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "?")
      ) {
        e.preventDefault();
        setHelpOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  function handleThemeChange(next: Theme) {
    setTheme(next);
    applyTheme(next);
  }

  // 初次未加载完前，避免闪现主界面
  if (needsOnboarding === null) {
    return (
      <div className="grid h-screen place-items-center text-xs text-[var(--color-text-subtle)]">
        加载中…
      </div>
    );
  }

  if (needsOnboarding) {
    return (
      <>
        <OnboardingScreen
          availableTypes={availableTypes}
          onComplete={() => setNeedsOnboarding(false)}
        />
        <Toaster />
      </>
    );
  }

  return (
    <>
      <div className="flex h-screen flex-col">
        <header
          className="relative flex items-center justify-between border-b border-[var(--color-border)] bg-gradient-to-b from-[var(--color-panel)] to-[var(--color-bg)] pl-24 pr-3 py-2"
          data-tauri-drag-region
        >
          <div className="flex items-center gap-2" data-tauri-drag-region>
            <AppLogo size={22} />
            <span className="text-xs font-semibold tracking-tight">
              xiyu-shengtu
            </span>
          </div>

          <div className="flex items-center gap-1 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-bg)] p-0.5">
            {TABS.map((t) => (
              <TabButton
                key={t.id}
                active={tab === t.id}
                onClick={() => {
                  setTab(t.id);
                  if (t.id === "settings") setUpdateBadge(null);
                }}
                label={t.label}
                badge={t.id === "settings" && updateBadge ? updateBadge : null}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <ProfileSwitcher />
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              title="打开命令面板"
              className="inline-flex items-center gap-1 text-[10px] text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)]"
            >
              <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-panel)] px-1 py-0.5 tabular-nums">
                ⌘K
              </kbd>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-hidden">
          <div className={tab === "generate" ? "h-full" : "hidden"}>
            <BatchWorkbench />
          </div>
          <div className={tab === "providers" ? "h-full" : "hidden"}>
            <ProviderManager />
          </div>
          <div className={tab === "gallery" ? "h-full" : "hidden"}>
            <GalleryView />
          </div>
          <div className={tab === "dashboard" ? "h-full" : "hidden"}>
            <DashboardView />
          </div>
          <div className={tab === "settings" ? "h-full" : "hidden"}>
            <SettingsView
              currentTheme={theme}
              onThemeChange={handleThemeChange}
            />
          </div>
        </main>
      </div>
      <Toaster />
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}
    </>
  );
}

function TabButton({
  active,
  onClick,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: string | null;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative rounded-[var(--radius-sm)] px-3.5 py-1 text-xs font-medium transition-all",
        active
          ? "bg-[var(--color-panel)] text-[var(--color-text)] shadow-sm"
          : "text-[var(--color-text-muted)] hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-text)]"
      )}
    >
      {label}
      {badge && (
        <span
          className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-[var(--color-danger)]"
          title={`有新版本 v${badge}`}
        />
      )}
    </button>
  );
}
