// 验证订单状态流转 + 库存联动：
// 1) 用户下单 → status=created，库存扣减
// 2) 用户取消自己的 created 订单 → status=cancelled，库存回补
// 3) 已 cancelled 订单再 cancel → 400
// 4) 管理员取消任意 created 订单 → 成功
// 5) 用户取消他人订单 → 403
// 6) 普通用户尝试 complete → 403
// 7) 管理员 complete → status=completed
// 8) 已 completed 订单再 cancel → 400
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

// 拉取某商品当前可用库存（管理员视角）
async function getAvailable(productId, adminToken) {
  const r = await call('GET', `/api/inventory/${productId}`, null, adminToken);
  return r.data?.availableQuantity;
}

try {
  // 登录
  const adminLogin = await call('POST', '/api/auth/login', {
    email: 'admin@fresh.dev',
    password: 'admin123',
  });
  check('管理员登录', adminLogin.code === 0, adminLogin.message);
  const adminToken = adminLogin.data?.token;

  const userLogin = await call('POST', '/api/auth/login', {
    email: 'user@fresh.dev',
    password: 'user123',
  });
  check('普通用户登录', userLogin.code === 0, userLogin.message);
  const userToken = userLogin.data?.data?.token ?? userLogin.data?.token;

  // 选一个稳定在售商品 p-egg 做下单测试（库存 40，足够 2 单 ×3 件）
  const PID = 'p-egg';
  const QTY = 3;

  // 1) 用户下单 → created，库存扣减
  const stockBefore = await getAvailable(PID, adminToken);
  const create = await call(
    'POST',
    '/api/orders',
    { items: [{ productId: PID, quantity: QTY }] },
    userToken
  );
  check('1) 用户下单 created', create.code === 0 && create.data?.status === 'created', create.data?.id ?? create.message);
  const oid = create.data?.id;
  const stockAfterCreate = await getAvailable(PID, adminToken);
  check('1b) 下单后库存扣减', stockAfterCreate === stockBefore - QTY, `${stockBefore} -> ${stockAfterCreate}`);

  // 2) 用户取消自己的 created 订单 → cancelled，库存回补
  const cancel = await call('POST', `/api/orders/${oid}/cancel`, null, userToken);
  check('2) 用户取消成功 status=cancelled', cancel.code === 0 && cancel.data?.status === 'cancelled', cancel.data?.status ?? cancel.message);
  const stockAfterCancel = await getAvailable(PID, adminToken);
  check('2b) 取消后库存回补', stockAfterCancel === stockBefore, `${stockAfterCancel} vs ${stockBefore}`);

  // 3) 已 cancelled 订单再 cancel → 400
  const cancelAgain = await call('POST', `/api/orders/${oid}/cancel`, null, userToken);
  check('3) 已取消订单再取消返回 400', cancelAgain.status === 400, cancelAgain.message);

  // 4) 管理员取消任意 created 订单 → 成功（用户新建一单）
  const create2 = await call(
    'POST',
    '/api/orders',
    { items: [{ productId: PID, quantity: QTY }] },
    userToken
  );
  const oid2 = create2.data?.id;
  const adminCancel = await call('POST', `/api/orders/${oid2}/cancel`, null, adminToken);
  check('4) 管理员取消任意订单成功', adminCancel.code === 0 && adminCancel.data?.status === 'cancelled', adminCancel.data?.status ?? adminCancel.message);

  // 5) 用户取消他人订单 → 403
  //    管理员下一单（属于 u_admin），让普通用户尝试取消
  const adminOrder = await call(
    'POST',
    '/api/orders',
    { items: [{ productId: PID, quantity: 1 }] },
    adminToken
  );
  const adminOid = adminOrder.data?.id;
  const forbidCancel = await call('POST', `/api/orders/${adminOid}/cancel`, null, userToken);
  check('5) 用户取消他人订单被拒 403', forbidCancel.status === 403, `status=${forbidCancel.status} ${forbidCancel.message}`);
  // 还原：管理员自己把这单取消掉（避免库存长期占用）
  await call('POST', `/api/orders/${adminOid}/cancel`, null, adminToken);

  // 6) 普通用户尝试 complete → 403（用户新建一单）
  const create3 = await call(
    'POST',
    '/api/orders',
    { items: [{ productId: PID, quantity: 1 }] },
    userToken
  );
  const oid3 = create3.data?.id;
  const userComplete = await call('POST', `/api/orders/${oid3}/complete`, null, userToken);
  check('6) 普通用户 complete 返回 403', userComplete.status === 403, userComplete.message);

  // 7) 管理员 complete → status=completed
  const adminComplete = await call('POST', `/api/orders/${oid3}/complete`, null, adminToken);
  check('7) 管理员 complete 成功', adminComplete.code === 0 && adminComplete.data?.status === 'completed', adminComplete.data?.status ?? adminComplete.message);

  // 8) 已 completed 订单再 cancel → 400
  const cancelCompleted = await call('POST', `/api/orders/${oid3}/cancel`, null, adminToken);
  check('8) 已完成订单再取消返回 400', cancelCompleted.status === 400, cancelCompleted.message);
} catch (err) {
  check(`脚本异常: ${err.message}`, false);
  console.error(err);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n结果：${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
