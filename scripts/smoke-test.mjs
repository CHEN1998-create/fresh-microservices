// 全链路冒烟测试：通过 API Gateway 验证注册/鉴权/商品/下单/库存调整
// 使用：先启动所有服务（npm run dev:services），再执行 npm run smoke
const BASE = process.env.BASE_URL || 'http://localhost:4000';

const results = [];
function check(name, cond, detail = '') {
  results.push({ name, ok: Boolean(cond) });
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function call(method, path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({ code: res.status, message: '非 JSON 响应' }));
  return { status: res.status, ...json };
}

try {
  // 1. 网关健康检查
  const health = await call('GET', '/health');
  check('GET /health 网关存活', health.status === 200 && health.data?.service === 'api-gateway');

  // 2. 注册 + 登录
  const email = `smoke_${Date.now()}@test.dev`;
  const register = await call('POST', '/api/auth/register', { email, password: '123456' });
  check('POST /api/auth/register 用户注册', register.code === 0, register.message);
  const userToken = register.data?.token;

  const login = await call('POST', '/api/auth/login', { email, password: '123456' });
  check('POST /api/auth/login 用户登录', login.code === 0 && !!login.data?.token);

  const me = await call('GET', '/api/auth/me', null, userToken);
  check('GET /api/auth/me 鉴权信息', me.code === 0 && me.data?.user?.email === email);

  // 3. 商品
  const products = await call('GET', '/api/catalog/products');
  check(
    'GET /api/catalog/products 商品列表',
    products.code === 0 && Array.isArray(products.data) && products.data.length >= 6,
    `${products.data?.length ?? 0} 个在售商品`
  );
  const first = products.data?.[0];
  const detail = await call('GET', `/api/catalog/products/${first?.id}`);
  check('GET /api/catalog/products/:id 商品详情', detail.code === 0 && detail.data?.id === first?.id);

  // 4. 下单主链路（含库存预扣 + 确认）
  const order = await call(
    'POST',
    '/api/orders',
    { items: [{ productId: first.id, quantity: 2 }] },
    userToken
  );
  check('POST /api/orders 创建订单', order.code === 0, order.data?.id ?? order.message);

  const myOrders = await call('GET', '/api/orders/my', null, userToken);
  check('GET /api/orders/my 我的订单', myOrders.code === 0 && myOrders.data?.length >= 1);

  // 5. 库存不足失败
  const oversold = await call(
    'POST',
    '/api/orders',
    { items: [{ productId: first.id, quantity: 999999 }] },
    userToken
  );
  check('库存不足时下单被拒绝', oversold.status === 409, oversold.message);

  // 6. 未登录不能下单
  const noAuth = await call('POST', '/api/orders', { items: [{ productId: first.id, quantity: 1 }] });
  check('未登录下单返回 401', noAuth.status === 401);

  // 7. 库存查询公开
  const inventory = await call('GET', `/api/inventory/${first.id}`);
  check('GET /api/inventory/:id 库存查询', inventory.code === 0);

  // 8. 管理员：登录 + 调整库存 + 越权拦截
  const adminLogin = await call('POST', '/api/auth/login', {
    email: 'admin@fresh.dev',
    password: 'admin123',
  });
  check('管理员登录', adminLogin.code === 0 && adminLogin.data?.user?.role === 'admin');
  const adminToken = adminLogin.data?.token;

  const adjust = await call('PATCH', '/api/inventory/p-tomato', { adjustment: 5 }, adminToken);
  check('管理员调整库存', adjust.code === 0, `可用 ${adjust.data?.availableQuantity}`);

  const forbidden = await call('PATCH', '/api/inventory/p-tomato', { adjustment: 1 }, userToken);
  check('普通用户调整库存返回 403', forbidden.status === 403);

  const adminOrders = await call('GET', '/api/admin/orders', null, adminToken);
  check('管理员查看全部订单', adminOrders.code === 0 && Array.isArray(adminOrders.data));
} catch (err) {
  check(`冒烟测试异常: ${err.message}`, false);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n结果：${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
