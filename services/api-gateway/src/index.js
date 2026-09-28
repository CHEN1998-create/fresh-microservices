import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'fresh-dev-secret';

// 下游服务地址（本地默认值，Docker Compose 中通过环境变量覆盖）
const UPSTREAM = {
  auth: process.env.AUTH_SERVICE_URL || 'http://localhost:4001',
  catalog: process.env.CATALOG_SERVICE_URL || 'http://localhost:4002',
  inventory: process.env.INVENTORY_SERVICE_URL || 'http://localhost:4003',
  order: process.env.ORDER_SERVICE_URL || 'http://localhost:4004',
};

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ code: 0, data: { service: 'api-gateway', status: 'ok' }, message: 'ok' });
});

// 校验 JWT，通过后把用户身份注入 x-user-id / x-user-role 供下游使用
// requiredRoles: string | string[] | undefined；为数组时任意命中即通过
function verifyToken(requiredRoles) {
  const allowed = requiredRoles
    ? Array.isArray(requiredRoles)
      ? requiredRoles
      : [requiredRoles]
    : null;
  return (req, res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) {
      return res.status(401).json({ code: 401, data: null, message: '未登录' });
    }
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.headers['x-user-id'] = payload.sub;
      req.headers['x-user-role'] = payload.role;
      if (allowed && !allowed.includes(payload.role)) {
        return res.status(403).json({
          code: 403,
          data: null,
          message: `无权限，需要角色: ${allowed.join(' / ')}`,
        });
      }
      next();
    } catch {
      res.status(401).json({ code: 401, data: null, message: 'token 无效或已过期' });
    }
  };
}

// 仅对指定前缀生效的鉴权守卫
function guard(prefixes, verify) {
  return (req, res, next) => {
    if (prefixes.some((p) => req.path.startsWith(p))) return verify(req, res, next);
    next();
  };
}

// 可选鉴权：带 token 就验签并注入身份，不带就匿名放行
// 用于 catalog 这种"公开读但管理员可见更多"的场景
function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return next();
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.headers['x-user-id'] = payload.sub;
    req.headers['x-user-role'] = payload.role;
  } catch {
    // token 无效就当匿名，不报错（公开接口本就不强制登录）
  }
  next();
}

// 订单：登录用户
app.use(guard(['/api/orders'], verifyToken()));
// 管理端：管理员
app.use(guard(['/api/admin/'], verifyToken('admin')));
// 库存：读公开，写操作需要管理员
app.use(
  guard(['/api/inventory'], (req, res, next) =>
    req.method === 'GET' ? next() : verifyToken('admin')(req, res, next)
  )
);
// catalog：公开读，但若带 token 则注入身份（供 ?all=true 等管理员特性使用）
app.use(guard(['/api/catalog'], optionalAuth));

// 代理：按完整路径前缀过滤，再重写到下游路由
function proxy(prefix, target, replaceWith) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    // http-proxy-middleware v3 中该选项名为 pathFilter
    pathFilter: (pathname) => pathname.startsWith(prefix),
    pathRewrite: { [`^${prefix}`]: replaceWith },
    on: {
      // express.json() 已解析过请求体，代理前需要重新写回请求流
      proxyReq: fixRequestBody,
      error: (err, req, res) => {
        if (!res.headersSent) {
          res.status(503).json({ code: 503, data: null, message: '下游服务不可用' });
        }
      },
    },
  });
}

app.use(proxy('/api/auth', UPSTREAM.auth, '/auth'));
app.use(proxy('/api/catalog', UPSTREAM.catalog, ''));
app.use(proxy('/api/inventory', UPSTREAM.inventory, ''));
app.use(proxy('/api/orders', UPSTREAM.order, '/orders'));
app.use(proxy('/api/admin/products', UPSTREAM.catalog, '/admin/products'));
app.use(proxy('/api/admin/orders', UPSTREAM.order, '/orders'));

app.use((req, res) => {
  res.status(404).json({ code: 404, data: null, message: `路由不存在: ${req.method} ${req.path}` });
});

app.listen(PORT, () => {
  console.log(`[api-gateway] listening on http://localhost:${PORT}`);
  console.log('[api-gateway] upstream:', UPSTREAM);
});
