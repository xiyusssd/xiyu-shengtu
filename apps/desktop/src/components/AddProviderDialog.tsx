import { useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProviderTypeIcon } from "./ProviderTypeIcon";
import { createProvider } from "@/lib/tauri";
import type { AvailableType } from "@/lib/types";

export function AddProviderDialog({
  availableTypes,
  existingIds,
  onClose,
  onCreated,
  initialType,
}: {
  availableTypes: AvailableType[];
  existingIds: string[];
  onClose: () => void;
  onCreated: (id: string) => void;
  initialType?: string;
}) {
  const [type, setType] = useState(
    initialType ??
      availableTypes.find((t) => t.id === "openai-compat")?.id ??
      availableTypes[0]?.id ??
      ""
  );
  const [id, setId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [endpoint, setEndpoint] = useState("https://api.openai.com/v1");
  const [model, setModel] = useState("dall-e-3");
  const [apiKey, setApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isOpenaiLike = type === "openai-compat";

  const idErr = !id.trim()
    ? undefined
    : !/^[a-zA-Z0-9._-]+$/.test(id)
      ? "只允许字母数字 . _ -"
      : existingIds.includes(id)
        ? "ID 已存在"
        : undefined;

  const canSubmit =
    id.trim() && !idErr && type && (!isOpenaiLike || (endpoint && model));

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await createProvider({
        id,
        type,
        displayName: displayName || undefined,
        endpoint: isOpenaiLike ? endpoint : undefined,
        model: isOpenaiLike ? model : undefined,
        apiKey: apiKey || undefined,
      });
      toast.success(`已添加 Provider "${id}"`);
      onCreated(id);
    } catch (err) {
      toast.error("添加失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
          <h2 className="text-sm font-semibold">添加 Provider</h2>
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
            <Label htmlFor="type">类型</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="inline-flex items-center gap-2">
                      <ProviderTypeIcon type={t.id} size={16} />
                      <span className="font-medium">{t.id}</span>
                      <span className="text-[var(--color-text-subtle)]">
                        {t.displayName}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="id">ID</Label>
            <Input
              id="id"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder="my-openai"
              autoFocus
            />
            {idErr && (
              <span className="text-xs text-[var(--color-danger)]">
                {idErr}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dn">显示名</Label>
            <Input
              id="dn"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="个人 OpenAI"
            />
          </div>
          {isOpenaiLike && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ep">Endpoint</Label>
                <Input
                  id="ep"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="model">模型</Label>
                <Input
                  id="model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="key">API Key</Label>
                <Input
                  id="key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-…"
                />
              </div>
            </>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] bg-[var(--color-panel)] px-5 py-3">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button onClick={submit} disabled={!canSubmit || submitting}>
            {submitting ? "创建中…" : "创建"}
          </Button>
        </div>
      </div>
    </div>
  );
}
