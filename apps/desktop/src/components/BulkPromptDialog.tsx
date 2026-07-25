import { useMemo, useState } from "react";
import { FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

/**
 * 批量粘贴对话框：多行文本 → 每一行一个提示词
 * 支持策略：
 *   - "append" 追加到当前行末尾
 *   - "replace" 清空所有行后填入
 *   - "skip_empty" 忽略空行（勾选，默认开）
 */

export interface BulkPromptResult {
  prompts: string[];
  mode: "append" | "replace";
}

export function BulkPromptDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (result: BulkPromptResult) => void;
}) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [skipEmpty, setSkipEmpty] = useState(true);

  const parsed = useMemo(() => {
    const lines = text.split("\n").map((l) => l.trim());
    return skipEmpty ? lines.filter(Boolean) : lines;
  }, [text, skipEmpty]);

  function submit() {
    if (parsed.length === 0) return;
    onSubmit({ prompts: parsed, mode });
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-[var(--color-text-muted)]" />
            <h2 className="text-sm font-semibold">批量导入提示词</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-7 place-items-center rounded text-[var(--color-text-subtle)] hover:bg-[var(--color-panel)] hover:text-[var(--color-text)]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bulk-text">
              每行一个提示词 · 已识别{" "}
              <b className="text-[var(--color-text)]">{parsed.length}</b> 条
            </Label>
            <Textarea
              id="bulk-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="一只在夜晚编程的赛博朋克小熊猫&#10;蒸汽朋克风格的机械蝴蝶&#10;水墨山水中的一座石桥&#10;..."
              rows={10}
              className="min-h-56 font-mono text-[13px]"
              autoFocus
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-3">
              <Label className="text-xs text-[var(--color-text-muted)]">
                模式
              </Label>
              <div className="flex gap-1 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-panel)] p-0.5">
                <ModeButton
                  active={mode === "append"}
                  onClick={() => setMode("append")}
                  label="追加"
                  hint="加到现有行后面"
                />
                <ModeButton
                  active={mode === "replace"}
                  onClick={() => setMode("replace")}
                  label="替换"
                  hint="清空现有行后填入"
                />
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--color-text-muted)]">
              <input
                type="checkbox"
                checked={skipEmpty}
                onChange={(e) => setSkipEmpty(e.target.checked)}
                className="size-3.5 accent-[var(--color-accent)]"
              />
              忽略空行
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] bg-[var(--color-panel)] px-5 py-3">
          <span className="text-[11px] text-[var(--color-text-subtle)]">
            提示：可以从 Excel、笔记、csv 里直接粘贴多行
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              取消
            </Button>
            <Button onClick={submit} disabled={parsed.length === 0}>
              {mode === "replace"
                ? `替换为 ${parsed.length} 条`
                : `追加 ${parsed.length} 条`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={
        active
          ? "rounded-[var(--radius-sm)] bg-[var(--color-bg)] px-2.5 py-1 text-xs font-medium text-[var(--color-text)] shadow-sm"
          : "rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      }
    >
      {label}
    </button>
  );
}
