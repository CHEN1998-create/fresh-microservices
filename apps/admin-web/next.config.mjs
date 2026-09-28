/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // standalone：构建产物自带最小运行时，镜像不依赖 node_modules
  output: 'standalone',
  // 反代 /api/* 到 API Gateway
  // 注意：rewrites 在 next build 时执行并固化，Docker 构建必须通过
  // --build-arg API_GATEWAY_URL=... 注入（见 apps/admin-web/Dockerfile）
  // 本地开发默认 http://localhost:4000，无需额外配置
  async rewrites() {
    const gateway = process.env.API_GATEWAY_URL || 'http://localhost:4000';
    return [{ source: '/api/:path*', destination: `${gateway}/api/:path*` }];
  },
};

export default nextConfig;
