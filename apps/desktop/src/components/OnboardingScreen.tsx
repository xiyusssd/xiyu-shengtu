import { useState } from "react";
import { ArrowRight, Sparkles, Zap } from "lucide-react";
import { AppLogo } from "./AppLogo";
import { AddProviderDialog } from "./AddProviderDialog";
import { ProviderTypeIcon } from "./ProviderTypeIcon";
import type { AvailableType } from "@/lib/types";

/**
 * 首次启动 · 无 provider 时的欢迎屏
 * 呈现"选一种服务 → 加个 provider"的引导
 */

const SUGGESTED_TYPES = [
  {
    id: "openai-compat",
    label: "OpenAI 兼容",
    hint: "OpenAI / One-API / 硅基流动 / 官转",
  },
  {
    id: "volcano-ark",
    label: "火山方舟",
    hint: "字节豆包生图 · doubao-seedream",
  },
  {
    id: "sd-webui",
    label: "Stable Diffusion WebUI",
    hint: "本地部署的 AUTOMATIC1111",
  },
  {
    id: "mock",
    label: "先试用（Mock）",
    hint: "离线占位，不消耗任何 Key",
  },
];

export function OnboardingScreen({
  availableTypes,
  onComplete,
}: {
  availableTypes: AvailableType[];
  onComplete: () => void;
}) {
  const [openWith, setOpenWith] = useState<string | null>(null);

  return (
    <>
      <div className="grid h-full place-items-center overflow-y-auto px-6 py-10">
        <div className="w-full max-w-xl">
          <div className="mb-8 flex flex-col items-center text-center">
            <AppLogo size={72} />
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">
              欢迎使用 xiyu-shengtu
            </h1>
            <p className="mt-2 text-sm text-[var(--color-text-muted)]">
              极简批量生图工作台 · 先选一个 AI 服务开始
            </p>
          </div>

          <div className="grid gap-2">
            {/* 跳过引导 */}
            <button
              type="button"
              onClick={onComplete}
              className="ml-auto inline-flex items-center gap-1 text-xs text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)]"
            >
              先跳过，稍后配置 →
            </button>
            {SUGGESTED_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setOpenWith(t.id)}
                className="group flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3 text-left transition-all hover:border-[var(--color-border-strong)] hover:shadow-md"
              >
                <ProviderTypeIcon type={t.id} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-[var(--color-text)]">
                    {t.label}
                  </div>
                  <div className="text-xs text-[var(--color-text-subtle)]">
                    {t.hint}
                  </div>
                </div>
                <ArrowRight className="size-4 shrink-0 text-[var(--color-text-subtle)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-text)]" />
              </button>
            ))}
          </div>

          <div className="mt-8 grid gap-3 text-xs text-[var(--color-text-subtle)] sm:grid-cols-2">
            <div className="rounded-[var(--radius)] border border-dashed border-[var(--color-border)] p-3">
              <div className="mb-1 inline-flex items-center gap-1 text-[var(--color-text-muted)]">
                <Sparkles className="size-3" />
                批量生图
              </div>
              一次跑多行 prompt · 并发 5 · 每行独立参考图
            </div>
            <div className="rounded-[var(--radius)] border border-dashed border-[var(--color-border)] p-3">
              <div className="mb-1 inline-flex items-center gap-1 text-[var(--color-text-muted)]">
                <Zap className="size-3" />
                本地存储
              </div>
              所有配置和图片都在 ~/.imagegen/，不上云
            </div>
          </div>
        </div>
      </div>

      {openWith && (
        <AddProviderDialog
          availableTypes={availableTypes.length > 0 ? availableTypes : SUGGESTED_TYPES.map(t => ({ id: t.id, displayName: t.label, capabilities: [] }))}
          existingIds={[]}
          initialType={openWith}
          onClose={() => setOpenWith(null)}
          onCreated={() => {
            setOpenWith(null);
            onComplete();
          }}
        />
      )}
    </>
  );
}
