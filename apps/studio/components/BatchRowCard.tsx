"use client";
import { useRef } from "react";
import { toast } from "sonner";
import {
  Check,
  ImagePlus,
  Loader2,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { BatchRowData } from "@/lib/batchTypes";

const MAX_FILE_MB = 10;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function StatusBadge({ status, progress }: { status: BatchRowData["status"]; progress: number }) {
  if (status === "idle") {
    return <span className="text-[11px] text-[var(--color-text-subtle)]">待运行</span>;
  }
  if (status === "queued") {
    return (
      <span className="text-[11px] text-[var(--color-text-muted)]">排队中</span>
    );
  }
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-text-muted)] tabular-nums">
        <Loader2 className="size-3 animate-spin" />
        {progress}%
      </span>
    );
  }
  if (status === "done") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-[var(--color-success)]">
        <Check className="size-3" />
        已完成
      </span>
    );
  }
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
}: {
  index: number;
  row: BatchRowData;
  disabled: boolean;
  onChange: (patch: Partial<BatchRowData>) => void;
  onDelete: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div
      className={cn(
        "grid grid-cols-[auto_120px_1fr_100px_auto] items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-panel)] p-3 transition-colors",
        row.status === "running" && "border-[var(--color-border-strong)]",
        row.status === "error" && "border-[var(--color-danger)]/40",
        row.status === "done" && "border-[var(--color-success)]/30"
      )}
    >
      {/* 序号 + 状态 */}
      <div className="flex flex-col items-center gap-1 pt-2">
        <span className="grid size-6 place-items-center rounded-full bg-[var(--color-panel-hover)] text-[10px] font-medium text-[var(--color-text-muted)] tabular-nums">
          {index + 1}
        </span>
        <StatusBadge status={row.status} progress={row.progress} />
      </div>

      {/* 参考图槽 */}
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={async (e) => {
          e.preventDefault();
          if (disabled) return;
          const f = e.dataTransfer?.files?.[0];
          if (f) await handleFile(f);
        }}
        className={cn(
          "group relative aspect-square w-30 cursor-pointer overflow-hidden rounded-[var(--radius)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg)] transition-colors hover:border-[var(--color-text-muted)]",
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

      {/* Prompt */}
      <Textarea
        value={row.prompt}
        onChange={(e) => onChange({ prompt: e.target.value })}
        placeholder="这一行的提示词..."
        rows={4}
        disabled={disabled}
        className="min-h-[120px] resize-none"
      />

      {/* 结果缩略 */}
      <div className="flex flex-col items-center justify-center">
        {row.result ? (
          <a
            href={row.result.dataUrl}
            download={`imagegen-row-${index + 1}.png`}
            title="点击下载"
            className="block h-24 w-24 overflow-hidden rounded-[var(--radius)] border border-[var(--color-border)] transition-shadow hover:shadow-md"
          >
            <img
              src={row.result.dataUrl}
              alt={`结果 ${index + 1}`}
              className="block h-full w-full object-cover"
            />
          </a>
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

      {/* 删除 */}
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
  );
}
