import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, Plus, Trash2, User } from "lucide-react";
import {
  createProfile,
  deleteProfileCmd,
  listProfiles,
  readConfig,
  switchProfile,
} from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { emit as busEmit } from "@/lib/eventBus";

/**
 * Profile 切换器 · 顶栏 dropdown
 * 支持切换/新建/删除
 */
export function ProfileSwitcher() {
  const [profiles, setProfiles] = useState<string[]>([]);
  const [active, setActive] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    try {
      const [list, cfg] = await Promise.all([listProfiles(), readConfig()]);
      setProfiles(list);
      setActive(cfg.activeProfile);
    } catch (err) {
      toast.error("加载 profile 失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function handleSwitch(name: string) {
    if (name === active) {
      setOpen(false);
      return;
    }
    try {
      await switchProfile(name);
      setActive(name);
      toast.success(`已切换到 profile「${name}」`);
      busEmit("profile:changed", name);
      setOpen(false);
    } catch (err) {
      toast.error("切换失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      await createProfile(newName.trim());
      toast.success(`已创建 profile「${newName.trim()}」`);
      setNewName("");
      setCreating(false);
      await reload();
    } catch (err) {
      toast.error("创建失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleDelete(name: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (profiles.length <= 1) {
      toast.error("至少要保留一个 profile");
      return;
    }
    if (!confirm(`确认删除 profile「${name}」？该 profile 下的 provider 会一起清除。`))
      return;
    try {
      await deleteProfileCmd(name);
      toast.success("已删除");
      await reload();
      busEmit("profile:changed", "");
    } catch (err) {
      toast.error("删除失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-text)]"
        title="切换 profile"
      >
        <User className="size-3" />
        <span className="max-w-[80px] truncate tabular-nums">{active || "…"}</span>
        <ChevronDown className="size-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] shadow-xl">
          <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">
            Profile · {profiles.length}
          </div>
          <div className="max-h-56 overflow-y-auto">
            {profiles.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handleSwitch(p)}
                className={cn(
                  "group flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--color-panel)]",
                  p === active ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]"
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {p === active ? (
                    <Check className="size-3.5 text-[var(--color-success)]" />
                  ) : (
                    <span className="w-3.5" />
                  )}
                  <span className="truncate">{p}</span>
                </span>
                {profiles.length > 1 && p !== active && (
                  <button
                    type="button"
                    onClick={(e) => handleDelete(p, e)}
                    className="grid size-6 place-items-center rounded text-[var(--color-text-subtle)] opacity-0 hover:bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)] hover:text-[var(--color-danger)] group-hover:opacity-100"
                    title="删除此 profile"
                  >
                    <Trash2 className="size-3" />
                  </button>
                )}
              </button>
            ))}
          </div>
          <div className="border-t border-[var(--color-border)] bg-[var(--color-panel)] p-2">
            {creating ? (
              <div className="flex gap-1">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") {
                      setCreating(false);
                      setNewName("");
                    }
                  }}
                  placeholder="profile 名字"
                  className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--color-border-strong)]"
                />
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim()}
                  className="rounded bg-[var(--color-accent)] px-2 text-xs text-[var(--color-accent-fg)] disabled:opacity-40"
                >
                  创建
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="inline-flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-panel-hover)] hover:text-[var(--color-text)]"
              >
                <Plus className="size-3" />
                新建 profile
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
