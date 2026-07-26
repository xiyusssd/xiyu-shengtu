import type { HistoryItem } from "./tauri";

/**
 * 生图成本估算（纯前端，基于 providerType + 尺寸的粗略单价表）
 * 只做参考量级，不同模型/档位实际价格以各家账单为准。
 */

// 单张估价（美元）。按 provider 类型给区间中值。
interface PriceRule {
  base: number; // 1024×1024 档位单张价
  hdMultiplier?: number; // 更大尺寸倍率
}

const PRICE_TABLE: Record<string, PriceRule> = {
  // OpenAI DALL·E 3 standard 1024² ≈ $0.04；hd ≈ $0.08
  "openai-compat": { base: 0.04, hdMultiplier: 2 },
  // 火山方舟豆包生图，量级约 ¥0.2/张 ≈ $0.028
  "volcano-ark": { base: 0.028 },
  // 本地 SD-WebUI：电费级别，近似 0
  "sd-webui": { base: 0 },
  // Mock：免费
  mock: { base: 0 },
};

const DEFAULT_RULE: PriceRule = { base: 0.02 };

/** 估算单张成本（美元）*/
export function estimateCost(item: {
  providerType: string;
  width: number;
  height: number;
}): number {
  const rule = PRICE_TABLE[item.providerType] ?? DEFAULT_RULE;
  const pixels = item.width * item.height;
  const isHd = pixels > 1024 * 1024;
  return isHd && rule.hdMultiplier
    ? rule.base * rule.hdMultiplier
    : rule.base;
}

export interface CostSummary {
  total: number;
  today: number;
  byProvider: Array<{ providerId: string; providerType: string; cost: number; count: number }>;
  billableCount: number; // 非免费张数
}

export function summarizeCost(items: HistoryItem[]): CostSummary {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  let total = 0;
  let today = 0;
  let billableCount = 0;
  const byProvider = new Map<
    string,
    { providerType: string; cost: number; count: number }
  >();

  for (const item of items) {
    const c = estimateCost(item);
    total += c;
    if (c > 0) billableCount += 1;
    if (item.createdAt >= todayStart.getTime()) today += c;
    const cur = byProvider.get(item.providerId);
    if (cur) {
      cur.cost += c;
      cur.count += 1;
    } else {
      byProvider.set(item.providerId, {
        providerType: item.providerType,
        cost: c,
        count: 1,
      });
    }
  }

  return {
    total,
    today,
    billableCount,
    byProvider: Array.from(byProvider.entries())
      .map(([providerId, v]) => ({ providerId, ...v }))
      .sort((a, b) => b.cost - a.cost),
  };
}

export function formatUsd(v: number): string {
  if (v === 0) return "$0";
  if (v < 0.01) return "<$0.01";
  return "$" + v.toFixed(2);
}
