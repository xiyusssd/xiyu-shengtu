"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FileText, Loader2, Play, Plus, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BatchRowCard } from "@/components/BatchRowCard";
import { BulkPromptDialog, type BulkPromptResult } from "@/components/BulkPromptDialog";
import { cn } from "@/lib/utils";
import { newRow, type BatchRowData } from "@/lib/batchTypes";

type ProviderRow = {
  id: string;
  type: string;
  displayName?: string;
  hasKey: boolean;
};

type SizePreset = {
  label: string;
  w: number;
  h: number;
};

const SIZE_PRESETS: SizePreset[] = [
  { label: "1:1", w: 1024, h: 1024 },
  { label: "3:4", w: 896, h: 1152 },
  { label: "4:3", w: 1152, h: 896 },
  { label: "9:16", w: 768, h: 1344 },
  { label: "16:9", w: 1344, h: 768 },
];

export function BatchWorkbench({
  providers,
  activeProviderId,
}: {
  providers: ProviderRow[];
  activeProviderId?: string;
}) {
  const [rows, setRows] = useState<BatchRowData[]>(() => [
    newRow(),
    newRow(),
    newRow(),
  ]);
  const [providerId, setProviderId] = useState(
    activeProviderId ?? providers[0]?.id ?? ""
  );
  const [presetIdx, setPresetIdx] = useState(0);
  const [concurrency, setConcurrency] = useState(5);
  const [batchStatus, setBatchStatus] = useState<
    "idle" | "running" | "done" | "error"
  >("idle");
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });
  const [bulkOpen, setBulkOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const preset = SIZE_PRESETS[presetIdx];

  function applyBulkPrompts({ prompts, mode }: BulkPromptResult) {
    setRows((existing) => {
      if (mode === "replace") {
        return prompts.map((prompt) => ({ ...newRow(), prompt }));
      }
      const filled: BatchRowData[] = [];
      const queue = [...prompts];
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

  const validCount = useMemo(
    () => rows.filter((r) => r.prompt.trim().length > 0).length,
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
    setRows((rs) => (rs.length <= 1 ? rs : rs.filter((r) => r.id !== id)));
  }
  function addRow() {
    setRows((rs) => [...rs, newRow()]);
  }
  function stop() {
    abortRef.current?.abort();
  }

  const run = useCallback(async () => {
    if (!canRun) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // 只跑有 prompt 的行；无 prompt 的行不动
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

    const snapshot = rows.map((r) => ({
      prompt: r.prompt,
      referenceImage: r.referenceImage,
    }));

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId,
          items: snapshot,
          size: { w: preset.w, h: preset.h },
          concurrency,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx = buf.indexOf("\n\n");
        while (idx !== -1) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          idx = buf.indexOf("\n\n");
          const line = chunk.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const raw = line.slice(5).trim();
          if (!raw) continue;
          let evt: any;
          try {
            evt = JSON.parse(raw);
          } catch {
            continue;
          }
          if (evt.type === "batch_start") {
            setBatchProgress({ done: 0, total: evt.total });
          } else if (evt.type === "batch_done") {
            setBatchProgress({ done: evt.doneCount, total: evt.total });
          } else if (evt.type === "task_start") {
            patchByIndex(evt.taskIndex, { status: "running", progress: 0 });
          } else if (evt.type === "task_end") {
            setBatchProgress({ done: evt.doneCount, total: evt.total });
          } else if (evt.type === "task_skipped") {
            patchByIndex(evt.taskIndex, { status: "idle" });
          } else if (evt.type === "progress") {
            patchByIndex(evt.taskIndex, { progress: evt.percent });
          } else if (evt.type === "image") {
            patchByIndex(evt.taskIndex, {
              status: "done",
              progress: 100,
              result: { dataUrl: evt.dataUrl, seed: evt.seed },
            });
          } else if (evt.type === "error") {
            patchByIndex(evt.taskIndex, {
              status: "error",
              errorMsg: evt.message,
            });
            toast.error(`第 ${evt.taskIndex + 1} 行失败`, {
              description: evt.message,
            });
          }
        }
      }
      setBatchStatus("done");
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setBatchStatus("idle");
        setRows((rs) =>
          rs.map((r) =>
            r.status === "queued" || r.status === "running"
              ? { ...r, status: "idle", progress: 0 }
              : r
          )
        );
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`批量请求失败：${msg}`);
      setBatchStatus("error");
    }
  }, [canRun, rows, providerId, preset.w, preset.h, concurrency]);

  const hasNoProvider = providers.length === 0;

  return (
    <div className="flex flex-col gap-6">
      {/* 顶部控制条 */}
      <section className="grid gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-panel)] p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="flex flex-col gap-1.5">
          <Label>Provider</Label>
          {hasNoProvider ? (
            <div className="rounded-[var(--radius)] border border-dashed border-[var(--color-border-strong)] px-3 py-1.5 text-sm text-[var(--color-text-muted)]">
              暂无可用 · 用{" "}
              <code className="rounded bg-[var(--color-panel-hover)] px-1 py-0.5">
                shengtu-tool
              </code>{" "}
              添加
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
          <Label>尺寸 · {preset.w}×{preset.h}</Label>
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

      {/* 批量行列表 */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <Label>批量任务（{rows.length} 行 · {validCount} 有效）</Label>
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
            {isRunning && (
              <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] tabular-nums">
                <Loader2 className="size-3 animate-spin" />
                {batchProgress.done} / {batchProgress.total}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {rows.map((row, i) => (
            <BatchRowCard
              key={row.id}
              index={i}
              row={row}
              disabled={isRunning}
              onChange={(patch) => patchRow(row.id, patch)}
              onDelete={() => deleteRow(row.id)}
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

      {/* 主按钮 + 总进度 */}
      <section className="sticky bottom-4 z-10 flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-panel)]/95 p-3 shadow-lg backdrop-blur">
        <div className="min-w-0 flex-1">
          {isRunning ? (
            <>
              <div className="mb-1.5 flex items-center justify-between text-xs text-[var(--color-text-muted)] tabular-nums">
                <span>进行中 · {batchProgress.done} / {batchProgress.total}</span>
                <span>
                  {batchProgress.total > 0
                    ? Math.floor((batchProgress.done / batchProgress.total) * 100)
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
