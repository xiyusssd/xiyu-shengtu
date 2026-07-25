/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@xiyu-shengtu/provider-core",
    "@xiyu-shengtu/toolbox-core",
  ],
  experimental: {
    // 允许 API Route 通过 ReadableStream 输出 SSE
  },
};

export default nextConfig;
