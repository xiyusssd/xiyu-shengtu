import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bookmark,
  Images,
  LayoutGrid,
  Search,
  Settings2,
  Sparkles,
  Zap,
} from "lucide-react";
import { emit as busEmit } from "@/lib/eventBus";
import { activateProvider, listHistory, listTemplates, readConfig } from "@/lib/tauri";
import { cn } from "@/lib/utils";

/**
 * ⌘K 命令面板
 * 收集：4 个 tab 跳转 + 所有 provider（切换）+ 所有模板（填入 prompt）+ 最近 50 条历史（回填 prompt）
 */

interface Item {
  id: string;
  kind: "tab" | "provider" | "template" | "history";
  label: string;
  hint?: string;
  keywords: string;
  action: () => void | Promise<void>;
  icon: React.ReactNode;
}

const TABS: Array<{ id: string; label: string; icon: React.ReactNode }> = [
  { id: "generate", label: "批量生图", icon: <Sparkles className="size-4" /> },
  { id: "providers", label: "Provider 管理", icon: <LayoutGrid className="size-4" /> },
  { id: "gallery", label: "图库", icon: <Images className="size-4" /> },
  { id: "settings", label: "设置", icon: <Settings2 className="size-4" /> },
];

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 加载数据
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const buckets: Item[] = TABS.map((t) => ({
        id: `tab:${t.id}`,
        kind: "tab",
        label: t.label,
        hint: "跳转到" + t.label,
        keywords: t.label + " " + t.id,
        icon: t.icon,
        action: () => busEmit("cmd:navigate", t.id),
      }));

      try {
        const [cfg, templates, history] = await Promise.all([
          readConfig(),
          listTemplates(),
          listHistory(),
        ]);
        if (cancelled) return;
        for (const p of cfg.providers) {
          const activeMark = p.id === cfg.activeProviderId ? "（当前）" : "";
          buckets.push({
            id: `provider:${p.id}`,
            kind: "provider",
            label: (p.displayName || p.id) + activeMark,
            hint: `切换到 ${p.type} · ${p.id}`,
            keywords: `${p.id} ${p.type} ${p.displayName ?? ""}`,
            icon: <Zap className="size-4 text-[var(--color-text-muted)]" />,
            action: async () => {
              if (p.id !== cfg.activeProviderId) {
                await activateProvider(p.id);
              }
            },
          });
        }
        for (const t of templates.slice(0, 50)) {
          buckets.push({
            id: `template:${t.id}`,
            kind: "template",
            label: t.name,
            hint: t.prompt.slice(0, 60),
            keywords: `${t.name} ${t.prompt}`,
            icon: <Bookmark className="size-4 text-[var(--color-text-muted)]" />,
            action: () =>
              busEmit("reuse-prompt", { prompt: t.prompt }),
          });
        }
        for (const h of history.slice(0, 50)) {
          buckets.push({
            id: `history:${h.id}`,
            kind: "history",
            label: h.prompt.slice(0, 60) || "(空)",
            hint: `${h.providerType} · ${new Date(h.createdAt).toLocaleDateString()}`,
            keywords: `${h.prompt} ${h.providerId} ${h.providerType}`,
            icon: <Images className="size-4 text-[var(--color-text-muted)]" />,
            action: () =>
              busEmit("reuse-prompt", { prompt: h.prompt }),
          });
        }
        setItems(buckets);
      } catch {
        setItems(buckets);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => it.keywords.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  // 保证 cursor 在可见范围内滚动
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-idx="${cursor}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  function runItem(item: Item) {
    Promise.resolve(item.action()).finally(() => onClose());
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[cursor];
      if (item) runItem(item);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-start bg-black/40 backdrop-blur-sm px-4 pt-24"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <Search className="size-4 text-[var(--color-text-subtle)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="跳 Tab、切 Provider、找模板、找历史…"
            className="flex-1 bg-transparent text-sm placeholder:text-[var(--color-text-subtle)] focus:outline-none"
          />
          <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-panel)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-subtle)]">
            ESC
          </kbd>
        </div>
        <div ref={listRef} className="max-h-96 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-[var(--color-text-subtle)]">
              没找到匹配「{query}」
            </div>
          ) : (
            filtered.map((item, idx) => (
              <button
                key={item.id}
                data-idx={idx}
                type="button"
                onMouseMove={() => setCursor(idx)}
                onClick={() => runItem(item)}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-2 text-left text-sm",
                  cursor === idx
                    ? "bg-[var(--color-panel)] text-[var(--color-text)]"
                    : "text-[var(--color-text-muted)]"
                )}
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-[var(--color-panel-hover)]">
                  {item.icon}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[var(--color-text)]">
                    {item.label}
                  </span>
                  {item.hint && (
                    <span className="truncate text-[11px] text-[var(--color-text-subtle)]">
                      {item.hint}
                    </span>
                  )}
                </div>
                <ArrowRight
                  className={cn(
                    "size-3 shrink-0 opacity-0 transition-opacity",
                    cursor === idx && "opacity-100"
                  )}
                />
              </button>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-2 text-[10px] text-[var(--color-text-subtle)]">
          <span>↑ ↓ 移动 · Enter 执行</span>
          <span>{filtered.length} 项</span>
        </div>
      </div>
    </div>
  );
}
