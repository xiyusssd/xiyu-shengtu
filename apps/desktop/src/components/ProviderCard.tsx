import { Check, Circle, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProviderTypeIcon } from "./ProviderTypeIcon";
import type { ProviderRow } from "@/lib/types";

export function ProviderCard({
  provider,
  isActive,
  isSelected,
  onSelect,
  onActivate,
}: {
  provider: ProviderRow;
  isActive: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onActivate: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        "group relative cursor-pointer rounded-[var(--radius-lg)] border p-3 transition-all",
        isSelected
          ? "border-[var(--color-text)] bg-[var(--color-panel)] shadow-sm"
          : "border-[var(--color-border)] bg-transparent hover:bg-[var(--color-panel)]"
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={onActivate}
          title={isActive ? "当前使用中" : "设为当前 Provider"}
          className={cn(
            "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition-colors",
            isActive
              ? "border-[var(--color-success)] bg-[var(--color-success)] text-white"
              : "border-[var(--color-border-strong)] text-transparent hover:border-[var(--color-text-muted)] hover:text-[var(--color-text-muted)]"
          )}
        >
          {isActive ? (
            <Check className="size-3" strokeWidth={3} />
          ) : (
            <Circle className="size-2 fill-current" />
          )}
        </button>
        <ProviderTypeIcon type={provider.type} size={30} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-[var(--color-text)]">
              {provider.displayName || provider.id}
            </span>
            {provider.hasKey && (
              <KeyRound className="size-3 text-[var(--color-text-subtle)]" />
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--color-text-subtle)]">
            <span className="rounded bg-[var(--color-panel-hover)] px-1.5 py-0.5 tabular-nums">
              {provider.type}
            </span>
            <span className="truncate">{provider.id}</span>
          </div>
        </div>
      </div>
      {isActive && (
        <div className="mt-2 flex items-center gap-1 text-[10px] font-medium text-[var(--color-success)]">
          <span className="size-1.5 rounded-full bg-[var(--color-success)] animate-pulse" />
          使用中
        </div>
      )}
    </div>
  );
}
