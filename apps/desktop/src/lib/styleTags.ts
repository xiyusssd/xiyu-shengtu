/**
 * 内置提示词风格标签库
 * 一键追加到 prompt 末尾，提升出图质量/风格统一
 */

export interface StyleTag {
  label: string; // 中文显示
  append: string; // 追加到 prompt 的英文片段
}

export interface StyleCategory {
  name: string;
  tags: StyleTag[];
}

export const STYLE_CATEGORIES: StyleCategory[] = [
  {
    name: "画质",
    tags: [
      { label: "高细节", append: "highly detailed, intricate details" },
      { label: "8K 超清", append: "8k uhd, ultra high resolution" },
      { label: "大师之作", append: "masterpiece, best quality" },
      { label: "锐利对焦", append: "sharp focus" },
      { label: "专业摄影", append: "professional photography" },
    ],
  },
  {
    name: "风格",
    tags: [
      { label: "电影感", append: "cinematic, dramatic lighting, film grain" },
      { label: "写实", append: "photorealistic, realistic" },
      { label: "动漫", append: "anime style, cel shading" },
      { label: "水彩", append: "watercolor painting, soft wash" },
      { label: "油画", append: "oil painting, thick brushstrokes" },
      { label: "赛博朋克", append: "cyberpunk, neon lights, futuristic" },
      { label: "国风", append: "chinese ink painting, traditional" },
      { label: "3D 渲染", append: "3d render, octane render, cgi" },
      { label: "极简", append: "minimalist, clean, simple composition" },
      { label: "蒸汽朋克", append: "steampunk, brass, gears" },
    ],
  },
  {
    name: "光影",
    tags: [
      { label: "黄金时刻", append: "golden hour lighting" },
      { label: "柔光", append: "soft diffused lighting" },
      { label: "逆光", append: "backlit, rim lighting" },
      { label: "霓虹", append: "neon lighting, vibrant glow" },
      { label: "体积光", append: "volumetric lighting, god rays" },
    ],
  },
  {
    name: "镜头",
    tags: [
      { label: "特写", append: "close-up shot" },
      { label: "广角", append: "wide angle shot" },
      { label: "俯拍", append: "top-down view, aerial view" },
      { label: "浅景深", append: "shallow depth of field, bokeh" },
      { label: "微距", append: "macro photography" },
    ],
  },
];

/** 把标签 append 追加到已有 prompt（自动处理逗号分隔）*/
export function appendTag(prompt: string, append: string): string {
  const trimmed = prompt.trim();
  if (!trimmed) return append;
  // 已包含则不重复
  if (trimmed.toLowerCase().includes(append.toLowerCase())) return trimmed;
  return `${trimmed}, ${append}`;
}
