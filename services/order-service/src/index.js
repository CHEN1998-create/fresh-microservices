import express from 'express';
import cors from 'cors';

const PORT = process.env.PORT || 4004;
const CATALOG_URL = process.env.CATALOG_SERVICE_URL || 'http://localhost:4002';
const INVENTORY_URL = process.env.INVENTORY_SERVICE_URL || 'http://localhost:4003';

const app = express();
app.use(cors());
app.use(express.json());

const ok = (res, data, message = 'ok') => res.json({ code: 0, data, message });
const fail = (res, status, message) =>
  res.status(status).json({ code: status, data: null, message });

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({ code: res.status, message: '下游响应异常' }));
  return { ok: res.ok, status: res.status, body: json };
}

// MVP：内存订单，重启即丢失（后续替换为 PostgreSQL orders / order_items 表）
const orders = new Map(); // id -> order
let orderSeq = 1000;

function seedOrder(order) {
  orders.set(order.id, order);
  orderSeq = Math.max(orderSeq, Number(order.id.split('_')[1]));
}

// 两条种子历史订单（归演示用户 u_demo，库存侧已对应扣减）
seedOrder({
  id: 'o_1001',
  userId: 'u_demo',
  items: [{ productId: 'p-tomato', name: '有机番茄', quantity: 2, priceCents: 890 }],
  totalAmountCents: 1780,
  status: 'created',
  createdAt: '2026-09-25T10:12:00.000Z',
});
seedOrder({
  id: 'o_1002',
  userId: 'u_demo',
  items: [{ productId: 'p-apple', name: '红富士苹果', quantity: 1, priceCents: 1290 }],
  totalAmountCents: 1290,
  status: 'completed',
  createdAt: '2026-09-26T08:30:00.000Z',
});

app.get('/health', (req, res) => {
  ok(res, { service: 'order-service', status: 'ok', orders: orders.size });
});

// 创建订单（下单主链路）：
// 1. 调 Catalog 校验商品与价格
// 2. 调 Inventory 预扣库存（不足直接失败）
// 3. 本服务落订单
// 4. 确认扣减；确认异常则补偿回滚并撤销订单
app.post('/orders', async (req, res) => {
  const userId = req.header('x-user-id'); // 由 Gateway 验签 JWT 后注入
  if (!userId) return fail(res, 401, '未登录');

  const { items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) return fail(res, 400, 'items 不能为空');

  // 1. 校验商品 + 汇总价格
  const lineItems = [];
  for (const line of items) {
    const quantity = Number(line.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return fail(res, 400, 'quantity 必须为正整数');
    }
    let product;
    try {
      const productRes = await fetch(`${CATALOG_URL}/products/${line.productId}`);
      if (productRes.status === 404) return fail(res, 400, `商品 ${line.productId} 不存在`);
      if (!productRes.ok) return fail(res, 503, '商品服务暂不可用');
      product = (await productRes.json()).data;
    } catch {
      return fail(res, 503, '商品服务暂不可用');
    }
    if (product.status !== 'on') return fail(res, 400, `商品「${product.name}」已下架`);
    lineItems.push({
      productId: product.id,
      name: product.name,
      quantity,
      priceCents: product.priceCents,
    });
  }

  // 2. 预扣库存
  let reservationId;
  const reserve = await postJson(`${INVENTORY_URL}/reserve`, {
    items: lineItems.map(({ productId, quantity }) => ({ productId, quantity })),
  });
  if (!reserve.ok) {
    return fail(res, reserve.status === 409 ? 409 : 503, reserve.body.message || '库存预扣失败');
  }
  reservationId = reserve.body.data.reservationId;

  // 3. 创建订单（内存版，正常不会失败；接库后此处失败也要走回滚）
  const id = `o_${++orderSeq}`;
  const order = {
    id,
    userId,
    items: lineItems,
    totalAmountCents: lineItems.reduce((sum, l) => sum + l.priceCents * l.quantity, 0),
    status: 'created',
    createdAt: new Date().toISOString(),
  };
  orders.set(id, order);

  // 4. 确认扣减；失败则补偿回滚，保证库存与订单一致
  const confirm = await postJson(`${INVENTORY_URL}/confirm`, { reservationId });
  if (!confirm.ok) {
    await postJson(`${INVENTORY_URL}/release`, { reservationId }).catch(() => {});
    orders.delete(id);
    return fail(res, 500, '订单确认失败，库存已回滚');
  }

  ok(res, order, '订单创建成功');
});

// 当前用户的订单
app.get('/orders/my', (req, res) => {
  const userId = req.header('x-user-id');
  if (!userId) return fail(res, 401, '未登录');
  const list = [...orders.values()]
    .filter((o) => o.userId === userId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  ok(res, list);
});

// 全部订单（管理端，角色校验由 Gateway 完成）
app.get('/orders', (req, res) => {
  const list = [...orders.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  ok(res, list);
});

// 订单详情
app.get('/orders/:id', (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return fail(res, 404, '订单不存在');
  const userId = req.header('x-user-id');
  const role = req.header('x-user-role');
  if (role !== 'admin' && order.userId !== userId) return fail(res, 403, '无权查看该订单');
  ok(res, order);
});

// 取消订单（用户可取消自己的 created 订单；管理员可取消任意 created 订单）
// 状态：created -> cancelled；先调 inventory /restock 回补库存，成功后才改状态
// 保证订单与库存强一致：restock 失败则订单仍 created，调用方可重试
app.post('/orders/:id/cancel', async (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return fail(res, 404, '订单不存在');

  const userId = req.header('x-user-id');
  const role = req.header('x-user-role');
  if (!userId) return fail(res, 401, '未登录');
  if (role !== 'admin' && order.userId !== userId) {
    return fail(res, 403, '无权取消该订单');
  }
  if (order.status !== 'created') {
    return fail(res, 400, `仅 created 订单可取消，当前状态：${order.status}`);
  }
  // 幂等防重：已回补过的订单不允许再触发 restock
  if (order.restockApplied) {
    return fail(res, 409, '订单库存已回补，请勿重复取消');
  }

  // 先回补库存；失败则订单保持 created，调用方可重试
  try {
    const restock = await postJson(`${INVENTORY_URL}/restock`, {
      items: order.items.map(({ productId, quantity }) => ({ productId, quantity })),
    });
    if (!restock.ok) {
      return fail(res, 503, `库存回补失败，订单未取消：${restock.body?.message || '下游异常'}`);
    }
  } catch (err) {
    return fail(res, 503, `库存回补异常，订单未取消：${err.message}`);
  }

  // 库存已回补，安全改状态
  order.status = 'cancelled';
  order.cancelledAt = new Date().toISOString();
  order.restockApplied = true;
  ok(res, order, '订单已取消');
});

// 标记完成（仅管理员；库存不动，已 confirm）
// 状态：created -> completed
app.post('/orders/:id/complete', (req, res) => {
  const order = orders.get(req.params.id);
  if (!order) return fail(res, 404, '订单不存在');

  const role = req.header('x-user-role');
  if (role !== 'admin') return fail(res, 403, '无权限，需要角色: admin');
  if (order.status !== 'created') {
    return fail(res, 400, `仅 created 订单可标记完成，当前状态：${order.status}`);
  }

  order.status = 'completed';
  order.completedAt = new Date().toISOString();
  ok(res, order, '订单已完成');
});

app.use((req, res) => fail(res, 404, '路由不存在'));

app.listen(PORT, () => {
  console.log(`[order-service] listening on http://localhost:${PORT}`);
});
