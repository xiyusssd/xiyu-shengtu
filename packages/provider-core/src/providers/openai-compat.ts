import type {
  GenerateEvent,
  GenerateRequest,
  ImageProvider,
  ProviderConfig,
  RunContext,
  ValidationResult,
} from "../types";

interface OpenAIImageResponse {
  created?: number;
  data?: Array<{
    b64_json?: string;
    url?: string;
    revised_prompt?: string;
  }>;
  error?: { message?: string; type?: string; code?: string };
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/$/, "");
  const p = path.replace(/^\//, "");
  return `${b}/${p}`;
}

async function fetchImageAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`拉取图片失败: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") ?? "image/png";
  return `data:${contentType};base64,${buf.toString("base64")}`;
}

/** 把 data URL 或裸 base64 转成 Blob（供 multipart 上传） */
function dataUrlToBlob(dataUrl: string): Blob {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (match) {
    const [, mime, b64] = match;
    const buf = Buffer.from(b64, "base64");
    return new Blob([buf], { type: mime });
  }
  // 裸 base64，按 png 处理
  const buf = Buffer.from(dataUrl, "base64");
  return new Blob([buf], { type: "image/png" });
}

export const openaiCompatProvider: ImageProvider = {
  id: "openai-compat",
  displayName: "OpenAI 兼容（含 One-API / New-API / 硅基流动）",
  capabilities: ["text2img", "img2img"],

  async validate(cfg: ProviderConfig): Promise<ValidationResult> {
    if (!cfg.endpoint) return { ok: false, message: "缺少 endpoint" };
    if (!cfg.apiKey) return { ok: false, message: "缺少 apiKey" };
    if (!cfg.model) return { ok: false, message: "缺少 model" };
    const t0 = Date.now();
    try {
      const url = joinUrl(cfg.endpoint, "/images/generations");
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          prompt: "a small red dot on white background",
          n: 1,
          size: "1024x1024",
        }),
        signal: AbortSignal.timeout(15000),
      });
      const latencyMs = Date.now() - t0;
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return {
          ok: false,
          latencyMs,
          message: `HTTP ${res.status} ${text.slice(0, 200)}`,
        };
      }
      const json = (await res.json()) as OpenAIImageResponse;
      if (json.error) {
        return {
          ok: false,
          latencyMs,
          message: json.error.message ?? "unknown error",
        };
      }
      return { ok: true, latencyMs, message: "OK" };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - t0,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  },

  async *generate(
    cfg: ProviderConfig,
    req: GenerateRequest,
    ctx?: RunContext
  ): AsyncIterable<GenerateEvent> {
    if (!cfg.endpoint || !cfg.apiKey || !cfg.model) {
      yield {
        type: "error",
        code: "invalid_config",
        message: "endpoint / apiKey / model 均需配置",
      };
      return;
    }

    const useImg2Img = Boolean(req.initImage);
    yield {
      type: "progress",
      percent: 5,
      message: useImg2Img ? "已发起 img2img 请求" : "已发起请求",
    };

    let response: Response;
    try {
      if (useImg2Img) {
        // OpenAI 兼容 /v1/images/edits 走 multipart。model 需支持 edits（dall-e-2 / gpt-image-1 等）
        const url = joinUrl(cfg.endpoint, "/images/edits");
        const form = new FormData();
        form.append("model", cfg.model);
        form.append("prompt", req.prompt);
        form.append("n", String(Math.min(req.batchSize ?? 1, 4)));
        form.append("size", `${req.size?.w ?? 1024}x${req.size?.h ?? 1024}`);
        form.append("image", dataUrlToBlob(req.initImage!), "reference.png");
        response = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${cfg.apiKey}` },
          body: form,
          signal: ctx?.signal,
        });
      } else {
        const size = `${req.size?.w ?? 1024}x${req.size?.h ?? 1024}`;
        const url = joinUrl(cfg.endpoint, "/images/generations");
        response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cfg.apiKey}`,
          },
          body: JSON.stringify({
            model: cfg.model,
            prompt: req.prompt,
            n: Math.min(req.batchSize ?? 1, 4),
            size,
            response_format: "b64_json",
            ...((cfg.extra ?? {}) as Record<string, unknown>),
          }),
          signal: ctx?.signal,
        });
      }
    } catch (err) {
      yield {
        type: "error",
        code: "network_error",
        message: err instanceof Error ? err.message : String(err),
      };
      return;
    }

    yield { type: "progress", percent: 60, message: "服务端已响应" };

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      yield {
        type: "error",
        code: `http_${response.status}`,
        message: text.slice(0, 500) || `HTTP ${response.status}`,
      };
      return;
    }
    const json = (await response.json()) as OpenAIImageResponse;
    if (json.error) {
      yield {
        type: "error",
        code: json.error.code ?? "provider_error",
        message: json.error.message ?? "unknown provider error",
      };
      return;
    }
    if (!json.data?.length) {
      yield { type: "error", code: "empty_response", message: "无图片数据返回" };
      return;
    }

    yield { type: "progress", percent: 90, message: "解析图片" };

    let i = 0;
    for (const item of json.data) {
      let dataUrl: string;
      if (item.b64_json) {
        dataUrl = `data:image/png;base64,${item.b64_json}`;
      } else if (item.url) {
        try {
          dataUrl = await fetchImageAsDataUrl(item.url);
        } catch (err) {
          yield {
            type: "error",
            code: "fetch_image_failed",
            message: err instanceof Error ? err.message : String(err),
          };
          continue;
        }
      } else {
        continue;
      }
      i += 1;
      yield {
        type: "image",
        dataUrl,
        meta: {
          width: req.size?.w ?? 1024,
          height: req.size?.h ?? 1024,
          format: "png",
          prompt: item.revised_prompt ?? req.prompt,
          negativePrompt: req.negativePrompt,
          model: cfg.model,
          providerId: "openai-compat",
        },
      };
    }
    if (i === 0) {
      yield {
        type: "error",
        code: "no_image_decoded",
        message: "响应中未提取到图片（既无 b64_json 也无 url）",
      };
      return;
    }
    yield { type: "progress", percent: 100 };
    yield { type: "done" };
  },
};
