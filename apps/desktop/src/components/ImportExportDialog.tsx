import { useState } from "react";
import { toast } from "sonner";
import { Download, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { exportProviders, importProviders } from "@/lib/tauri";

type Mode = "export" | "import";
type ImportMode = "merge" | "overwrite" | "replace";

export function ImportExportDialog({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<Mode>("export");

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
          <div className="flex items-center gap-3">
            <ModeTab
              active={mode === "export"}
              onClick={() => setMode("export")}
              icon={<Download className="size-3.5" />}
              label="导出"
            />
            <ModeTab
              active={mode === "import"}
              onClick={() => setMode("import")}
              icon={<Upload className="size-3.5" />}
              label="导入"
            />
          </div>
          <button
            onClick={onClose}
            className="grid size-7 place-items-center rounded text-[var(--color-text-subtle)] hover:bg-[var(--color-panel)] hover:text-[var(--color-text)]"
          >
            <X className="size-4" />
          </button>
        </div>

        {mode === "export" ? (
          <ExportPanel onClose={onClose} />
        ) : (
          <ImportPanel
            onClose={onClose}
            onSuccess={() => {
              onChanged();
              onClose();
            }}
          />
        )}
      </div>
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-[var(--color-panel)] text-[var(--color-text)]"
          : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function ExportPanel({ onClose }: { onClose: () => void }) {
  const [includeKeys, setIncludeKeys] = useState(false);
  const [json, setJson] = useState("");
  const [loading, setLoading] = useState(false);

  async function doExport() {
    setLoading(true);
    try {
      const result = await exportProviders(includeKeys);
      setJson(result);
    } catch (err) {
      toast.error("导出失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }

  function copyJson() {
    if (!json) return;
    navigator.clipboard.writeText(json).then(() => {
      toast.success("已复制到剪贴板");
    });
  }

  function downloadJson() {
    if (!json) return;
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `imagegen-providers-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="flex flex-col gap-4 px-5 py-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--color-text-muted)]">
          <input
            type="checkbox"
            checked={includeKeys}
            onChange={(e) => setIncludeKeys(e.target.checked)}
            className="size-3.5 accent-[var(--color-accent)]"
          />
          包含 API Key
          <span className="text-[10px] text-[var(--color-danger)]">
            （明文，仅用于备份，切勿外发）
          </span>
        </label>

        <div className="flex flex-col gap-1.5">
          <Label>JSON 内容</Label>
          <Textarea
            value={json}
            readOnly
            placeholder={loading ? "生成中…" : "点击右下角「生成 JSON」"}
            className="min-h-56 font-mono text-[12px]"
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] bg-[var(--color-panel)] px-5 py-3">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={copyJson} disabled={!json}>
            复制
          </Button>
          <Button variant="outline" size="sm" onClick={downloadJson} disabled={!json}>
            下载 JSON
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
          <Button onClick={doExport} disabled={loading}>
            {loading ? "生成中…" : json ? "重新生成" : "生成 JSON"}
          </Button>
        </div>
      </div>
    </>
  );
}

function ImportPanel({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [json, setJson] = useState("");
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const [loading, setLoading] = useState(false);

  async function doImport() {
    if (!json.trim()) return;
    setLoading(true);
    try {
      const result = await importProviders(json, importMode);
      toast.success(
        `导入完成：新增 ${result.added} · 覆盖 ${result.overwritten} · 跳过 ${result.skipped}`
      );
      onSuccess();
    } catch (err) {
      toast.error("导入失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4 px-5 py-4">
        <div className="flex flex-col gap-1.5">
          <Label>粘贴导出的 JSON</Label>
          <Textarea
            value={json}
            onChange={(e) => setJson(e.target.value)}
            placeholder='{"version":1,"exportedAt":...,"providers":{...}}'
            className="min-h-56 font-mono text-[12px]"
            autoFocus
          />
        </div>

        <div className="flex items-center gap-3">
          <Label className="text-xs text-[var(--color-text-muted)]">冲突时</Label>
          <div className="flex gap-1 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-panel)] p-0.5">
            <ImportModeButton
              active={importMode === "merge"}
              onClick={() => setImportMode("merge")}
              label="跳过"
              hint="保留现有 provider，重名的 skip"
            />
            <ImportModeButton
              active={importMode === "overwrite"}
              onClick={() => setImportMode("overwrite")}
              label="覆盖"
              hint="重名的覆盖现有"
            />
            <ImportModeButton
              active={importMode === "replace"}
              onClick={() => setImportMode("replace")}
              label="全部替换"
              hint="清空现有，只保留导入的"
            />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] bg-[var(--color-panel)] px-5 py-3">
        <Button variant="ghost" onClick={onClose}>
          取消
        </Button>
        <Button onClick={doImport} disabled={!json.trim() || loading}>
          {loading ? "导入中…" : "导入"}
        </Button>
      </div>
    </>
  );
}

function ImportModeButton({
  active,
  onClick,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={
        active
          ? "rounded-[var(--radius-sm)] bg-[var(--color-bg)] px-2.5 py-1 text-xs font-medium text-[var(--color-text)] shadow-sm"
          : "rounded-[var(--radius-sm)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      }
    >
      {label}
    </button>
  );
}
