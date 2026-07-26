import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  Bookmark,
  Check,
  Copy,
  GripVertical,
  ImagePlus,
  Languages,
  Loader2,
  RefreshCw,
  Tags,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { TemplatePicker } from "./TemplatePicker";
import { PromptAutocomplete } from "./PromptAutocomplete";
import { StyleTagPicker } from "./StyleTagPicker";
import { appendTag } from "@/lib/styleTags";
import { copyImageToClipboard } from "@/lib/imageExport";
import { translatePrompt } from "@/lib/tauri";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { BatchRowData } from "@/lib/types";

const MAX_FILE_MB = 10;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function StatusBadge({
  status,
  progress,
}: {
  status: BatchRowData["status"];
  progress: number;
}) {
  if (status === "idle")
    return (
      <span className="text-[11px] text-[var(--color-text-subtle)]">待运行</span>
    );
  if (status === "queued")
    return (
      <span className="text-[11px] text-[var(--color-text-muted)]">排队中</span>
    );
  if (status === "running")
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-text-muted)] tabular-nums">
        <Loader2 className="size-3 animate-spin" />
        {progress}%
      </span>
    );
  if (status === "done")
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-success)]">
        <Check className="size-3" />
        已完成
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-danger)]">
      <TriangleAlert className="size-3" />
      失败
    </span>
  );
}

export function BatchRowCard({
  index,
  row,
  disabled,
  onChange,
  onDelete,
  onRerun,
  onDragStart,
  onDragOverRow,
  onDropRow,
  isDragging,
  isDropTarget,
}: {
  index: number;
  row: BatchRowData;
  disabled: boolean;
  onChange: (patch: Partial<BatchRowData>) => void;
  onDelete: () => void;
  onRerun?: () => void;
  onDragStart?: () => void;
  onDragOverRow?: () => void;
  onDropRow?: () => void;
  isDragging?: boolean;
  isDropTarget?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [translating, setTranslating] = useState(false);

  async function doTranslate() {
    if (!row.prompt.trim() || translating) return;
    setTranslating(true);
    try {
      const out = await translatePrompt({ text: row.prompt, mode: "translate" });
      onChange({ prompt: out });
      toast.success("已翻译为英文");
    } catch (err) {
      toast.error("翻译失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTranslating(false);
    }
  }

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      toast.error(`图片过大（>${MAX_FILE_MB}MB）`);
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      onChange({ referenceImage: dataUrl, referenceName: file.name });
    } catch (err) {
      toast.error("读取图片失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function clearImage(e: React.MouseEvent) {
    e.stopPropagation();
    onChange({ referenceImage: undefined, referenceName: undefined });
  }

  async function copyResult() {
    if (!row.result) return;
    try {
      await copyImageToClipboard(row.result.dataUrl);
      toast.success("已复制到剪贴板");
    } catch (err) {
      toast.error("复制失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <div
      draggable={!!onDragStart && !disabled}
      onDragStart={(e) => {
        if (!onDragStart || disabled) return;
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragOver={(e) => {
        if (!onDragOverRow) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOverRow();
      }}
      onDrop={(e) => {
        if (!onDropRow) return;
        e.preventDefault();
        onDropRow();
      }}
      className={cn(
        "grid grid-cols-[auto_auto_90px_1fr_auto] sm:grid-cols-[auto_auto_120px_1fr_100px_auto] items-start gap-2 sm:gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-panel)] p-2 sm:p-3 transition-all",
        row.status === "running" && "border-[var(--color-border-strong)]",
        row.status === "error" && "border-[var(--color-danger)]/40",
        row.status === "done" && "border-[var(--color-success)]/30",
        isDragging && "opacity-40",
        isDropTarget && "ring-2 ring-[var(--color-text-muted)] ring-offset-2 ring-offset-[var(--color-bg)]"
      )}
    >
      {/* 拖拽把手 */}
      <div
        className={cn(
          "flex items-center pt-3 text-[var(--color-text-subtle)]",
          onDragStart && !disabled
            ? "cursor-grab active:cursor-grabbing"
            : "opacity-30"
        )}
        title="拖拽重排"
      >
        <GripVertical className="size-4" />
      </div>

      <div className="flex flex-col items-center gap-1 pt-2">
        <span className="grid size-6 place-items-center rounded-full bg-[var(--color-panel-hover)] text-[10px] font-medium text-[var(--color-text-muted)] tabular-nums">
          {index + 1}
        </span>
        <StatusBadge status={row.status} progress={row.progress} />
      </div>

      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={async (e) => {
          e.preventDefault();
          if (disabled) return;
          const f = e.dataTransfer?.files?.[0];
          if (f) await handleFile(f);
        }}
        className={cn(
          "group relative aspect-square cursor-pointer overflow-hidden rounded-[var(--radius)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg)] transition-colors hover:border-[var(--color-text-muted)]",
          disabled && "cursor-not-allowed opacity-60"
        )}
        style={{ width: 120, height: 120 }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          disabled={disabled}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        {row.referenceImage ? (
          <>
            <img
              src={row.referenceImage}
              alt={row.referenceName ?? "参考图"}
              className="block h-full w-full object-cover"
            />
            {!disabled && (
              <button
                type="button"
                onClick={clearImage}
                title="移除参考图"
                className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            )}
          </>
        ) : (
          <div className="grid h-full w-full place-items-center text-[var(--color-text-subtle)]">
            <div className="flex flex-col items-center gap-1">
              <ImagePlus className="size-5" />
              <span className="text-[10px]">参考图（可选）</span>
            </div>
          </div>
        )}
      </div>

      <div className="relative flex flex-col">
        <Textarea
          ref={textareaRef}
          value={row.prompt}
          onChange={(e) => onChange({ prompt: e.target.value })}
          placeholder="这一行的提示词... (⌘/ 呼出候选)"
          rows={4}
          disabled={disabled}
          className="min-h-[120px] resize-none pr-8"
        />
        <PromptAutocomplete
          anchorRef={textareaRef}
          query={row.prompt}
          onPick={(prompt) => {
            onChange({ prompt });
            textareaRef.current?.focus();
          }}
        />
        <div className="absolute right-1.5 top-1.5 flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setTemplateOpen(true)}
            disabled={disabled}
            title="从模板填入"
            className="grid size-6 place-items-center rounded text-[var(--color-text-subtle)] hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Bookmark className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setTagOpen(true)}
            disabled={disabled}
            title="追加风格标签"
            className="grid size-6 place-items-center rounded text-[var(--color-text-subtle)] hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Tags className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={doTranslate}
            disabled={disabled || translating || !row.prompt.trim()}
            title="翻译成英文（需 openai-compat Provider）"
            className="grid size-6 place-items-center rounded text-[var(--color-text-subtle)] hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-30"
          >
            {translating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Languages className="size-3.5" />
            )}
          </button>
        </div>
        {row.prompt.length > 0 && (
          <span className="absolute bottom-1.5 right-2 text-[10px] tabular-nums text-[var(--color-text-subtle)]">
            {row.prompt.length}
          </span>
        )}
        {/* 小屏：结果显示在 prompt 下方 */}
        {row.result && (
          <a
            href={row.result.dataUrl}
            download={`imagegen-row-${index + 1}.png`}
            className="mt-2 flex sm:hidden items-center gap-2 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-bg)] p-1.5"
          >
            <img
              src={row.result.dataUrl}
              alt={`结果 ${index + 1}`}
              className="block size-10 rounded object-cover"
            />
            <span className="text-[11px] text-[var(--color-text-muted)]">
              点击下载
            </span>
          </a>
        )}
      </div>

      <div className="hidden sm:flex flex-col items-center justify-center">
        {row.result ? (
          <div className="group relative animate-result-reveal h-24 w-24 overflow-hidden rounded-[var(--radius)] border border-[var(--color-border)] transition-shadow hover:shadow-md">
            <a
              href={row.result.dataUrl}
              download={`imagegen-row-${index + 1}.png`}
              title="点击下载"
              className="block h-full w-full"
            >
              <img
                src={row.result.dataUrl}
                alt={`结果 ${index + 1}`}
                className="block h-full w-full object-cover"
              />
            </a>
            <button
              type="button"
              onClick={copyResult}
              title="复制到剪贴板"
              className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
            >
              <Copy className="size-3" />
            </button>
          </div>
        ) : row.status === "error" ? (
          <div
            className="w-24 rounded-[var(--radius)] bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)] p-2 text-center text-[11px] text-[var(--color-danger)]"
            title={row.errorMsg}
          >
            {row.errorMsg && row.errorMsg.length > 30
              ? row.errorMsg.slice(0, 30) + "…"
              : row.errorMsg ?? "失败"}
          </div>
        ) : (
          <div className="grid h-24 w-24 place-items-center rounded-[var(--radius)] bg-[var(--color-bg)] text-[10px] text-[var(--color-text-subtle)]">
            {row.status === "running" ? `${row.progress}%` : "—"}
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-1">
        {onRerun && (
          <button
            type="button"
            onClick={onRerun}
            disabled={disabled || !row.prompt.trim()}
            title="只重新生成这一行"
            className="grid size-8 place-items-center rounded-[var(--radius)] text-[var(--color-text-subtle)] transition-colors hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-30"
          >
            <RefreshCw className="size-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          title="删除此行"
          className="grid size-8 place-items-center rounded-[var(--radius)] text-[var(--color-text-subtle)] transition-colors hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {templateOpen && (
        <TemplatePicker
          onClose={() => setTemplateOpen(false)}
          onPick={(prompt) => onChange({ prompt })}
          currentPrompt={row.prompt}
        />
      )}

      {tagOpen && (
        <StyleTagPicker
          onClose={() => setTagOpen(false)}
          onPick={(append) => onChange({ prompt: appendTag(row.prompt, append) })}
        />
      )}
    </div>
  );
}
