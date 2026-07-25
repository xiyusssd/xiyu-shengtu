import fs from "node:fs";
import path from "node:path";
import { IMAGEGEN_HOME, IMAGES_DIR, LOGS_DIR } from "./paths";

/**
 * 生图历史落盘 · 与桌面 App 的 Rust 侧 history.rs 格式完全一致
 * 三端（网页 / 桌面 / CLI）共享同一份 ~/.imagegen/history.json + images/
 */

const HISTORY_INDEX = path.join(IMAGEGEN_HOME, "history.json");
const MAX_HISTORY_ITEMS = 500;

function ensureDirs(): void {
  for (const dir of [IMAGEGEN_HOME, IMAGES_DIR, LOGS_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export interface HistoryItem {
  id: string;
  prompt: string;
  providerId: string;
  providerType: string;
  width: number;
  height: number;
  seed?: number;
  relativePath: string;
  createdAt: number;
}

interface HistoryIndex {
  items: HistoryItem[];
}

function loadIndex(): HistoryIndex {
  ensureDirs();
  if (!fs.existsSync(HISTORY_INDEX)) return { items: [] };
  try {
    const raw = fs.readFileSync(HISTORY_INDEX, "utf-8");
    const parsed = JSON.parse(raw) as HistoryIndex;
    return parsed.items ? parsed : { items: [] };
  } catch {
    return { items: [] };
  }
}

function saveIndex(idx: HistoryIndex): void {
  ensureDirs();
  const tmp = `${HISTORY_INDEX}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(idx, null, 2), "utf-8");
  fs.renameSync(tmp, HISTORY_INDEX);
}

function shortId(): string {
  const t = Date.now().toString(16);
  const r = Math.floor(Math.random() * 0xffffffff).toString(16);
  return `${t}-${r}`;
}

function decodeDataUrl(dataUrl: string): { bytes: Buffer; ext: string } {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  const mime = m?.[1] ?? "image/png";
  const b64 = m?.[2] ?? dataUrl;
  const bytes = Buffer.from(b64, "base64");
  const ext = mime.includes("svg")
    ? "svg"
    : mime.includes("jpeg") || mime.includes("jpg")
      ? "jpg"
      : mime.includes("webp")
        ? "webp"
        : "png";
  return { bytes, ext };
}

export interface AppendHistoryInput {
  prompt: string;
  providerId: string;
  providerType: string;
  width: number;
  height: number;
  seed?: number;
  dataUrl: string;
}

/** 把一张生成图写到 images/ 并 append 到 history.json；返回落盘记录 */
export function appendHistoryItem(input: AppendHistoryInput): HistoryItem {
  ensureDirs();
  const { bytes, ext } = decodeDataUrl(input.dataUrl);
  const id = shortId();
  const filename = `${id}.${ext}`;
  fs.writeFileSync(path.join(IMAGES_DIR, filename), bytes);

  const item: HistoryItem = {
    id,
    prompt: input.prompt,
    providerId: input.providerId,
    providerType: input.providerType,
    width: input.width,
    height: input.height,
    seed: input.seed,
    relativePath: `images/${filename}`,
    createdAt: Date.now(),
  };

  const idx = loadIndex();
  idx.items.unshift(item);
  if (idx.items.length > MAX_HISTORY_ITEMS) {
    const pruned = idx.items.splice(MAX_HISTORY_ITEMS);
    for (const extra of pruned) {
      try {
        fs.rmSync(path.join(IMAGEGEN_HOME, extra.relativePath));
      } catch {
        /* ignore */
      }
    }
  }
  saveIndex(idx);
  return item;
}

export function listHistory(): HistoryItem[] {
  return loadIndex().items;
}
