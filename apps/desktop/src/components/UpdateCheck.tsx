import { useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 检查更新 · 使用 tauri-plugin-updater
 * 走 GitHub Releases 的 latest.json
 */

type State =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "no-update"; currentVersion: string }
  | {
      kind: "available";
      currentVersion: string;
      latestVersion: string;
      notes?: string;
    }
  | { kind: "downloading"; percent: number }
  | { kind: "installing" }
  | { kind: "error"; message: string };

export function UpdateCheck({ currentVersion }: { currentVersion: string }) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function checkForUpdates(silent = false) {
    setState({ kind: "checking" });
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (!update) {
        setState({ kind: "no-update", currentVersion });
        if (!silent) toast.success("已是最新版本");
      } else {
        setState({
          kind: "available",
          currentVersion,
          latestVersion: update.version,
          notes: update.body ?? undefined,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ kind: "error", message });
      if (!silent) {
        toast.error("检查更新失败", { description: message });
      }
    }
  }

  async function doInstall() {
    if (state.kind !== "available") return;
    setState({ kind: "downloading", percent: 0 });
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (!update) throw new Error("已无可用更新");

      let totalBytes = 0;
      let downloadedBytes = 0;
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            totalBytes = event.data.contentLength ?? 0;
            break;
          case "Progress":
            downloadedBytes += event.data.chunkLength;
            if (totalBytes > 0) {
              setState({
                kind: "downloading",
                percent: Math.min(
                  100,
                  Math.floor((downloadedBytes / totalBytes) * 100)
                ),
              });
            }
            break;
          case "Finished":
            setState({ kind: "installing" });
            break;
        }
      });

      // 安装完成，弹出重启提示
      const shouldRestart = confirm("更新已安装。现在重启应用生效？");
      if (shouldRestart) {
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ kind: "error", message });
      toast.error("更新失败", { description: message });
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-[var(--color-text-muted)]" />
            <span className="text-sm font-medium">检查更新</span>
          </div>
          <p className="mt-0.5 text-xs text-[var(--color-text-subtle)]">
            当前版本 v{currentVersion} · 走 GitHub Releases
          </p>
        </div>
        {state.kind === "idle" || state.kind === "no-update" || state.kind === "error" ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => checkForUpdates(false)}
          >
            <RefreshCw className="size-3.5" />
            检查
          </Button>
        ) : state.kind === "checking" ? (
          <Button size="sm" variant="outline" disabled>
            <Loader2 className="size-3.5 animate-spin" />
            检查中…
          </Button>
        ) : state.kind === "available" ? (
          <Button size="sm" onClick={doInstall}>
            <Download className="size-3.5" />
            升级到 v{state.latestVersion}
          </Button>
        ) : state.kind === "downloading" ? (
          <Button size="sm" variant="outline" disabled>
            <Loader2 className="size-3.5 animate-spin" />
            下载中 {state.percent}%
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled>
            <Loader2 className="size-3.5 animate-spin" />
            安装中…
          </Button>
        )}
      </div>

      {state.kind === "no-update" && (
        <div className="flex items-center gap-1.5 text-xs text-[var(--color-success)]">
          <CheckCircle2 className="size-3.5" />
          已是最新版本
        </div>
      )}

      {state.kind === "available" && (
        <div className="rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
          <div className="mb-1 text-xs font-medium">
            🎉 有新版本 · v{state.currentVersion} → v{state.latestVersion}
          </div>
          {state.notes && (
            <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--color-text-muted)]">
              {state.notes}
            </pre>
          )}
        </div>
      )}

      {state.kind === "downloading" && (
        <div className="h-1 overflow-hidden rounded-full bg-[var(--color-bg)]">
          <div
            className="h-full bg-gradient-to-r from-[#7c3aed] to-[#ec4899] transition-all"
            style={{ width: `${state.percent}%` }}
          />
        </div>
      )}

      {state.kind === "error" && (
        <div className="rounded-[var(--radius)] border border-[var(--color-danger)]/40 bg-[color-mix(in_srgb,var(--color-danger)_8%,transparent)] px-3 py-2 text-xs text-[var(--color-danger)]">
          {state.message}
        </div>
      )}
    </div>
  );
}
