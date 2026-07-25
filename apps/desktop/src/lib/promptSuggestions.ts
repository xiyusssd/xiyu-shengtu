import { listHistory, listTemplates } from "./tauri";

/**
 * 从图库最近 100 条 + 模板收集 prompt 候选
 * 供 Textarea 自动补全用
 */

export interface PromptSuggestion {
  source: "history" | "template";
  label: string;
  prompt: string;
  hint?: string;
}

let cached: PromptSuggestion[] | null = null;
let cacheAt = 0;
const TTL_MS = 60_000;

export async function getSuggestions(): Promise<PromptSuggestion[]> {
  if (cached && Date.now() - cacheAt < TTL_MS) return cached;
  try {
    const [history, templates] = await Promise.all([
      listHistory(),
      listTemplates(),
    ]);
    const seen = new Set<string>();
    const list: PromptSuggestion[] = [];

    for (const t of templates) {
      const key = t.prompt.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      list.push({
        source: "template",
        label: t.name,
        prompt: t.prompt,
        hint: "模板",
      });
    }

    for (const h of history.slice(0, 100)) {
      const key = h.prompt.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      list.push({
        source: "history",
        label: h.prompt.slice(0, 60),
        prompt: h.prompt,
        hint: `历史 · ${new Date(h.createdAt).toLocaleDateString()}`,
      });
    }

    cached = list;
    cacheAt = Date.now();
    return list;
  } catch {
    return [];
  }
}

export function invalidateSuggestions() {
  cached = null;
}
