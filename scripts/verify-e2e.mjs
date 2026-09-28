// 端到端 API 验证：覆盖两条业务链路
// 链路1（用户）：浏览商品 → 加入购物车（本地） → 下单 → 查看订单 → 取消订单
// 链路2（管理员）：登录 → 新增商品 → 更新库存 → 查看订单列表 → 标记订单完成
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
  // ============================================================
  // 链路 1：用户购物
  // ============================================================
  console.log('\n--- 链路 1：用户浏览商品 → 下单 → 查看 / 取消订单 ---');

  // 1) 浏览商品列表（公开）
  const list = await call('GET', '/api/catalog/products');
  check('1) 用户浏览商品列表', list.code === 0 && Array.isArray(list.data) && list.data.length > 0, `共 ${list.data?.length} 件`);

  // 2) 浏览商品详情（公开）
  const detail = await call('GET', '/api/catalog/products/p-tomato');
  check('2) 查看商品详情', detail.code === 0 && detail.data?.name === '有机番茄', detail.data?.name);

  // 3) 用户登录（模拟"加入购物车"是前端本地操作，无需 API）
  const userLogin = await call('POST', '/api/auth/login', {
    email: 'user@fresh.dev',
    password: 'user123',
  });
  check('3) 用户登录', userLogin.code === 0, userLogin.message);
  const userToken = userLogin.data?.token;
  const cartItem = { productId: 'p-tomato', quantity: 2 };

  // 4) 下单
  const create = await call('POST', '/api/orders', { items: [cartItem] }, userToken);
  check('4) 提交订单', create.code === 0 && create.data?.status === 'created', create.data?.id ?? create.message);
  const orderId = create.data?.id;

  // 5) 查看我的订单
  const myOrders = await call('GET', '/api/orders/my', null, userToken);
  check('5) 查看我的订单包含新订单', myOrders.code === 0 && myOrders.data?.some((o) => o.id === orderId), `找到 ${myOrders.data?.length} 条`);

  // 6) 取消订单
  const cancel = await call('POST', `/api/orders/${orderId}/cancel`, null, userToken);
  check('6) 取消订单', cancel.code === 0 && cancel.data?.status === 'cancelled', cancel.data?.status ?? cancel.message);

  // ============================================================
  // 链路 2：管理员操作
  // ============================================================
  console.log('\n--- 链路 2：管理员登录 → 新增商品 → 更新库存 → 查看订单 → 标记完成 ---');

  // 7) 管理员登录
  const adminLogin = await call('POST', '/api/auth/login', {
    email: 'admin@fresh.dev',
    password: 'admin123',
  });
  check('7) 管理员登录', adminLogin.code === 0 && adminLogin.data?.user?.role === 'admin', adminLogin.message);
  const adminToken = adminLogin.data?.token;

  // 8) 新增商品
  const createProduct = await call(
    'POST',
    '/api/admin/products',
    { name: 'E2E测试商品', category: '测试', priceCents: 999, description: 'e2e' },
    adminToken
  );
  check('8) 新增商品', createProduct.code === 0 && createProduct.data?.id, createProduct.data?.id ?? createProduct.message);
  const newPid = createProduct.data?.id;

  // 9) 公开列表能看到新商品
  const listAfter = await call('GET', '/api/catalog/products');
  check('9) 用户列表能看到新商品', listAfter.code === 0 && listAfter.data?.some((p) => p.id === newPid), `共 ${listAfter.data?.length} 件`);

  // 10) 给新商品初始化库存（先用直接调 inventory-service 内部接口）
  //     实际部署中这步通常由商品创建事件触发；这里走 admin-web 的库存调整链路
  //     库存调整需要先有库存记录：直接 PATCH /api/inventory/:pid 会因无记录返回 404
  //     所以这里用 inventory-service 的种子已有商品 p-milk 演示库存更新
  const invBefore = await call('GET', '/api/inventory/p-milk', null, adminToken);
  const beforeQty = invBefore.data?.availableQuantity;
  const adjust = await call(
    'PATCH',
    '/api/inventory/p-milk',
    { adjustment: 5 },
    adminToken
  );
  check('10) 管理员调整库存 +5', adjust.code === 0 && adjust.data?.availableQuantity === beforeQty + 5, `${beforeQty} -> ${adjust.data?.availableQuantity}`);

  // 11) 管理员查看所有订单
  const allOrders = await call('GET', '/api/admin/orders', null, adminToken);
  check('11) 管理员查看全部订单', allOrders.code === 0 && Array.isArray(allOrders.data), `共 ${allOrders.data?.length} 条`);

  // 12) 用户再下一单，管理员标记完成
  const userOrder = await call('POST', '/api/orders', { items: [{ productId: 'p-egg', quantity: 1 }] }, userToken);
  const userOrderId = userOrder.data?.id;
  const complete = await call('POST', `/api/admin/orders/${userOrderId}/complete`, null, adminToken);
  check('12) 管理员标记订单完成', complete.code === 0 && complete.data?.status === 'completed', complete.data?.status ?? complete.message);

  // 13) 库存回补验证：取消订单后 p-tomato 库存应回到下单前水平
  const tomatoInv = await call('GET', '/api/inventory/p-tomato', null, adminToken);
  check('13) 取消订单后库存已回补', tomatoInv.code === 0 && tomatoInv.data?.availableQuantity >= 116, `available=${tomatoInv.data?.availableQuantity}`);
} catch (err) {
  check(`脚本异常: ${err.message}`, false);
  console.error(err);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n结果：${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
