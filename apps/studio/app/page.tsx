import { AppLogo } from "@/components/AppLogo";
import { BatchWorkbench } from "@/components/BatchWorkbench";
import { loadConfig } from "@xiyu-shengtu/toolbox-core";

export const dynamic = "force-dynamic";

type ProviderRow = {
  id: string;
  type: string;
  displayName?: string;
  hasKey: boolean;
};

async function loadProvidersServerSide(): Promise<{
  activeProfile: string;
  activeProviderId?: string;
  providers: ProviderRow[];
}> {
  try {
    const cfg = loadConfig();
    const profile = cfg.profiles[cfg.activeProfile];
    const providers = Object.entries(profile?.providers ?? {}).map(
      ([id, p]) => ({
        id,
        type: p.type,
        displayName: p.displayName,
        hasKey: Boolean(p.apiKey),
      })
    );
    return {
      activeProfile: cfg.activeProfile,
      activeProviderId: profile?.activeProvider,
      providers,
    };
  } catch (err) {
    console.error("loadConfig failed:", err);
    return { activeProfile: "personal", providers: [] };
  }
}

export default async function Home() {
  const cfg = await loadProvidersServerSide();
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-8 sm:px-8 sm:py-12">
      <header className="mb-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AppLogo size={34} />
          <div>
            <h1 className="text-base font-semibold leading-tight tracking-tight">
              ImageGen Studio
            </h1>
            <p className="text-xs leading-tight text-[var(--color-text-subtle)]">
              极简生图工作台
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
          <span className="hidden sm:inline">
            profile · <b className="font-medium text-[var(--color-text)]">{cfg.activeProfile}</b>
          </span>
          <span className="hidden sm:inline text-[var(--color-border-strong)]">·</span>
          <span>
            {cfg.providers.length} 个 provider
          </span>
        </div>
      </header>

      <BatchWorkbench
        providers={cfg.providers}
        activeProviderId={cfg.activeProviderId}
      />

      <footer className="mt-16 pt-6 border-t border-[var(--color-border)] text-xs text-[var(--color-text-subtle)]">
        <p>
          用 <code className="rounded bg-[var(--color-panel)] px-1.5 py-0.5">shengtu-tool</code> 管理 Provider ·{" "}
          <span className="text-[var(--color-text-muted)]">⌘/Ctrl + Enter</span> 生成
        </p>
      </footer>
    </main>
  );
}
