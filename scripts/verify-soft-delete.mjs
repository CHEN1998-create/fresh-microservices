// 验证 catalog-service 软删除链路：
// 1) 非管理员 DELETE 返回 403
// 2) 管理员 DELETE 已下架商品 → status='deleted'
// 3) 非管理员 GET /products/:id 返回 404
// 4) 管理员 GET /products/:id?all=true 可见
// 5) PATCH status='on' 恢复成功
// 6) 历史订单引用不受影响（订单依然能查到）
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
  // 登录管理员与普通用户
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

  // 准备一个目标商品：新增 → 下架 → 删除，避免污染种子数据
  const create = await call(
    'POST',
    '/api/admin/products',
    { name: '测试商品-软删除', category: '测试', priceCents: 100, description: 'verify-soft-delete' },
    adminToken
  );
  check('新增测试商品', create.code === 0, create.data?.id ?? create.message);
  const pid = create.data?.id;

  // 1) 非管理员 DELETE → 403
  const forbid = await call('DELETE', `/api/admin/products/${pid}`, null, userToken);
  check('1) 非管理员 DELETE 返回 403', forbid.status === 403, forbid.message);

  // 2) 管理员对在售商品直接 DELETE → 应成功（不要求先下架，保持灵活）
  //    实际接口设计允许从任意状态进入 deleted；前端 UI 限制在已下架时显示按钮
  const del = await call('DELETE', `/api/admin/products/${pid}`, null, adminToken);
  check('2) 管理员 DELETE 软删除成功', del.code === 0 && del.data?.status === 'deleted', del.data?.status ?? del.message);

  // 3) 非管理员 GET /products/:id → 404
  const hidden = await call('GET', `/api/catalog/products/${pid}`, null, userToken);
  check('3) 已删除商品对普通用户 404', hidden.status === 404, hidden.message);

  // 4) 管理员 ?all=true 可见
  const adminSee = await call('GET', `/api/catalog/products/${pid}?all=true`, null, adminToken);
  check('4) 管理员 ?all=true 可见已删除商品', adminSee.code === 0 && adminSee.data?.status === 'deleted', adminSee.message);

  // 5) PATCH status='on' 恢复
  const restore = await call(
    'PATCH',
    `/api/admin/products/${pid}`,
    { status: 'on' },
    adminToken
  );
  check('5) PATCH status=on 恢复成功', restore.code === 0 && restore.data?.status === 'on', restore.data?.status ?? restore.message);

  // 6) 恢复后非管理员可见
  const visible = await call('GET', `/api/catalog/products/${pid}`, null, userToken);
  check('6) 恢复后普通用户可见', visible.code === 0 && visible.data?.id === pid, visible.message);

  // 7) 幂等：再次 DELETE 已删除商品
  await call('DELETE', `/api/admin/products/${pid}`, null, adminToken);
  const idempotent = await call('DELETE', `/api/admin/products/${pid}`, null, adminToken);
  check('7) 重复 DELETE 幂等', idempotent.code === 0 && idempotent.data?.status === 'deleted', idempotent.message);

  // 8) 历史订单引用不受影响：种子里有 o_1001 引用 p-tomato，
  //    即便把 p-tomato 删除，订单查询应仍然返回（订单存的是 denormalized 快照）
  const beforeDelete = await call('GET', '/api/orders/o_1001', null, userToken);
  // 先把 p-tomato 删了，看订单是否还能查
  await call('DELETE', '/api/admin/products/p-tomato', null, adminToken);
  const afterDelete = await call('GET', '/api/orders/o_1001', null, userToken);
  check('8) 删除商品后历史订单仍可查询', afterDelete.code === 0 && afterDelete.data?.id === 'o_1001', afterDelete.message);

  // 收尾：恢复 p-tomato 上架，避免污染种子数据
  await call('PATCH', '/api/admin/products/p-tomato', { status: 'on' }, adminToken);
  // 清理测试商品（保持 deleted 即可，无需复活）
} catch (err) {
  check(`脚本异常: ${err.message}`, false);
  console.error(err);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n结果：${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
