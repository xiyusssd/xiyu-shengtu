export type Capability = "text2img" | "img2img" | "inpaint" | "upscale";

export interface ProviderConfig {
  type: string;
  displayName?: string;
  endpoint?: string;
  model?: string;
  apiKey?: string;
  extra?: Record<string, unknown>;
}

export interface GenerateRequest {
  prompt: string;
  negativePrompt?: string;
  size: { w: number; h: number };
  steps?: number;
  cfg?: number;
  seed?: number;
  batchSize?: number;
  /**
   * 参考图（img2img）。data URL 或 base64（不带前缀时按 image/png 处理）。
   * Provider 支持 img2img capability 时才会启用。
   */
  initImage?: string;
  /**
   * 参考图强度 0-1，越高越接近原图。默认由 Provider 决定。
   */
  imageStrength?: number;
  extra?: Record<string, unknown>;
}

export interface ImageMeta {
  width: number;
  height: number;
  format: "png" | "jpeg" | "webp";
  prompt: string;
  negativePrompt?: string;
  seed?: number;
  model?: string;
  providerId: string;
}

export type GenerateEvent =
  | { type: "progress"; percent: number; message?: string }
  | { type: "image"; dataUrl: string; seed?: number; meta: ImageMeta }
  | { type: "error"; code: string; message: string }
  | { type: "done" };

export interface ValidationResult {
  ok: boolean;
  latencyMs?: number;
  message?: string;
}

export interface RunContext {
  signal?: AbortSignal;
  onLog?: (msg: string) => void;
}

export interface ImageProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: Capability[];
  validate(cfg: ProviderConfig, ctx?: RunContext): Promise<ValidationResult>;
  generate(
    cfg: ProviderConfig,
    req: GenerateRequest,
    ctx?: RunContext
  ): AsyncIterable<GenerateEvent>;
}
