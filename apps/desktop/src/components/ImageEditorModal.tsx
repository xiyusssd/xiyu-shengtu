import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Crop, Download, Loader2, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { saveHistoryItem } from "@/lib/tauri";

/**
 * 图片裁剪/缩放编辑器
 * - 中心比例裁剪（1:1 / 4:3 / 3:4 / 16:9 / 9:16 / 原始）
 * - 缩放到目标宽/高
 * - 导出：下载 PNG 或 存回图库
 */

type Ratio = { label: string; value: number | null }; // null = 原始比例

const RATIOS: Ratio[] = [
  { label: "原始", value: null },
  { label: "1:1", value: 1 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:4", value: 3 / 4 },
  { label: "16:9", value: 16 / 9 },
  { label: "9:16", value: 9 / 16 },
];

export function ImageEditorModal({
  dataUrl,
  meta,
  onClose,
}: {
  dataUrl: string;
  meta: { prompt: string; providerId: string; providerType: string };
  onClose: () => void;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [ratio, setRatio] = useState<number | null>(null);
  const [targetW, setTargetW] = useState(1024);
  const [linkH, setLinkH] = useState(true); // 高度跟随比例自动算
  const [targetH, setTargetH] = useState(1024);
  const [saving, setSaving] = useState(false);
  const previewRef = useRef<HTMLCanvasElement>(null);

  // 载入原图
  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      setImg(image);
      setTargetW(image.width);
      setTargetH(image.height);
    };
    image.src = dataUrl;
  }, [dataUrl]);

  // Esc 关闭，与其他弹层保持一致
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // 计算裁剪源区域（中心裁剪到目标比例）
  function computeCrop(image: HTMLImageElement, r: number | null) {
    if (r === null) {
      return { sx: 0, sy: 0, sw: image.width, sh: image.height };
    }
    const srcRatio = image.width / image.height;
    let sw = image.width;
    let sh = image.height;
    if (srcRatio > r) {
      // 原图更宽 → 裁两侧
      sw = Math.round(image.height * r);
    } else {
      // 原图更高 → 裁上下
      sh = Math.round(image.width / r);
    }
    const sx = Math.round((image.width - sw) / 2);
    const sy = Math.round((image.height - sh) / 2);
    return { sx, sy, sw, sh };
  }

  // 输出尺寸（按比例 + targetW）
  function outputSize(image: HTMLImageElement, r: number | null) {
    if (r === null) {
      return linkH
        ? {
            w: targetW,
            h: Math.round((targetW / image.width) * image.height),
          }
        : { w: targetW, h: targetH };
    }
    return { w: targetW, h: Math.round(targetW / r) };
  }

  // 重绘预览
  useEffect(() => {
    if (!img || !previewRef.current) return;
    const crop = computeCrop(img, ratio);
    const out = outputSize(img, ratio);
    const canvas = previewRef.current;
    canvas.width = out.w;
    canvas.height = out.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, out.w, out.h);
    ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, out.w, out.h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, ratio, targetW, targetH, linkH]);

  function renderToDataUrl(): string | null {
    if (!img) return null;
    const crop = computeCrop(img, ratio);
    const out = outputSize(img, ratio);
    const canvas = document.createElement("canvas");
    canvas.width = out.w;
    canvas.height = out.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, out.w, out.h);
    return canvas.toDataURL("image/png");
  }

  function download() {
    const url = renderToDataUrl();
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = `edited-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast.success("已下载编辑后的图片");
  }

  async function saveToGallery() {
    const url = renderToDataUrl();
    if (!url) return;
    const out = outputSize(img!, ratio);
    setSaving(true);
    try {
      await saveHistoryItem({
        prompt: `[编辑] ${meta.prompt}`,
        providerId: meta.providerId,
        providerType: meta.providerType,
        width: out.w,
        height: out.h,
        dataUrl: url,
      });
      toast.success("已存回图库");
      onClose();
    } catch (err) {
      toast.error("保存失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  const out = img ? outputSize(img, ratio) : { w: 0, h: 0 };

  return (
    <div
      className="fixed inset-0 z-[55] grid place-items-center bg-black/70 p-8 backdrop-blur"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-4xl gap-4 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)]"
      >
        {/* 预览 */}
        <div className="flex flex-1 items-center justify-center bg-black/40 p-4">
          {img ? (
            <canvas
              ref={previewRef}
              className="max-h-[calc(100vh-10rem)] max-w-full rounded border border-[var(--color-border)] object-contain"
              style={{ imageRendering: "auto" }}
            />
          ) : (
            <Loader2 className="size-6 animate-spin text-white" />
          )}
        </div>

        {/* 控制面板 */}
        <aside className="flex w-64 shrink-0 flex-col overflow-y-auto p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
              <Crop className="size-4" />
              裁剪 / 缩放
            </span>
            <button
              onClick={onClose}
              className="grid size-6 place-items-center rounded text-[var(--color-text-subtle)] hover:bg-[var(--color-panel)] hover:text-[var(--color-text)]"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>裁剪比例</Label>
              <div className="flex flex-wrap gap-1">
                {RATIOS.map((r) => (
                  <button
                    key={r.label}
                    type="button"
                    onClick={() => setRatio(r.value)}
                    className={cn(
                      "rounded-[var(--radius-sm)] border px-2 py-1 text-xs transition-colors",
                      ratio === r.value
                        ? "border-[var(--color-text)] bg-[var(--color-panel)] text-[var(--color-text)]"
                        : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tw">输出宽度 (px)</Label>
              <Input
                id="tw"
                type="number"
                min={16}
                max={4096}
                value={targetW}
                onChange={(e) =>
                  setTargetW(Math.max(16, Math.min(4096, Number(e.target.value) || 16)))
                }
              />
            </div>

            {ratio === null && (
              <div className="flex flex-col gap-1.5">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--color-text-muted)]">
                  <input
                    type="checkbox"
                    checked={linkH}
                    onChange={(e) => setLinkH(e.target.checked)}
                    className="size-3.5 accent-[var(--color-accent)]"
                  />
                  高度按原图比例
                </label>
                {!linkH && (
                  <Input
                    type="number"
                    min={16}
                    max={4096}
                    value={targetH}
                    onChange={(e) =>
                      setTargetH(
                        Math.max(16, Math.min(4096, Number(e.target.value) || 16))
                      )
                    }
                  />
                )}
              </div>
            )}

            <div className="rounded-[var(--radius)] bg-[var(--color-panel)] px-3 py-2 text-xs text-[var(--color-text-muted)]">
              输出尺寸：
              <span className="font-medium text-[var(--color-text)] tabular-nums">
                {" "}
                {out.w}×{out.h}
              </span>
            </div>
          </div>

          <div className="mt-auto flex flex-col gap-2 pt-4">
            <Button size="sm" onClick={saveToGallery} disabled={!img || saving}>
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              存回图库
            </Button>
            <Button variant="outline" size="sm" onClick={download} disabled={!img}>
              <Download className="size-3.5" />
              下载
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
