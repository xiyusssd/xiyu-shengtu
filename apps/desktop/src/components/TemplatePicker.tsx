import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bookmark, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  createTemplate,
  deleteTemplate,
  listTemplates,
  type PromptTemplate,
} from "@/lib/tauri";

/**
 * 模板选择器 · 弹层
 * 左侧列表 + 右侧详情/新建表单
 */
export function TemplatePicker({
  onClose,
  onPick,
  currentPrompt,
}: {
  onClose: () => void;
  onPick: (prompt: string) => void;
  currentPrompt: string;
}) {
  const [items, setItems] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrompt, setNewPrompt] = useState(currentPrompt);

  async function reload() {
    setLoading(true);
    try {
      const list = await listTemplates();
      setItems(list);
      if (list.length > 0 && !selectedId) setSelectedId(list[0].id);
    } catch (err) {
      toast.error("加载模板失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  const selected = items.find((t) => t.id === selectedId) ?? null;

  async function submitNew() {
    if (!newName.trim() || !newPrompt.trim()) return;
    try {
      const t = await createTemplate({
        name: newName.trim(),
        prompt: newPrompt.trim(),
      });
      toast.success(`已保存"${t.name}"`);
      setCreating(false);
      setNewName("");
      await reload();
      setSelectedId(t.id);
    } catch (err) {
      toast.error("保存失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function removeSelected() {
    if (!selected) return;
    if (!confirm(`删除模板"${selected.name}"？`)) return;
    try {
      await deleteTemplate(selected.id);
      toast.success("已删除");
      setSelectedId(null);
      await reload();
    } catch (err) {
      toast.error("删除失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-[500px] w-full max-w-3xl overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl"
      >
        {/* 左栏 · 列表 */}
        <aside className="flex w-56 flex-col border-r border-[var(--color-border)] bg-[var(--color-panel)]">
          <div className="flex items-center justify-between px-3 py-2.5">
            <div className="flex items-center gap-1.5">
              <Bookmark className="size-4 text-[var(--color-text-muted)]" />
              <span className="text-sm font-semibold">模板</span>
              <span className="text-xs text-[var(--color-text-subtle)]">
                {items.length}
              </span>
            </div>
            <button
              onClick={onClose}
              className="grid size-6 place-items-center rounded text-[var(--color-text-subtle)] hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-text)]"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2">
            {loading ? (
              <div className="py-8 text-center text-xs text-[var(--color-text-subtle)]">
                加载中…
              </div>
            ) : items.length === 0 && !creating ? (
              <div className="py-8 text-center text-xs text-[var(--color-text-subtle)]">
                还没有模板
              </div>
            ) : (
              items.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelectedId(t.id);
                    setCreating(false);
                  }}
                  className={cn(
                    "w-full rounded-[var(--radius)] px-2.5 py-1.5 text-left text-sm transition-colors",
                    selectedId === t.id && !creating
                      ? "bg-[var(--color-bg)] text-[var(--color-text)]"
                      : "text-[var(--color-text-muted)] hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-text)]"
                  )}
                >
                  <div className="truncate font-medium">{t.name}</div>
                  <div className="truncate text-[11px] text-[var(--color-text-subtle)]">
                    {t.prompt}
                  </div>
                </button>
              ))
            )}
          </div>
          <button
            onClick={() => {
              setCreating(true);
              setSelectedId(null);
              setNewPrompt(currentPrompt);
              setNewName("");
            }}
            className="m-2 inline-flex items-center justify-center gap-1.5 rounded-[var(--radius)] border border-dashed border-[var(--color-border-strong)] py-2 text-xs text-[var(--color-text-muted)] hover:border-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            <Plus className="size-3.5" />
            新建模板
          </button>
        </aside>

        {/* 右栏 · 详情 / 新建 */}
        <main className="flex flex-1 flex-col">
          {creating ? (
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-6 py-5">
              <h3 className="text-base font-semibold">新建模板</h3>
              <div className="flex flex-col gap-1.5">
                <Label>名字</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="例如「电影海报风」"
                  autoFocus
                />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <Label>提示词</Label>
                <Textarea
                  value={newPrompt}
                  onChange={(e) => setNewPrompt(e.target.value)}
                  placeholder="把当前正在写的提示词存起来，或者手动写一个模板"
                  className="flex-1"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setCreating(false)}>
                  取消
                </Button>
                <Button
                  onClick={submitNew}
                  disabled={!newName.trim() || !newPrompt.trim()}
                >
                  保存
                </Button>
              </div>
            </div>
          ) : selected ? (
            <div className="flex flex-1 flex-col overflow-y-auto">
              <header className="flex items-start justify-between gap-2 border-b border-[var(--color-border)] px-6 py-4">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold">
                    {selected.name}
                  </h3>
                  <p className="text-[11px] text-[var(--color-text-subtle)]">
                    {new Date(selected.createdAt).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={removeSelected}
                  title="删除"
                  className="grid size-7 place-items-center rounded text-[var(--color-text-subtle)] hover:bg-[var(--color-panel)] hover:text-[var(--color-danger)]"
                >
                  <Trash2 className="size-4" />
                </button>
              </header>
              <div className="flex-1 overflow-y-auto px-6 py-5">
                <pre className="whitespace-pre-wrap break-words rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-panel)] p-3 text-sm leading-relaxed text-[var(--color-text)]">
                  {selected.prompt}
                </pre>
              </div>
              <footer className="flex justify-end gap-2 border-t border-[var(--color-border)] px-6 py-3">
                <Button variant="ghost" onClick={onClose}>
                  取消
                </Button>
                <Button
                  onClick={() => {
                    onPick(selected.prompt);
                    onClose();
                  }}
                >
                  填入当前行
                </Button>
              </footer>
            </div>
          ) : (
            <div className="grid flex-1 place-items-center text-sm text-[var(--color-text-subtle)]">
              左侧选一个模板，或点"新建模板"
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
