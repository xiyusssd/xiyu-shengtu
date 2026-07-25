import { useCallback, useEffect, useMemo, useState } from "react";
// note: useEffect is used by both GalleryView and PreviewModal below
import { toast } from "sonner";
import {
  Check,
  Copy,
  Download,
  Images,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { emit as busEmit } from "@/lib/eventBus";
import {
  clearHistory,
  deleteHistoryItem,
  listHistory,
  readHistoryImage,
  type HistoryItem,
} from "@/lib/tauri";

/**
 * 图库：列出历史生成图，点击查看大图 / 下载 / 删除
 */
export function GalleryView() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [imageCache, setImageCache] = useState<Record<string, string>>({});
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"grid" | "grouped">("grid");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listHistory();
      setItems(list);
    } catch (err) {
      toast.error("加载历史失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    // 预取缩略图（按顺序加载，避免一次性太多 base64 读盘）
    let cancelled = false;
    (async () => {
      for (const item of items) {
        if (cancelled) return;
        if (imageCache[item.id]) continue;
        try {
          const url = await readHistoryImage(item.relativePath);
          if (cancelled) return;
          setImageCache((cache) => ({ ...cache, [item.id]: url }));
        } catch {
          // 单个失败不影响
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.map((i) => i.id).join(",")]);

  const preview = useMemo(
    () => items.find((i) => i.id === previewId) ?? null,
    [items, previewId]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.prompt.toLowerCase().includes(q) ||
        item.providerId.toLowerCase().includes(q) ||
        item.providerType.toLowerCase().includes(q)
    );
  }, [items, query]);

  function reuseItem(item: HistoryItem) {
    busEmit("reuse-prompt", {
      prompt: item.prompt,
      referenceImage: undefined,
    });
    toast.success("已把提示词填到「批量生图」");
    setPreviewId(null);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  async function batchDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`删除已选 ${selectedIds.size} 张？此操作不可撤销。`)) return;
    try {
      for (const id of selectedIds) {
        await deleteHistoryItem(id);
      }
      exitSelectMode();
      setImageCache({});
      await reload();
      toast.success(`已删除 ${selectedIds.size} 张`);
    } catch (err) {
      toast.error("批量删除失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function batchExportZip() {
    const selected = filtered.filter((i) => selectedIds.has(i.id));
    if (selected.length === 0) return;
    try {
      // 需要用缓存里的 dataUrl；先确保所有选中项都有缓存
      const missing = selected.filter((i) => !imageCache[i.id]);
      if (missing.length > 0) {
        toast.info(`正在读取 ${missing.length} 张图片…`);
        for (const item of missing) {
          try {
            const url = await readHistoryImage(item.relativePath);
            setImageCache((cache) => ({ ...cache, [item.id]: url }));
            (imageCache as any)[item.id] = url;
          } catch {
            /* skip */
          }
        }
      }
      const entries = selected
        .map((item, idx) => ({
          filename: `${String(idx + 1).padStart(3, "0")}-${item.id}.png`,
          prompt: item.prompt,
          dataUrl: imageCache[item.id],
          seed: item.seed,
        }))
        .filter((e) => e.dataUrl);
      const { exportBatchAsZip } = await import("@/lib/imageExport");
      await exportBatchAsZip(entries, `gallery-${Date.now()}.zip`);
      toast.success(`已导出 ${entries.length} 张`);
      exitSelectMode();
    } catch (err) {
      toast.error("导出失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function removeItem(id: string) {
    if (!confirm("确定删除这张图片？")) return;
    try {
      await deleteHistoryItem(id);
      setImageCache((cache) => {
        const next = { ...cache };
        delete next[id];
        return next;
      });
      await reload();
      toast.success("已删除");
    } catch (err) {
      toast.error("删除失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function clearAll() {
    if (
      !confirm(`确定清空所有 ${items.length} 张历史图片？此操作不可撤销。`)
    )
      return;
    try {
      await clearHistory();
      setImageCache({});
      await reload();
      toast.success("已清空");
    } catch (err) {
      toast.error("清空失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <>
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-6 py-3">
          <div className="flex items-center gap-2 shrink-0">
            <Images className="size-4 text-[var(--color-text-muted)]" />
            <span className="text-sm font-semibold">图库</span>
            <span className="text-xs text-[var(--color-text-subtle)]">
              {query.trim()
                ? `· ${filtered.length} / ${items.length} 张`
                : `· 共 ${items.length} 张`}
            </span>
          </div>
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-text-subtle)]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索提示词 / provider…"
              className="h-8 w-full rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-panel)] pl-8 pr-8 text-sm placeholder:text-[var(--color-text-subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-strong)]"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full text-[var(--color-text-subtle)] hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-text)]"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {items.length > 0 && (
              <>
                <div className="flex gap-0.5 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-panel)] p-0.5">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={cn(
                      "rounded-[var(--radius-sm)] px-2 py-1 text-[10px] transition-colors",
                      viewMode === "grid"
                        ? "bg-[var(--color-bg)] text-[var(--color-text)]"
                        : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                    )}
                    title="网格视图"
                  >
                    网格
                  </button>
                  <button
                    onClick={() => setViewMode("grouped")}
                    className={cn(
                      "rounded-[var(--radius-sm)] px-2 py-1 text-[10px] transition-colors",
                      viewMode === "grouped"
                        ? "bg-[var(--color-bg)] text-[var(--color-text)]"
                        : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                    )}
                    title="按日期分组"
                  >
                    分组
                  </button>
                </div>
                <Button
                  variant={selectMode ? "secondary" : "outline"}
                  size="sm"
                  onClick={() =>
                    selectMode ? exitSelectMode() : setSelectMode(true)
                  }
                >
                  {selectMode
                    ? `完成 · ${selectedIds.size} 选中`
                    : "多选"}
                </Button>
              </>
            )}
            <Button variant="ghost" size="icon" onClick={reload} title="刷新">
              <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
            </Button>
            {items.length > 0 && !selectMode && (
              <Button variant="outline" size="sm" onClick={clearAll}>
                <Trash2 className="size-3.5" />
                清空
              </Button>
            )}
          </div>
        </header>

        {selectMode && (
          <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-panel)] px-6 py-2">
            <span className="text-xs text-[var(--color-text-muted)] tabular-nums">
              已选 {selectedIds.size} / {filtered.length}
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (selectedIds.size === filtered.length) {
                    setSelectedIds(new Set());
                  } else {
                    setSelectedIds(new Set(filtered.map((i) => i.id)));
                  }
                }}
              >
                {selectedIds.size === filtered.length && filtered.length > 0
                  ? "取消全选"
                  : "全选"}
              </Button>
              <Button
                size="sm"
                onClick={batchExportZip}
                disabled={selectedIds.size === 0}
              >
                导出 zip
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={batchDelete}
                disabled={selectedIds.size === 0}
              >
                <Trash2 className="size-3.5" />
                删除
              </Button>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto px-6 py-6">
          {loading ? (
            <div className="grid h-full place-items-center text-sm text-[var(--color-text-muted)]">
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                加载中…
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="grid h-full place-items-center rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-strong)] text-center">
              <div className="flex flex-col items-center gap-2 px-8 py-16">
                <Images className="size-6 text-[var(--color-text-subtle)]" />
                <p className="text-sm text-[var(--color-text-muted)]">
                  还没有生成记录
                </p>
                <p className="text-xs text-[var(--color-text-subtle)]">
                  在「批量生图」页跑一次，成果会自动保存在这里
                </p>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="grid h-full place-items-center rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-strong)] text-center">
              <div className="flex flex-col items-center gap-2 px-8 py-16">
                <Search className="size-6 text-[var(--color-text-subtle)]" />
                <p className="text-sm text-[var(--color-text-muted)]">
                  没找到匹配「{query}」的结果
                </p>
                <button
                  onClick={() => setQuery("")}
                  className="mt-2 text-xs text-[var(--color-text-muted)] underline hover:text-[var(--color-text)]"
                >
                  清空搜索
                </button>
              </div>
            </div>
          ) : viewMode === "grouped" ? (
            <GroupedGrid
              items={filtered}
              imageCache={imageCache}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onSelect={(id) => (selectMode ? toggleSelect(id) : setPreviewId(id))}
            />
          ) : (
            <FlatGrid
              items={filtered}
              imageCache={imageCache}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onSelect={(id) => (selectMode ? toggleSelect(id) : setPreviewId(id))}
            />
          )}
        </main>
      </div>

      {preview && (
        <PreviewModal
          item={preview}
          dataUrl={imageCache[preview.id]}
          onClose={() => setPreviewId(null)}
          onDelete={() => {
            setPreviewId(null);
            removeItem(preview.id);
          }}
          onReuse={() => reuseItem(preview)}
          onPrev={() => {
            const currentIdx = filtered.findIndex((i) => i.id === preview.id);
            if (currentIdx > 0) setPreviewId(filtered[currentIdx - 1].id);
          }}
          onNext={() => {
            const currentIdx = filtered.findIndex((i) => i.id === preview.id);
            if (currentIdx >= 0 && currentIdx < filtered.length - 1) {
              setPreviewId(filtered[currentIdx + 1].id);
            }
          }}
        />
      )}
    </>
  );
}

interface GridProps {
  items: HistoryItem[];
  imageCache: Record<string, string>;
  selectMode: boolean;
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
}

function FlatGrid({ items, imageCache, selectMode, selectedIds, onSelect }: GridProps) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => (
        <GalleryCard
          key={item.id}
          item={item}
          dataUrl={imageCache[item.id]}
          selected={selectedIds.has(item.id)}
          selectMode={selectMode}
          onClick={() => onSelect(item.id)}
        />
      ))}
    </div>
  );
}

function GroupedGrid({ items, imageCache, selectMode, selectedIds, onSelect }: GridProps) {
  const groups = groupByPeriod(items);
  return (
    <div className="flex flex-col gap-8">
      {groups.map((g) => (
        <section key={g.label} className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
              {g.label}
            </h2>
            <div className="flex-1 border-t border-[var(--color-border)]" />
            <span className="text-[10px] tabular-nums text-[var(--color-text-subtle)]">
              {g.items.length} 张
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {g.items.map((item) => (
              <GalleryCard
                key={item.id}
                item={item}
                dataUrl={imageCache[item.id]}
                selected={selectedIds.has(item.id)}
                selectMode={selectMode}
                onClick={() => onSelect(item.id)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function GalleryCard({
  item,
  dataUrl,
  selected,
  selectMode,
  onClick,
}: {
  item: HistoryItem;
  dataUrl?: string;
  selected: boolean;
  selectMode: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-[var(--radius-lg)] border bg-[var(--color-panel)] transition-shadow hover:shadow-md",
        selected
          ? "border-[var(--color-text)] ring-2 ring-[var(--color-text)] ring-offset-2 ring-offset-[var(--color-bg)]"
          : "border-[var(--color-border)]"
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className="relative block aspect-square w-full overflow-hidden bg-[var(--color-panel-hover)]"
      >
        {dataUrl ? (
          <img
            src={dataUrl}
            alt={item.prompt}
            className="block h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full place-items-center text-[var(--color-text-subtle)]">
            <Loader2 className="size-4 animate-spin" />
          </div>
        )}
        {selectMode && (
          <div
            className={cn(
              "absolute right-2 top-2 grid size-6 place-items-center rounded-full border-2 backdrop-blur transition-colors",
              selected
                ? "border-[var(--color-text)] bg-[var(--color-text)] text-[var(--color-bg)]"
                : "border-white bg-black/40 text-white"
            )}
          >
            {selected && <Check className="size-3.5" strokeWidth={3} />}
          </div>
        )}
      </button>
      <div className="flex flex-col gap-1 px-3 py-2">
        <p className="line-clamp-2 text-xs text-[var(--color-text)]">
          {item.prompt || "(无提示词)"}
        </p>
        <div className="flex items-center justify-between text-[10px] text-[var(--color-text-subtle)]">
          <span className="truncate">
            {item.width}×{item.height} · {item.providerType}
          </span>
          <span className="tabular-nums">
            {new Date(item.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>
    </div>
  );
}

function groupByPeriod(items: HistoryItem[]): Array<{ label: string; items: HistoryItem[] }> {
  const now = new Date();
  const todayStart = new Date(now).setHours(0, 0, 0, 0);
  const yesterdayStart = todayStart - 86_400_000;
  const weekStart = todayStart - 6 * 86_400_000;
  const monthStart = todayStart - 30 * 86_400_000;

  const groups: Record<string, HistoryItem[]> = {
    今天: [],
    昨天: [],
    "本周内": [],
    "一个月内": [],
    更早: [],
  };
  for (const item of items) {
    if (item.createdAt >= todayStart) groups["今天"].push(item);
    else if (item.createdAt >= yesterdayStart) groups["昨天"].push(item);
    else if (item.createdAt >= weekStart) groups["本周内"].push(item);
    else if (item.createdAt >= monthStart) groups["一个月内"].push(item);
    else groups["更早"].push(item);
  }
  return Object.entries(groups)
    .filter(([, arr]) => arr.length > 0)
    .map(([label, arr]) => ({ label, items: arr }));
}

function PreviewModal({
  item,
  dataUrl,
  onClose,
  onDelete,
  onReuse,
  onPrev,
  onNext,
}: {
  item: HistoryItem;
  dataUrl?: string;
  onReuse: () => void;
  onClose: () => void;
  onDelete: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "ArrowRight") onNext();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, onPrev, onNext]);

  function copyPrompt() {
    navigator.clipboard.writeText(item.prompt).then(() => {
      toast.success("已复制提示词");
    });
  }

  function download() {
    if (!dataUrl) return;
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${item.id}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-8 backdrop-blur"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full max-w-5xl gap-4 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)]"
      >
        <div className="flex items-center justify-center bg-black/50 p-4">
          {dataUrl ? (
            <img
              src={dataUrl}
              alt={item.prompt}
              className="max-h-[calc(100vh-8rem)] max-w-[calc(100vw-20rem)] object-contain"
            />
          ) : (
            <Loader2 className="size-6 animate-spin text-white" />
          )}
        </div>
        <aside className="flex w-64 shrink-0 flex-col overflow-y-auto p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-subtle)]">
              详情
            </span>
            <button
              onClick={onClose}
              className="grid size-6 place-items-center rounded text-[var(--color-text-subtle)] hover:bg-[var(--color-panel)] hover:text-[var(--color-text)]"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="mb-4 flex flex-col gap-3 text-xs">
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">
                提示词
              </div>
              <pre className="whitespace-pre-wrap break-words rounded bg-[var(--color-panel)] p-2 text-[12px] leading-relaxed">
                {item.prompt}
              </pre>
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[var(--color-text-muted)]">
              <span>尺寸</span>
              <span className="text-right text-[var(--color-text)] tabular-nums">
                {item.width}×{item.height}
              </span>
              <span>Provider</span>
              <span className="text-right text-[var(--color-text)] truncate">
                {item.providerId}
              </span>
              <span>类型</span>
              <span className="text-right text-[var(--color-text)]">
                {item.providerType}
              </span>
              {item.seed !== undefined && (
                <>
                  <span>Seed</span>
                  <span className="text-right text-[var(--color-text)] tabular-nums">
                    {item.seed}
                  </span>
                </>
              )}
              <span>时间</span>
              <span className="text-right text-[var(--color-text)]">
                {new Date(item.createdAt).toLocaleString()}
              </span>
            </div>
          </div>
          <div className="mt-auto flex flex-col gap-2">
            <Button size="sm" onClick={onReuse}>
              <RotateCcw className="size-3.5" />
              重新使用
            </Button>
            <Button variant="outline" size="sm" onClick={copyPrompt}>
              <Copy className="size-3.5" />
              复制提示词
            </Button>
            <Button variant="outline" size="sm" onClick={download} disabled={!dataUrl}>
              <Download className="size-3.5" />
              下载
            </Button>
            <Button variant="danger" size="sm" onClick={onDelete}>
              <Trash2 className="size-3.5" />
              删除
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
