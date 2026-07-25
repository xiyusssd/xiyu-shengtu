import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  Copy,
  Loader2,
  Play,
  Save,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProviderTypeIcon } from "./ProviderTypeIcon";
import { deleteProvider, testProvider, updateProvider } from "@/lib/tauri";
import type { ProviderRow } from "@/lib/types";

interface Draft {
  displayName: string;
  endpoint: string;
  model: string;
  apiKey: string;
  keyChanged: boolean;
}

export function ProviderEditor({
  provider,
  isActive,
  onChanged,
  onActivate,
  onDelete,
  onDuplicate,
}: {
  provider: ProviderRow;
  isActive: boolean;
  onChanged: () => void;
  onActivate: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const [draft, setDraft] = useState<Draft>({
    displayName: provider.displayName ?? "",
    endpoint: provider.endpoint ?? "",
    model: provider.model ?? "",
    apiKey: "",
    keyChanged: false,
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: boolean; message?: string; latencyMs?: number } | null
  >(null);

  useEffect(() => {
    setDraft({
      displayName: provider.displayName ?? "",
      endpoint: provider.endpoint ?? "",
      model: provider.model ?? "",
      apiKey: "",
      keyChanged: false,
    });
    setTestResult(null);
  }, [provider.id]);

  const dirty =
    draft.displayName !== (provider.displayName ?? "") ||
    draft.endpoint !== (provider.endpoint ?? "") ||
    draft.model !== (provider.model ?? "") ||
    draft.keyChanged;
  const isOpenaiLike = provider.type === "openai-compat";

  async function save() {
    setSaving(true);
    try {
      const patch: Record<string, unknown> = {
        displayName: draft.displayName,
      };
      if (isOpenaiLike) {
        patch.endpoint = draft.endpoint;
        patch.model = draft.model;
      }
      if (draft.keyChanged) {
        if (draft.apiKey === "") {
          patch.clearKey = true;
        } else {
          patch.apiKey = draft.apiKey;
        }
      }
      await updateProvider(provider.id, patch as any);
      toast.success("已保存修改");
      onChanged();
    } catch (err) {
      toast.error("保存失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testProvider(provider.id);
      setTestResult(res);
      if (res.ok) {
        toast.success(`连通 · ${res.latencyMs ?? "?"}ms`);
      } else {
        toast.error("连通失败", { description: res.message });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestResult({ ok: false, message: msg });
      toast.error("测试失败", { description: msg });
    } finally {
      setTesting(false);
    }
  }

  async function del() {
    if (!confirm(`确认删除 Provider "${provider.id}"？`)) return;
    try {
      await deleteProvider(provider.id);
      toast.success("已删除");
      onDelete();
    } catch (err) {
      toast.error("删除失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-6 py-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <ProviderTypeIcon type={provider.type} size={42} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold tracking-tight">
              {provider.displayName || provider.id}
            </h2>
            <p className="mt-0.5 flex items-center gap-2 text-xs text-[var(--color-text-subtle)]">
              <span className="rounded bg-[var(--color-panel)] px-1.5 py-0.5 tabular-nums">
                {provider.type}
              </span>
              <span className="truncate">{provider.id}</span>
            </p>
          </div>
        </div>
        {isActive ? (
          <div className="inline-flex items-center gap-1.5 rounded-[var(--radius)] bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)] px-3 py-1.5 text-xs font-medium text-[var(--color-success)]">
            <span className="size-1.5 rounded-full bg-[var(--color-success)] animate-pulse" />
            当前 Provider
          </div>
        ) : (
          <Button onClick={onActivate} size="sm">
            <Check className="size-3.5" />
            设为当前
          </Button>
        )}
      </header>

      <div className="flex flex-1 flex-col gap-6 px-6 py-6">
        <section className="flex flex-col gap-3">
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-subtle)]">
            基本信息
          </div>
          <div className="grid gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dn">显示名</Label>
              <Input
                id="dn"
                value={draft.displayName}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, displayName: e.target.value }))
                }
                placeholder={provider.id}
              />
            </div>
          </div>
        </section>

        {isOpenaiLike && (
          <section className="flex flex-col gap-3">
            <div className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-subtle)]">
              接口配置
            </div>
            <div className="grid gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ep">Endpoint</Label>
                <Input
                  id="ep"
                  value={draft.endpoint}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, endpoint: e.target.value }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="model">模型</Label>
                <Input
                  id="model"
                  value={draft.model}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, model: e.target.value }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="key">
                  API Key{" "}
                  {provider.keyMasked && !draft.keyChanged && (
                    <span className="text-[var(--color-text-subtle)]">
                      · 当前 {provider.keyMasked}
                    </span>
                  )}
                </Label>
                <Input
                  id="key"
                  type="password"
                  value={draft.apiKey}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      apiKey: e.target.value,
                      keyChanged: true,
                    }))
                  }
                  placeholder={
                    provider.hasKey ? "留空表示不修改" : "sk-…"
                  }
                />
                {draft.keyChanged && draft.apiKey === "" && (
                  <span className="text-xs text-[var(--color-danger)]">
                    保存将清除现有 API Key
                  </span>
                )}
              </div>
            </div>
          </section>
        )}

        {testResult && (
          <section
            className={
              testResult.ok
                ? "rounded-[var(--radius)] border border-[var(--color-success)]/40 bg-[color-mix(in_srgb,var(--color-success)_8%,transparent)] p-3 text-sm text-[var(--color-success)]"
                : "rounded-[var(--radius)] border border-[var(--color-danger)]/40 bg-[color-mix(in_srgb,var(--color-danger)_8%,transparent)] p-3 text-sm text-[var(--color-danger)]"
            }
          >
            <div className="flex items-center gap-2 font-medium">
              {testResult.ok ? (
                <>
                  <Check className="size-4" />
                  连通成功 · {testResult.latencyMs ?? "?"}ms
                </>
              ) : (
                <>
                  <TriangleAlert className="size-4" />
                  连通失败
                </>
              )}
            </div>
            {testResult.message && (
              <div className="mt-1 break-all text-xs opacity-90">
                {testResult.message}
              </div>
            )}
          </section>
        )}

        <section className="flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-4">
          <Button variant="outline" size="sm" onClick={test} disabled={testing}>
            {testing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5" />
            )}
            {testing ? "测试中…" : "测试连通性"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={save}
            disabled={!dirty || saving}
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            保存修改
          </Button>
          <Button variant="ghost" size="sm" onClick={onDuplicate}>
            <Copy className="size-3.5" />
            复制
          </Button>
          <div className="flex-1" />
          <Button variant="danger" size="sm" onClick={del}>
            <Trash2 className="size-3.5" />
            删除
          </Button>
        </section>
      </div>
    </div>
  );
}
