import { X } from "lucide-react";
import { STYLE_CATEGORIES } from "@/lib/styleTags";

/**
 * 风格标签弹层 · 点标签把英文片段追加到当前行 prompt
 */
export function StyleTagPicker({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (append: string) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
          <h2 className="text-sm font-semibold">风格标签 · 点击追加</h2>
          <button
            onClick={onClose}
            className="grid size-7 place-items-center rounded text-[var(--color-text-subtle)] hover:bg-[var(--color-panel)] hover:text-[var(--color-text)]"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
          {STYLE_CATEGORIES.map((cat) => (
            <section key={cat.name} className="flex flex-col gap-2">
              <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-subtle)]">
                {cat.name}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {cat.tags.map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    title={t.append}
                    onClick={() => onPick(t.append)}
                    className="rounded-full border border-[var(--color-border)] bg-[var(--color-panel)] px-2.5 py-1 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-text-muted)] hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-text)]"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
        <div className="border-t border-[var(--color-border)] bg-[var(--color-panel)] px-5 py-2 text-[10px] text-[var(--color-text-subtle)]">
          可连点多个 · 自动去重 · 追加到当前行提示词末尾
        </div>
      </div>
    </div>
  );
}
