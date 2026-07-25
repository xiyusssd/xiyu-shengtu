import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  BarChart3,
  Calendar,
  Loader2,
  RefreshCw,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { listHistory, readConfig, type HistoryItem } from "@/lib/tauri";
import { on as busOn } from "@/lib/eventBus";
import { ProviderTypeIcon } from "./ProviderTypeIcon";

/**
 * 数据看板：总量 · 今日 · 本周 · Provider 分布 · 最近 7 天曲线
 */
export function DashboardView() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [profile, setProfile] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [history, cfg] = await Promise.all([listHistory(), readConfig()]);
      setItems(history);
      setProfile(cfg.activeProfile);
    } catch (err) {
      toast.error("加载失败", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    return busOn("profile:changed", () => reload());
  }, [reload]);

  const stats = useMemo(() => computeStats(items), [items]);

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-6 overflow-y-auto px-6 py-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">统计</h1>
          <p className="mt-1 text-xs text-[var(--color-text-subtle)]">
            profile ·{" "}
            <b className="font-medium text-[var(--color-text-muted)]">{profile}</b>{" "}
            · 数据来自本地图库
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={reload} title="刷新">
          <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
        </Button>
      </header>

      {/* 主要指标 */}
      <section className="grid gap-3 sm:grid-cols-4">
        <StatCard
          icon={<Activity className="size-3.5" />}
          label="累计生成"
          value={stats.total.toString()}
          hint={`最近一次 ${stats.mostRecent ? formatRelativeDate(stats.mostRecent) : "从未"}`}
        />
        <StatCard
          icon={<Calendar className="size-3.5" />}
          label="今日"
          value={stats.today.toString()}
        />
        <StatCard
          icon={<Calendar className="size-3.5" />}
          label="本周"
          value={stats.thisWeek.toString()}
        />
        <StatCard
          icon={<Zap className="size-3.5" />}
          label="活跃 Provider"
          value={stats.uniqueProviders.toString()}
        />
      </section>

      {/* 7 天趋势 */}
      <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-4 text-[var(--color-text-muted)]" />
          <h2 className="text-sm font-semibold">最近 7 天</h2>
          <span className="text-xs text-[var(--color-text-subtle)]">
            · 合计 {stats.last7Total} 张
          </span>
        </div>
        {stats.last7.length === 0 || stats.last7Max === 0 ? (
          <div className="grid h-24 place-items-center text-xs text-[var(--color-text-subtle)]">
            近 7 天无数据
          </div>
        ) : (
          <div className="flex h-32 items-end gap-2">
            {stats.last7.map((day) => (
              <div key={day.label} className="flex flex-1 flex-col items-center gap-1.5">
                <div
                  className="w-full rounded-t bg-gradient-to-t from-[#7c3aed] to-[#ec4899] transition-[height]"
                  style={{
                    height: `${(day.count / stats.last7Max) * 100}%`,
                    minHeight: day.count > 0 ? 4 : 0,
                  }}
                  title={`${day.label} · ${day.count} 张`}
                />
                <div className="text-[10px] tabular-nums text-[var(--color-text-subtle)]">
                  {day.label}
                </div>
                <div className="text-[10px] font-medium tabular-nums text-[var(--color-text-muted)]">
                  {day.count || "·"}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Provider 分布 */}
      <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-panel)] p-5">
        <h2 className="text-sm font-semibold">Provider 分布</h2>
        {stats.byProvider.length === 0 ? (
          <div className="grid h-16 place-items-center text-xs text-[var(--color-text-subtle)]">
            尚未生成任何图
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {stats.byProvider.map((row) => (
              <div key={row.providerId} className="flex items-center gap-3">
                <ProviderTypeIcon type={row.providerType} size={20} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate text-[var(--color-text)]">
                      {row.providerId}
                    </span>
                    <span className="tabular-nums text-[var(--color-text-muted)]">
                      {row.count} 张 · {Math.round((row.count / stats.total) * 100)}%
                    </span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-[var(--color-bg)]">
                    <div
                      className="h-full bg-gradient-to-r from-[#7c3aed] to-[#ec4899]"
                      style={{
                        width: `${(row.count / stats.total) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {loading && (
        <div className="flex items-center justify-center gap-2 pt-2 text-xs text-[var(--color-text-subtle)]">
          <Loader2 className="size-3 animate-spin" />
          加载中…
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--color-text-subtle)]">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-[var(--color-text)]">
        {value}
      </div>
      {hint && (
        <div className="mt-1 truncate text-[10px] text-[var(--color-text-subtle)]">
          {hint}
        </div>
      )}
    </div>
  );
}

interface Stats {
  total: number;
  today: number;
  thisWeek: number;
  uniqueProviders: number;
  mostRecent: number | null;
  byProvider: Array<{ providerId: string; providerType: string; count: number }>;
  last7: Array<{ label: string; count: number }>;
  last7Total: number;
  last7Max: number;
}

function computeStats(items: HistoryItem[]): Stats {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  let today = 0;
  let thisWeek = 0;
  const byProvider = new Map<string, { providerType: string; count: number }>();

  for (const item of items) {
    if (item.createdAt >= todayStart.getTime()) today += 1;
    if (item.createdAt >= now - 7 * dayMs) thisWeek += 1;
    const key = item.providerId;
    const existing = byProvider.get(key);
    if (existing) existing.count += 1;
    else byProvider.set(key, { providerType: item.providerType, count: 1 });
  }

  const byProviderArr = Array.from(byProvider.entries())
    .map(([providerId, v]) => ({
      providerId,
      providerType: v.providerType,
      count: v.count,
    }))
    .sort((a, b) => b.count - a.count);

  // 最近 7 天分桶
  const buckets = new Array(7).fill(0);
  for (const item of items) {
    const diff = Math.floor((now - item.createdAt) / dayMs);
    if (diff >= 0 && diff < 7) buckets[6 - diff] += 1;
  }
  const last7 = buckets.map((count, idx) => {
    const dateMs = todayStart.getTime() - (6 - idx) * dayMs;
    const date = new Date(dateMs);
    const label = `${date.getMonth() + 1}/${date.getDate()}`;
    return { label, count };
  });
  const last7Total = last7.reduce((sum, d) => sum + d.count, 0);
  const last7Max = Math.max(...last7.map((d) => d.count), 1);

  return {
    total: items.length,
    today,
    thisWeek,
    uniqueProviders: byProviderArr.length,
    mostRecent: items[0]?.createdAt ?? null,
    byProvider: byProviderArr,
    last7,
    last7Total,
    last7Max,
  };
}

function formatRelativeDate(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚才";
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} 天前`;
  return new Date(ts).toLocaleDateString();
}
