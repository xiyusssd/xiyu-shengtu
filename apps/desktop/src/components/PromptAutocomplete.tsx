import { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getSuggestions,
  type PromptSuggestion,
} from "@/lib/promptSuggestions";

/**
 * Textarea 焦点态下按 ⌘/ 或 Ctrl+/ 呼出候选
 * 也在初始为空时自动展示 · 顶多显示 6 条
 */

export function PromptAutocomplete({
  anchorRef,
  onPick,
  query,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  onPick: (prompt: string) => void;
  query: string;
}) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState<PromptSuggestion[]>([]);
  const [cursor, setCursor] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 加载候选
  useEffect(() => {
    getSuggestions().then(setAll);
  }, []);

  // 快捷键 ⌘/ 或 Ctrl+/ 打开
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      // 只在焦点在锚点上时响应
      if (target !== anchorRef.current) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      } else if (open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        setCursor((c) =>
          Math.max(0, Math.min(all.length - 1, c + (e.key === "ArrowDown" ? 1 : -1)))
        );
      } else if (open && e.key === "Enter") {
        const item = filtered[cursor];
        if (item) {
          e.preventDefault();
          onPick(item.prompt);
          setOpen(false);
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cursor, all.length]);

  // 点外部关闭
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (
        !wrapRef.current?.contains(e.target as Node) &&
        e.target !== anchorRef.current
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [anchorRef]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let out = all;
    if (q) {
      out = out.filter(
        (s) =>
          s.label.toLowerCase().includes(q) ||
          s.prompt.toLowerCase().includes(q)
      );
    }
    return out.slice(0, 6);
  }, [all, query]);

  useEffect(() => {
    setCursor(0);
  }, [query, open]);

  if (!open || filtered.length === 0) return null;

  return (
    <div
      ref={wrapRef}
      className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-bg)] shadow-xl"
    >
      <div className="border-b border-[var(--color-border)] px-3 py-1.5 text-[10px] text-[var(--color-text-subtle)]">
        建议 · ↑↓ 选，Enter 填入，Esc 关闭
      </div>
      {filtered.map((s, i) => (
        <button
          key={i}
          type="button"
          onMouseMove={() => setCursor(i)}
          onClick={() => {
            onPick(s.prompt);
            setOpen(false);
          }}
          className={cn(
            "flex w-full items-start gap-2 px-3 py-2 text-left text-xs",
            cursor === i
              ? "bg-[var(--color-panel)] text-[var(--color-text)]"
              : "text-[var(--color-text-muted)]"
          )}
        >
          {s.source === "template" ? (
            <Bookmark className="mt-0.5 size-3 shrink-0 text-[var(--color-text-subtle)]" />
          ) : (
            <Clock className="mt-0.5 size-3 shrink-0 text-[var(--color-text-subtle)]" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate">{s.label}</div>
            {s.hint && (
              <div className="truncate text-[10px] text-[var(--color-text-subtle)]">
                {s.hint}
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
