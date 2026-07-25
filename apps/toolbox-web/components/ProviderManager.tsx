"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppLogo } from "./AppLogo";
import { ProviderCard } from "./ProviderCard";
import { ProviderEditor } from "./ProviderEditor";
import { AddProviderDialog } from "./AddProviderDialog";
import type { ConfigSnapshot, ProviderRow } from "@/lib/types";

export function ProviderManager() {
  const [snap, setSnap] = useState<ConfigSnapshot | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const reload = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await fetch("/api/config", { cache: "no-store" });
      const json = (await res.json()) as ConfigSnapshot | { error: string };
      if ("error" in json) throw new Error(json.error);
      setSnap(json);
      // 保持当前选中；如果选中已被删除，切到激活的 provider 或第一个
      setSelectedId((cur) => {
        if (cur && json.providers.some((p) => p.id === cur)) return cur;
        return json.activeProviderId ?? json.providers[0]?.id ?? null;
      });
    } catch (err) {
      toast.error("加载配置失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    reload(true);
  }, [reload]);

  const selected = snap?.providers.find((p) => p.id === selectedId) ?? null;

  const activate = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(
          `/api/providers/${encodeURIComponent(id)}/activate`,
          { method: "POST" }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        toast.success(`已切换到 "${id}"`);
        await reload(true);
      } catch (err) {
        toast.error("切换失败", {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [reload]
  );

  async function duplicate(row: ProviderRow) {
    let base = row.id.replace(/-copy(-\d+)?$/, "");
    let candidate = `${base}-copy`;
    let n = 2;
    const existing = new Set(snap?.providers.map((p) => p.id) ?? []);
    while (existing.has(candidate)) {
      candidate = `${base}-copy-${n++}`;
    }
    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: candidate,
          type: row.type,
          displayName: row.displayName ? row.displayName + " 副本" : undefined,
          endpoint: row.endpoint,
          model: row.model,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      toast.success(`已复制为 "${candidate}"`);
      setSelectedId(candidate);
      await reload(true);
    } catch (err) {
      toast.error("复制失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (loading || !snap) {
    return (
      <div className="grid h-screen place-items-center text-[var(--color-text-muted)]">
        <div className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          加载中…
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-screen flex-col">
        {/* 顶栏 */}
        <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-2.5">
          <div className="flex items-center gap-3">
            <AppLogo size={28} />
            <div>
              <div className="text-sm font-semibold leading-tight">
                Toolbox
              </div>
              <div className="text-[11px] leading-tight text-[var(--color-text-subtle)]">
                Provider 渠道管理
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden text-xs text-[var(--color-text-subtle)] sm:block">
              profile ·{" "}
              <b className="font-medium text-[var(--color-text)]">
                {snap.activeProfile}
              </b>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => reload()}
              title="刷新"
            >
              <RefreshCw
                className={refreshing ? "size-4 animate-spin" : "size-4"}
              />
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="size-3.5" />
              添加 Provider
            </Button>
          </div>
        </header>

        {/* 主体：左列表 + 右编辑 */}
        <div className="flex flex-1 overflow-hidden">
          {/* 左栏 */}
          <aside className="flex w-72 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg)]">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-subtle)]">
                Providers · {snap.providers.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-3">
              {snap.providers.length === 0 ? (
                <div className="mt-8 flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-strong)] p-6 text-center">
                  <div className="text-sm text-[var(--color-text-muted)]">
                    还没有 Provider
                  </div>
                  <Button size="sm" onClick={() => setAddOpen(true)}>
                    <Plus className="size-3.5" />
                    添加第一个
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {snap.providers.map((p) => (
                    <ProviderCard
                      key={p.id}
                      provider={p}
                      isActive={p.id === snap.activeProviderId}
                      isSelected={p.id === selectedId}
                      onSelect={() => setSelectedId(p.id)}
                      onActivate={(e) => {
                        e.stopPropagation();
                        if (p.id !== snap.activeProviderId) activate(p.id);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </aside>

          {/* 右栏 */}
          <main className="flex-1 overflow-hidden bg-[var(--color-bg)]">
            {selected ? (
              <ProviderEditor
                key={selected.id}
                provider={selected}
                isActive={selected.id === snap.activeProviderId}
                onChanged={() => reload(true)}
                onActivate={() => activate(selected.id)}
                onDelete={() => {
                  setSelectedId(null);
                  reload(true);
                }}
                onDuplicate={() => duplicate(selected)}
              />
            ) : (
              <div className="grid h-full place-items-center text-sm text-[var(--color-text-subtle)]">
                {snap.providers.length === 0
                  ? "从左侧添加你的第一个 Provider"
                  : "从左侧选择一个 Provider"}
              </div>
            )}
          </main>
        </div>

        {/* 底栏 */}
        <footer className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-2 text-[11px] text-[var(--color-text-subtle)]">
          <span className="truncate">
            {snap.configPath}
          </span>
          <span className="shrink-0">
            当前 ·{" "}
            <b className="font-medium text-[var(--color-text)]">
              {snap.activeProviderId ?? "(未设置)"}
            </b>
          </span>
        </footer>
      </div>

      {addOpen && (
        <AddProviderDialog
          availableTypes={snap.availableTypes}
          existingIds={snap.providers.map((p) => p.id)}
          onClose={() => setAddOpen(false)}
          onCreated={(id) => {
            setAddOpen(false);
            setSelectedId(id);
            reload(true);
          }}
        />
      )}
    </>
  );
}
