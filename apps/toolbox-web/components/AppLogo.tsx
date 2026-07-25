import { cn } from "@/lib/utils";

/**
 * 应用 Logo：与桌面 icon.png 同款
 * 白底照片框 + 山峦剪影 + AI 星芒
 */
export function AppLogo({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0 drop-shadow-sm", className)}
      aria-label="xiyu-shengtu"
    >
      <defs>
        <linearGradient id="lg-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FDFAF5" />
          <stop offset="1" stopColor="#F5F0EB" />
        </linearGradient>
        <linearGradient id="lg-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFD6BE" />
          <stop offset="1" stopColor="#FFE3D6" />
        </linearGradient>
        <linearGradient id="lg-star" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#EC4899" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
        <clipPath id="lg-outer">
          <rect x="0" y="0" width="100" height="100" rx="22" ry="22" />
        </clipPath>
        <clipPath id="lg-inner">
          <rect x="14" y="14" width="72" height="72" rx="10" ry="10" />
        </clipPath>
      </defs>

      {/* 外层圆角米白背景 */}
      <g clipPath="url(#lg-outer)">
        <rect width="100" height="100" fill="url(#lg-bg)" />

        {/* 照片框内部风景 */}
        <g clipPath="url(#lg-inner)">
          <rect x="14" y="14" width="72" height="72" fill="url(#lg-sky)" />
          {/* 太阳 */}
          <circle cx="35" cy="42" r="6.5" fill="#FFAF82" />
          {/* 远山（浅紫） */}
          <path
            d="M14 64 L26 52 L36 58 L52 46 L64 54 L78 48 L86 55 L86 86 L14 86 Z"
            fill="#AA94D2"
          />
          {/* 近山（深紫） */}
          <path
            d="M14 86 L14 72 L28 66 L42 74 L54 62 L70 70 L86 66 L86 86 Z"
            fill="#6E5AA0"
          />
        </g>

        {/* 照片框描边 */}
        <rect
          x="14"
          y="14"
          width="72"
          height="72"
          rx="10"
          ry="10"
          fill="none"
          stroke="#18181B"
          strokeWidth="1.6"
        />

        {/* AI 主星芒（右上，粉紫渐变） */}
        <path
          d="M82 20 L84 30 L94 32 L84 34 L82 44 L80 34 L70 32 L80 30 Z"
          fill="url(#lg-star)"
          stroke="#ffffff"
          strokeWidth="0.8"
          strokeLinejoin="round"
        />

        {/* 小星点缀 */}
        <path
          d="M92 8 L93 12 L97 13 L93 14 L92 18 L91 14 L87 13 L91 12 Z"
          fill="#7C3AED"
          fillOpacity="0.85"
        />
        <path
          d="M72 10 L72.8 13 L76 14 L72.8 15 L72 18 L71.2 15 L68 14 L71.2 13 Z"
          fill="#EC4899"
          fillOpacity="0.8"
        />
      </g>
    </svg>
  );
}
