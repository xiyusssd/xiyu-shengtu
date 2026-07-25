import type {
  GenerateEvent,
  GenerateRequest,
  ImageProvider,
  ProviderConfig,
  RunContext,
  ValidationResult,
} from "../types";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function makePlaceholderPng(
  w: number,
  h: number,
  text: string,
  initImage?: string
): string {
  const safeText = escapeXml(text).slice(0, 80);
  // 若有参考图，把它渲染为背景 + 半透明遮罩，证明数据传通
  const bgLayer = initImage
    ? `<image href="${escapeXml(initImage)}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>
       <rect width="100%" height="100%" fill="url(#g)" opacity="0.55"/>`
    : `<rect width="100%" height="100%" fill="url(#g)"/>`;
  const tag = initImage ? "Mock · img2img" : "Mock · text2img";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4f46e5"/>
      <stop offset="1" stop-color="#ec4899"/>
    </linearGradient>
  </defs>
  ${bgLayer}
  <text x="50%" y="46%" text-anchor="middle" fill="#fff" font-size="${Math.max(14, Math.floor(w / 22))}" font-family="-apple-system,Helvetica,Arial,sans-serif" style="paint-order:stroke;stroke:rgba(0,0,0,0.4);stroke-width:2">${tag}</text>
  <text x="50%" y="58%" text-anchor="middle" fill="#fff" opacity="0.9" font-size="${Math.max(10, Math.floor(w / 34))}" font-family="-apple-system,Helvetica,Arial,sans-serif" style="paint-order:stroke;stroke:rgba(0,0,0,0.4);stroke-width:1.5">${safeText}</text>
</svg>`;
  const b64 = Buffer.from(svg).toString("base64");
  return `data:image/svg+xml;base64,${b64}`;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new Error("aborted"));
      });
    }
  });

export const mockProvider: ImageProvider = {
  id: "mock",
  displayName: "Mock（占位）",
  capabilities: ["text2img", "img2img"],
  async validate(_cfg: ProviderConfig): Promise<ValidationResult> {
    return { ok: true, latencyMs: 1, message: "mock 永远通" };
  },
  async *generate(
    _cfg: ProviderConfig,
    req: GenerateRequest,
    ctx?: RunContext
  ): AsyncIterable<GenerateEvent> {
    const steps = [10, 30, 55, 80, 100];
    for (const p of steps) {
      await sleep(200, ctx?.signal);
      yield { type: "progress", percent: p, message: `mock 步进 ${p}%` };
    }
    const w = req.size?.w ?? 512;
    const h = req.size?.h ?? 512;
    yield {
      type: "image",
      dataUrl: makePlaceholderPng(w, h, req.prompt, req.initImage),
      seed: req.seed ?? Math.floor(Math.random() * 1e6),
      meta: {
        width: w,
        height: h,
        format: "png",
        prompt: req.prompt,
        negativePrompt: req.negativePrompt,
        seed: req.seed,
        model: "mock-1",
        providerId: "mock",
      },
    };
    yield { type: "done" };
  },
};
