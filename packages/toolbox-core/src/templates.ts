export interface ProviderTemplateField {
  key: string;
  label: string;
  type: "text" | "password" | "url";
  required?: boolean;
  placeholder?: string;
  default?: string;
}

export interface ProviderTemplate {
  type: string;
  displayName: string;
  fields: ProviderTemplateField[];
}

export const PROVIDER_TEMPLATES: ProviderTemplate[] = [
  {
    type: "mock",
    displayName: "Mock 占位（离线测试）",
    fields: [
      {
        key: "displayName",
        label: "显示名",
        type: "text",
        default: "本地 Mock",
      },
    ],
  },
  {
    type: "openai-compat",
    displayName: "OpenAI 兼容（One-API / New-API / 硅基流动 等）",
    fields: [
      { key: "displayName", label: "显示名", type: "text", required: true },
      {
        key: "endpoint",
        label: "Endpoint",
        type: "url",
        required: true,
        placeholder: "https://api.openai.com/v1",
        default: "https://api.openai.com/v1",
      },
      {
        key: "model",
        label: "模型",
        type: "text",
        required: true,
        placeholder: "dall-e-3 / gpt-image-1 / …",
        default: "dall-e-3",
      },
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        required: true,
        placeholder: "sk-…",
      },
    ],
  },
  {
    type: "volcano-ark",
    displayName: "火山方舟（豆包生图 · doubao-seedream）",
    fields: [
      { key: "displayName", label: "显示名", type: "text", required: true },
      {
        key: "endpoint",
        label: "Endpoint（可选）",
        type: "url",
        placeholder: "https://ark.cn-beijing.volces.com/api/v3",
        default: "https://ark.cn-beijing.volces.com/api/v3",
      },
      {
        key: "model",
        label: "模型",
        type: "text",
        required: true,
        placeholder: "doubao-seedream-3-0-t2i-250415",
      },
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        required: true,
      },
    ],
  },
  {
    type: "sd-webui",
    displayName: "Stable Diffusion WebUI（AUTOMATIC1111）",
    fields: [
      { key: "displayName", label: "显示名", type: "text", required: true },
      {
        key: "endpoint",
        label: "Endpoint",
        type: "url",
        required: true,
        placeholder: "http://127.0.0.1:7860",
        default: "http://127.0.0.1:7860",
      },
      {
        key: "model",
        label: "模型（Checkpoint · 可选）",
        type: "text",
        placeholder: "sd_xl_base_1.0.safetensors",
      },
      {
        key: "apiKey",
        label: "API Key（可选，走 --api-auth）",
        type: "password",
      },
    ],
  },
];

export function getTemplate(type: string): ProviderTemplate | undefined {
  return PROVIDER_TEMPLATES.find((t) => t.type === type);
}
