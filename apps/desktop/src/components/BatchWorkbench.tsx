import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Play,
  Plus,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BulkPromptDialog, type BulkPromptResult } from "./BulkPromptDialog";
import { exportBatchAsZip } from "@/lib/imageExport";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BatchRowCard } from "./BatchRowCard";
import { cn } from "@/lib/utils";
import {
  generateBatch,
  getPreferences,
  readConfig,
  saveHistoryItem,
  setPreferences,
} from "@/lib/tauri";
import { on as busOn } from "@/lib/eventBus";
import { newRow, type BatchRowData, type ProviderRow } from "@/lib/types";

const SIZE_PRESETS = [
  { label: "1:1", w: 1024, h: 1024 },
  { label: "3:4", w: 896, h: 1152 },
  { label: "4:3", w: 1152, h: 896 },
  { label: "9:16", w: 768, h: 1344 },
  { label: "16:9", w: 1344, h: 768 },
];

export function BatchWorkbench() {
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string | undefined>();
  const [providerId, setProviderId] = useState<string>("");
  const [rows, setRows] = useState<BatchRowData[]>(() => [
    newRow(),
    newRow(),
    newRow(),
  ]);
  const [presetIdx, setPresetIdx] = useState(0);
  const [customSize, setCustomSize] = useState<{ w: number; h: number } | null>(null);
  const [concurrency, setConcurrency] = useState(5);
  const [negativePrompt, setNegativePrompt] = useState("");
  const [seedInput, setSeedInput] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [batchStatus, setBatchStatus] = useState<
    "idle" | "running" | "done" | "error"
  >("idle");
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });
  const [bulkOpen, setBulkOpen] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const [fileDragOver, setFileDragOver] = useState(false);
  const abortRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const preset = customSize ?? SIZE_PRESETS[presetIdx];

  function reorderRows(from: number, to: number) {
    if (from === to) return;
    setRows((existing) => {
      const next = [...existing];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  async function exportZip() {
    const doneRows = rows.filter((r) => r.result?.dataUrl);
    if (doneRows.length === 0) return;
    try {
      await exportBatchAsZip(
        doneRows.map((r) => ({
          filename: `row-${r.id}`,
          prompt: r.prompt,
          dataUrl: r.result!.dataUrl,
          seed: r.result?.seed,
        }))
      );
      toast.success(`已导出 ${doneRows.length} 张`);
    } catch (err) {
      toast.error("导出失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function applyBulkPrompts({ prompts, mode }: BulkPromptResult) {
    setRows((existing) => {
      if (mode === "replace") {
        return prompts.map((prompt) => ({ ...newRow(), prompt }));
      }
      // append 模式：先填充所有空行，剩下的追加为新行
      const filled: BatchRowData[] = [];
      let queue = [...prompts];
      for (const row of existing) {
        if (!row.prompt.trim() && queue.length > 0) {
          filled.push({ ...row, prompt: queue.shift()! });
        } else {
          filled.push(row);
        }
      }
      for (const prompt of queue) {
        filled.push({ ...newRow(), prompt });
      }
      return filled;
    });
    toast.success(
      mode === "replace"
        ? `已替换为 ${prompts.length} 行`
        : `已追加 ${prompts.length} 行`
    );
    setBulkOpen(false);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cfg, prefs] = await Promise.all([readConfig(), getPreferences()]);
        if (cancelled) return;
        setProviders(cfg.providers);
        setActiveProviderId(cfg.activeProviderId ?? undefined);
        // 优先偏好设置里的默认 provider，否则用 config.activeProvider
        setProviderId(
          prefs.defaultProviderId ??
            cfg.activeProviderId ??
            cfg.providers[0]?.id ??
            ""
        );
        if (
          prefs.defaultSizePreset !== undefined &&
          prefs.defaultSizePreset >= 0 &&
          prefs.defaultSizePreset < SIZE_PRESETS.length
        ) {
          setPresetIdx(prefs.defaultSizePreset);
        }
        if (prefs.defaultConcurrency !== undefined) {
          setConcurrency(prefs.defaultConcurrency);
        }
      } catch (err) {
        toast.error("加载 Provider 失败", {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 用户改动后立即写偏好
  useEffect(() => {
    if (!providerId) return;
    setPreferences({
      defaultProviderId: providerId,
      defaultSizePreset: presetIdx,
      defaultConcurrency: concurrency,
    }).catch(() => {
      // 静默失败，不打扰
    });
  }, [providerId, presetIdx, concurrency]);

  // profile 切换后重新拉 provider
  useEffect(() => {
    return busOn("profile:changed", async () => {
      try {
        const [cfg, prefs] = await Promise.all([readConfig(), getPreferences()]);
        setProviders(cfg.providers);
        setActiveProviderId(cfg.activeProviderId ?? undefined);
        setProviderId(
          prefs.defaultProviderId ??
            cfg.activeProviderId ??
            cfg.providers[0]?.id ??
            ""
        );
      } catch {
        /* ignore */
      }
    });
  }, []);

  // 监听「图库 → 重新使用」事件，把 prompt 填到第一个空行（或追加新行）
  useEffect(() => {
    return busOn<{ prompt: string; referenceImage?: string }>("reuse-prompt", (payload) => {
      setRows((existing) => {
        const idx = existing.findIndex((r) => !r.prompt.trim());
        if (idx >= 0) {
          const next = [...existing];
          next[idx] = {
            ...next[idx],
            prompt: payload.prompt,
            referenceImage: payload.referenceImage,
            status: "idle",
            progress: 0,
            result: undefined,
            errorMsg: undefined,
          };
          return next;
        }
        return [
          ...existing,
          {
            ...newRow(),
            prompt: payload.prompt,
            referenceImage: payload.referenceImage,
          },
        ];
      });
    });
  }, []);

  const validCount = useMemo(
    () => rows.filter((r) => r.prompt.trim()).length,
    [rows]
  );
  const canRun = useMemo(
    () => validCount > 0 && providerId && batchStatus !== "running",
    [validCount, providerId, batchStatus]
  );
  const isRunning = batchStatus === "running";

  function patchRow(id: string, patch: Partial<BatchRowData>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function patchByIndex(idx: number, patch: Partial<BatchRowData>) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function deleteRow(id: string) {
    // 允许全删；空列表时 UI 会给"添加一行"入口
    setRows((rs) => rs.filter((r) => r.id !== id));
  }
  function addRow() {
    setRows((rs) => [...rs, newRow()]);
  }
  function stop() {
    abortRef.current.cancelled = true;
    // Tauri 侧目前没有 abort 支持，等 in-flight 完成后前端忽略
    setBatchStatus("idle");
    setRows((rs) =>
      rs.map((r) =>
        r.status === "queued" || r.status === "running"
          ? { ...r, status: "idle", progress: 0 }
          : r
      )
    );
  }

  /** 只跑单行（用于"再生一张"）*/
  async function rerunRow(rowId: string) {
    if (batchStatus === "running") return;
    const idx = rows.findIndex((r) => r.id === rowId);
    if (idx < 0) return;
    const row = rows[idx];
    if (!row.prompt.trim() || !providerId) return;

    patchByIndex(idx, {
      status: "running",
      progress: 0,
      result: undefined,
      errorMsg: undefined,
    });

    const parsedSeed = seedInput.trim() ? Number(seedInput.trim()) : undefined;
    try {
      await generateBatch(
        {
          providerId,
          items: [
            {
              prompt: row.prompt,
              referenceImage: row.referenceImage,
            },
          ],
          size: { w: preset.w, h: preset.h },
          concurrency: 1,
          negativePrompt: negativePrompt.trim() || undefined,
          seed: Number.isFinite(parsedSeed) ? parsedSeed : undefined,
        },
        (evt) => {
          // task_index 恒为 0，映射回 idx
          if (evt.kind === "progress") {
            patchByIndex(idx, { progress: evt.percent });
          } else if (evt.kind === "image") {
            patchByIndex(idx, {
              status: "done",
              progress: 100,
              result: { dataUrl: evt.dataUrl, seed: evt.seed },
            });
            const providerType =
              providers.find((p) => p.id === providerId)?.type ?? "unknown";
            saveHistoryItem({
              prompt: row.prompt,
              providerId,
              providerType,
              width: preset.w,
              height: preset.h,
              seed: evt.seed,
              dataUrl: evt.dataUrl,
            }).catch(() => {});
          } else if (evt.kind === "error") {
            patchByIndex(idx, {
              status: "error",
              errorMsg: evt.message,
            });
          }
        }
      );
    } catch (err) {
      patchByIndex(idx, {
        status: "error",
        errorMsg: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const run = useCallback(async () => {
    if (!canRun) return;
    abortRef.current = { cancelled: false };
    setRows((rs) =>
      rs.map((r) =>
        r.prompt.trim()
          ? {
              ...r,
              status: "queued",
              progress: 0,
              result: undefined,
              errorMsg: undefined,
            }
          : r
      )
    );
    setBatchStatus("running");
    setBatchProgress({ done: 0, total: 0 });

    const items = rows.map((r) => ({
      prompt: r.prompt,
      referenceImage: r.referenceImage,
    }));

    const parsedSeed = seedInput.trim() ? Number(seedInput.trim()) : undefined;
    try {
      await generateBatch(
        {
          providerId,
          items,
          size: { w: preset.w, h: preset.h },
          concurrency,
          negativePrompt: negativePrompt.trim() || undefined,
          seed: Number.isFinite(parsedSeed) ? parsedSeed : undefined,
        },
        (evt) => {
          if (abortRef.current.cancelled) return;
          if (evt.kind === "batch_start") {
            setBatchProgress({ done: 0, total: evt.total });
          } else if (evt.kind === "batch_done") {
            setBatchProgress({ done: evt.doneCount, total: evt.total });
          } else if (evt.kind === "task_start") {
            patchByIndex(evt.taskIndex, { status: "running", progress: 0 });
          } else if (evt.kind === "task_end") {
            setBatchProgress({ done: evt.doneCount, total: evt.total });
          } else if (evt.kind === "progress") {
            patchByIndex(evt.taskIndex, { progress: evt.percent });
          } else if (evt.kind === "image") {
            patchByIndex(evt.taskIndex, {
              status: "done",
              progress: 100,
              result: { dataUrl: evt.dataUrl, seed: evt.seed },
            });
            // 顺手写入历史（失败静默）
            const row = rows[evt.taskIndex];
            const providerType =
              providers.find((p) => p.id === providerId)?.type ?? "unknown";
            if (row?.prompt.trim()) {
              saveHistoryItem({
                prompt: row.prompt,
                providerId,
                providerType,
                width: preset.w,
                height: preset.h,
                seed: evt.seed,
                dataUrl: evt.dataUrl,
              }).catch((err) => {
                console.warn("save history failed:", err);
              });
            }
          } else if (evt.kind === "error") {
            patchByIndex(evt.taskIndex, {
              status: "error",
              errorMsg: evt.message,
            });
            toast.error(`第 ${evt.taskIndex + 1} 行失败`, {
              description: evt.message,
            });
          }
        }
      );
      if (!abortRef.current.cancelled) setBatchStatus("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`批量请求失败：${msg}`);
      setBatchStatus("error");
    }
  }, [canRun, rows, providerId, preset.w, preset.h, concurrency]);

  const hasNoProvider = providers.length === 0;

  async function handleWindowDrop(file: File) {
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      setRows((existing) => {
        const idx = existing.findIndex((r) => !r.referenceImage);
        if (idx >= 0) {
          const next = [...existing];
          next[idx] = {
            ...next[idx],
            referenceImage: dataUrl,
            referenceName: file.name,
          };
          return next;
        }
        return [
          ...existing,
          {
            ...newRow(),
            referenceImage: dataUrl,
            referenceName: file.name,
          },
        ];
      });
      toast.success(`已加入参考图：${file.name}`);
    } catch (err) {
      toast.error("读取图片失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <div
      className="relative mx-auto flex h-full max-w-4xl flex-col gap-6 overflow-y-auto px-6 py-6"
      onDragOver={(e) => {
        // 只对文件拖拽响应，避免和行拖拽冲突
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setFileDragOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setFileDragOver(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setFileDragOver(false);
        const file = Array.from(e.dataTransfer.files).find((f) =>
          f.type.startsWith("image/")
        );
        if (file) handleWindowDrop(file);
      }}
    >
      {fileDragOver && (
        <div className="pointer-events-none fixed inset-4 z-40 grid place-items-center rounded-[var(--radius-xl)] border-4 border-dashed border-[var(--color-accent)] bg-[var(--color-bg)]/80 text-lg font-medium text-[var(--color-accent)] backdrop-blur-sm">
          松手加入参考图
        </div>
      )}
      <section className="grid gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-panel)] p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="flex flex-col gap-1.5">
          <Label>
            Provider{" "}
            {activeProviderId && (
              <span className="text-[var(--color-text-subtle)]">
                · 当前 {activeProviderId}
              </span>
            )}
          </Label>
          {hasNoProvider ? (
            <div className="rounded-[var(--radius)] border border-dashed border-[var(--color-border-strong)] px-3 py-1.5 text-sm text-[var(--color-text-muted)]">
              暂无 Provider · 切到"Provider 管理"添加一个
            </div>
          ) : (
            <Select
              value={providerId}
              onValueChange={setProviderId}
              disabled={isRunning}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="font-medium">{p.id}</span>
                    <span className="ml-2 text-[var(--color-text-subtle)]">
                      {p.type}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>
            尺寸 · {preset.w}×{preset.h}
          </Label>
          <div className="flex gap-1 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-bg)] p-1">
            {SIZE_PRESETS.map((p, i) => (
              <button
                key={p.label}
                type="button"
                disabled={isRunning}
                onClick={() => setPresetIdx(i)}
                className={cn(
                  "rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium tabular-nums transition-colors",
                  i === presetIdx
                    ? "bg-[var(--color-panel)] text-[var(--color-text)] shadow-sm"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>并发</Label>
          <Select
            value={String(concurrency)}
            onValueChange={(v) => setConcurrency(Number(v))}
            disabled={isRunning}
          >
            <SelectTrigger className="min-w-16">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 5, 8, 10].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      {/* 高级：负面提示词 / seed / 自定义尺寸 */}
      <section className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setAdvancedOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 self-start text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        >
          {advancedOpen ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
          高级 · 负面提示词 / Seed / 自定义尺寸
        </button>
        {advancedOpen && (
          <div className="grid gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-panel)] p-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>
                负面提示词{" "}
                <span className="text-[var(--color-text-subtle)]">
                  · 全批共享，Provider 不支持时静默忽略
                </span>
              </Label>
              <textarea
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
                disabled={isRunning}
                rows={2}
                placeholder="模糊, 低质量, 变形..."
                className="min-h-16 w-full rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm placeholder:text-[var(--color-text-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-strong)] disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Seed（留空为随机）</Label>
              <input
                type="text"
                inputMode="numeric"
                value={seedInput}
                onChange={(e) => setSeedInput(e.target.value.replace(/\D/g, ""))}
                disabled={isRunning}
                placeholder="随机"
                className="h-9 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-sm tabular-nums placeholder:text-[var(--color-text-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-strong)] disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>
                自定义尺寸{" "}
                {customSize && (
                  <button
                    onClick={() => setCustomSize(null)}
                    className="ml-1 text-[10px] text-[var(--color-text-subtle)] underline"
                  >
                    还原预设
                  </button>
                )}
              </Label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  value={customSize?.w ?? preset.w}
                  onChange={(e) => {
                    const w = Math.max(64, Math.min(2048, Number(e.target.value) || 1024));
                    setCustomSize({ w, h: customSize?.h ?? preset.h });
                  }}
                  disabled={isRunning}
                  className="h-9 w-full rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-strong)]"
                />
                <span className="text-xs text-[var(--color-text-subtle)]">×</span>
                <input
                  type="number"
                  value={customSize?.h ?? preset.h}
                  onChange={(e) => {
                    const h = Math.max(64, Math.min(2048, Number(e.target.value) || 1024));
                    setCustomSize({ w: customSize?.w ?? preset.w, h });
                  }}
                  disabled={isRunning}
                  className="h-9 w-full rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-strong)]"
                />
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <Label>
            批量任务（{rows.length} 行 · {validCount} 有效）
          </Label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              disabled={isRunning}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-40"
              title="从剪贴板批量粘贴提示词，每行一条"
            >
              <FileText className="size-3.5" />
              批量导入
            </button>
            <button
              type="button"
              onClick={exportZip}
              disabled={isRunning || rows.every((r) => !r.result?.dataUrl)}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-40"
              title="把本批已完成的图片打包为 zip 下载"
            >
              <Download className="size-3.5" />
              导出 zip
            </button>
            {isRunning && (
              <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] tabular-nums">
                <Loader2 className="size-3 animate-spin" />
                {batchProgress.done} / {batchProgress.total}
              </span>
            )}
          </div>
        </div>

        {rows.length === 0 && (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-strong)] px-6 py-8 text-center text-sm text-[var(--color-text-muted)]">
            没有任务 · 点下方「添加一行」开始
          </div>
        )}
        <div
          className="flex flex-col gap-2"
          onDragEnd={() => {
            setDragIdx(null);
            setDropIdx(null);
          }}
        >
          {rows.map((row, i) => (
            <BatchRowCard
              key={row.id}
              index={i}
              row={row}
              disabled={isRunning}
              onChange={(patch) => patchRow(row.id, patch)}
              onDelete={() => deleteRow(row.id)}
              onRerun={() => rerunRow(row.id)}
              onDragStart={() => setDragIdx(i)}
              onDragOverRow={() => setDropIdx(i)}
              onDropRow={() => {
                if (dragIdx !== null && dragIdx !== i) {
                  reorderRows(dragIdx, i);
                }
                setDragIdx(null);
                setDropIdx(null);
              }}
              isDragging={dragIdx === i}
              isDropTarget={dropIdx === i && dragIdx !== null && dragIdx !== i}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={addRow}
          disabled={isRunning}
          className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-strong)] bg-transparent px-4 py-3 text-sm text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-text-muted)] hover:bg-[var(--color-panel)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="size-4" />
          添加一行
        </button>
      </section>

      <section className="sticky bottom-0 flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-panel)]/95 p-3 shadow-lg backdrop-blur">
        <div className="min-w-0 flex-1">
          {isRunning ? (
            <>
              <div className="mb-1.5 flex items-center justify-between text-xs text-[var(--color-text-muted)] tabular-nums">
                <span>
                  进行中 · {batchProgress.done} / {batchProgress.total}
                </span>
                <span>
                  {batchProgress.total > 0
                    ? Math.floor(
                        (batchProgress.done / batchProgress.total) * 100
                      )
                    : 0}
                  %
                </span>
              </div>
              <Progress
                value={
                  batchProgress.total > 0
                    ? (batchProgress.done / batchProgress.total) * 100
                    : 0
                }
              />
            </>
          ) : batchStatus === "done" ? (
            <span className="text-xs text-[var(--color-success)]">
              ✓ 完成 · {batchProgress.done} / {batchProgress.total}
            </span>
          ) : (
            <span className="text-xs text-[var(--color-text-subtle)]">
              准备就绪 · 有效任务 {validCount} 条
            </span>
          )}
        </div>
        {isRunning ? (
          <Button variant="danger" onClick={stop} className="min-w-32">
            <Square className="size-3.5" />
            停止
          </Button>
        ) : (
          <Button
            onClick={run}
            disabled={!canRun}
            className={cn(
              "min-w-32",
              canRun &&
                "bg-gradient-to-r from-[#7c3aed] to-[#ec4899] text-white hover:opacity-95"
            )}
          >
            <Play className="size-3.5" />
            批量生成 · {validCount}
          </Button>
        )}
      </section>

      {bulkOpen && (
        <BulkPromptDialog
          onClose={() => setBulkOpen(false)}
          onSubmit={applyBulkPrompts}
        />
      )}
    </div>
  );
}
