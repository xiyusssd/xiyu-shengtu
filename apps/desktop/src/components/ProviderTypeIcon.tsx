/**
 * 每种 Provider 类型对应的彩色小图标
 * 抠简、辨识度高。用 SVG 保证任何尺寸清晰。
 */

interface Props {
  type: string;
  size?: number;
  className?: string;
}

export function ProviderTypeIcon({ type, size = 24, className }: Props) {
  switch (type) {
    case "mock":
      return <MockIcon size={size} className={className} />;
    case "openai-compat":
      return <OpenAIIcon size={size} className={className} />;
    case "volcano-ark":
      return <VolcanoIcon size={size} className={className} />;
    case "sd-webui":
      return <SdWebuiIcon size={size} className={className} />;
    default:
      return <FallbackIcon size={size} className={className} />;
  }
}

function BaseFrame({
  size,
  className,
  bg,
  children,
}: {
  size: number;
  className?: string;
  bg: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        background: bg,
      }}
      className={
        "grid shrink-0 place-items-center rounded-[6px] text-white shadow-sm " +
        (className ?? "")
      }
    >
      {children}
    </div>
  );
}

function MockIcon({ size, className }: { size: number; className?: string }) {
  return (
    <BaseFrame size={size} className={className} bg="linear-gradient(135deg,#a1a1aa,#71717a)">
      <svg
        width={size * 0.6}
        height={size * 0.6}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
      </svg>
    </BaseFrame>
  );
}

function OpenAIIcon({ size, className }: { size: number; className?: string }) {
  // 简化的 6 瓣花形状 - OpenAI 标志感
  return (
    <BaseFrame size={size} className={className} bg="#10a37f">
      <svg
        width={size * 0.66}
        height={size * 0.66}
        viewBox="0 0 32 32"
        fill="currentColor"
      >
        <path d="M28.3 12.1a7.9 7.9 0 0 0-0.68-6.5 8 8 0 0 0-8.6-3.85 7.94 7.94 0 0 0-13.5 2.85 8 8 0 0 0-5.33 3.87 8 8 0 0 0 1 9.4 7.9 7.9 0 0 0 0.68 6.5 8 8 0 0 0 8.6 3.85 7.94 7.94 0 0 0 13.5-2.85 8 8 0 0 0 5.33-3.87 8 8 0 0 0-1-9.4zM17.9 27.8a5.94 5.94 0 0 1-3.82-1.38l.19-.11 6.35-3.67a1.03 1.03 0 0 0 .52-.9V13.8l2.68 1.55a.1.1 0 0 1 .05.07v7.42a5.96 5.96 0 0 1-5.98 5.96zM5.15 22.3a5.9 5.9 0 0 1-.71-4l.19.11 6.35 3.67a1.03 1.03 0 0 0 1.04 0l7.76-4.48v3.1a.1.1 0 0 1-.04.08l-6.42 3.7a5.98 5.98 0 0 1-8.16-2.18zm-1.68-13.9a5.94 5.94 0 0 1 3.13-2.63V13.35a1.02 1.02 0 0 0 .52.9l7.76 4.48-2.68 1.55a.1.1 0 0 1-.1 0l-6.42-3.7a5.97 5.97 0 0 1-2.19-8.16zm22.06 5.13-7.76-4.48 2.68-1.54a.1.1 0 0 1 .1 0l6.42 3.7a5.96 5.96 0 0 1-.9 10.76V14.28a1.02 1.02 0 0 0-.53-.9zM28.2 9.6l-.19-.11-6.34-3.68a1.03 1.03 0 0 0-1.04 0l-7.76 4.48V7.19a.1.1 0 0 1 .04-.08l6.42-3.7a5.98 5.98 0 0 1 8.87 6.19zM11.09 15.8l-2.68-1.55a.1.1 0 0 1-.05-.07V6.75a5.97 5.97 0 0 1 9.79-4.57l-.19.11-6.35 3.67a1.03 1.03 0 0 0-.52.9zm1.46-3.15L16 10.65l3.46 2v4l-3.46 2-3.46-2z" />
      </svg>
    </BaseFrame>
  );
}

function VolcanoIcon({ size, className }: { size: number; className?: string }) {
  // 火山方舟：橙红渐变 + 火山三角
  return (
    <BaseFrame
      size={size}
      className={className}
      bg="linear-gradient(135deg,#ff6b35,#e63946)"
    >
      <svg
        width={size * 0.66}
        height={size * 0.66}
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M12 3 L4 20 H20 Z" opacity="0.95" />
        <circle cx="12" cy="17" r="1.2" fill="#fbbf24" />
        <path d="M11 6 L12 3 L13 6 L12 8 Z" fill="#fef3c7" />
      </svg>
    </BaseFrame>
  );
}

function SdWebuiIcon({ size, className }: { size: number; className?: string }) {
  // Stable Diffusion：紫蓝色 + "SD" 抽象
  return (
    <BaseFrame
      size={size}
      className={className}
      bg="linear-gradient(135deg,#7c3aed,#4f46e5)"
    >
      <svg
        width={size * 0.6}
        height={size * 0.6}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14 6 A 5 5 0 1 0 14 14 A 5 5 0 1 1 14 22" />
      </svg>
    </BaseFrame>
  );
}

function FallbackIcon({ size, className }: { size: number; className?: string }) {
  return (
    <BaseFrame
      size={size}
      className={className}
      bg="linear-gradient(135deg,#64748b,#334155)"
    >
      <svg
        width={size * 0.55}
        height={size * 0.55}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 4h16v16H4z" />
      </svg>
    </BaseFrame>
  );
}
