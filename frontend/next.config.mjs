/** @type {import('next').NextConfig} */
// Next rewrites 代理默认 30 秒超时（next-server proxyTimeout），AI 诊断/优化耗时可达 90 秒+
// 与前端 api.ts 共用 NEXT_PUBLIC_API_TIMEOUT（毫秒），由 compose environment 注入，默认 120 秒
const proxyTimeout = Number(process.env.NEXT_PUBLIC_API_TIMEOUT) || 120_000;
const nextConfig = {
  output: "standalone",
  experimental: {
    proxyTimeout,
  },
  async rewrites() {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
    return [
      { source: "/api/:path*", destination: `${apiBase}/api/:path*` },
    ];
  },
};

export default nextConfig;
