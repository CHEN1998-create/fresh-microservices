/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // standalone：构建产物自带最小运行时，镜像不依赖 node_modules
  output: 'standalone',
  // 反代 /api/* 到 API Gateway，运行时读 API_GATEWAY_URL（部署侧配置，非 build-time）
  // 本地开发默认 http://localhost:4000，无需额外配置
  async rewrites() {
    const gateway = process.env.API_GATEWAY_URL || 'http://localhost:4000';
    return [{ source: '/api/:path*', destination: `${gateway}/api/:path*` }];
  },
};

export default nextConfig;
