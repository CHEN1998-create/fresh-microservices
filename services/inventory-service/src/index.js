import express from 'express';
import cors from 'cors';

const PORT = process.env.PORT || 4003;
const LOW_STOCK_THRESHOLD = 10;

const app = express();
app.use(cors());
app.use(express.json());

const ok = (res, data, message = 'ok') => res.json({ code: 0, data, message });
const fail = (res, status, message) =>
  res.status(status).json({ code: status, data: null, message });

// MVP：内存库存，重启即丢失（后续替换为 PostgreSQL inventory_items 表）
const items = new Map(); // productId -> { productId, availableQuantity, reservedQuantity }
const reservations = new Map(); // reservationId -> [{ productId, quantity }]

function seed(productId, availableQuantity) {
  items.set(productId, { productId, availableQuantity, reservedQuantity: 0 });
}

seed('p-tomato', 118); // 种子订单已占用 2
seed('p-cucumber', 60);
seed('p-egg', 40);
seed('p-milk', 25);
seed('p-apple', 119); // 种子订单已占用 1
seed('p-salmon', 8); // 低于预警线，用于演示库存预警

app.get('/health', (req, res) => {
  ok(res, { service: 'inventory-service', status: 'ok', skus: items.size });
});

// 库存列表（含预警标记）
app.get('/', (req, res) => {
  const list = [...items.values()].map((it) => ({
    ...it,
    lowStock: it.availableQuantity <= LOW_STOCK_THRESHOLD,
  }));
  ok(res, list);
});

// 查询单个商品库存
app.get('/:productId', (req, res) => {
  const item = items.get(req.params.productId);
  if (!item) return fail(res, 404, '库存记录不存在');
  ok(res, { ...item, lowStock: item.availableQuantity <= LOW_STOCK_THRESHOLD });
});

// 管理员调整库存：{ "adjustment": 5 } 或 { "adjustment": -3 }
app.patch('/:productId', (req, res) => {
  const item = items.get(req.params.productId);
  if (!item) return fail(res, 404, '库存记录不存在');

  const { adjustment } = req.body || {};
  if (!Number.isInteger(adjustment)) return fail(res, 400, 'adjustment 必须为整数');
  if (item.availableQuantity + adjustment < 0) {
    return fail(res, 400, '调整后可用库存不能为负');
  }
  item.availableQuantity += adjustment;
  item.updatedAt = new Date().toISOString();
  ok(res, item, '库存已调整');
});

// 预扣库存：{ items: [{ productId, quantity }] }
// 状态：可用 -> 预扣
app.post('/reserve', (req, res) => {
  const { items: requested } = req.body || {};
  if (!Array.isArray(requested) || requested.length === 0) {
    return fail(res, 400, 'items 不能为空');
  }

  // 先整体校验，任一不满足则全部不扣（不产生部分预扣）
  for (const line of requested) {
    const qty = Number(line.quantity);
    if (!Number.isInteger(qty) || qty <= 0) return fail(res, 400, '数量必须为正整数');
    const item = items.get(line.productId);
    if (!item) return fail(res, 404, `商品 ${line.productId} 无库存记录`);
    if (item.availableQuantity < qty) {
      return fail(res, 409, `商品 ${line.productId} 库存不足：剩余 ${item.availableQuantity}`);
    }
  }

  // 校验通过后统一扣减
  const lines = requested.map((line) => ({ productId: line.productId, quantity: line.quantity }));
  for (const line of lines) {
    const item = items.get(line.productId);
    item.availableQuantity -= line.quantity;
    item.reservedQuantity += line.quantity;
  }

  const reservationId = `rs_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  reservations.set(reservationId, lines);
  ok(res, { reservationId, items: lines }, '库存预扣成功');
});

// 确认扣减：预扣 -> 确认扣减
app.post('/confirm', (req, res) => {
  const { reservationId } = req.body || {};
  const lines = reservations.get(reservationId);
  if (!lines) return fail(res, 404, '预扣记录不存在或已处理');

  for (const line of lines) {
    const item = items.get(line.productId);
    if (item) item.reservedQuantity -= line.quantity;
  }
  reservations.delete(reservationId);
  ok(res, { reservationId }, '库存已确认扣减');
});

// 回滚释放：预扣 -> 回滚
app.post('/release', (req, res) => {
  const { reservationId } = req.body || {};
  const lines = reservations.get(reservationId);
  if (!lines) return fail(res, 404, '预扣记录不存在或已处理');

  for (const line of lines) {
    const item = items.get(line.productId);
    if (item) {
      item.availableQuantity += line.quantity;
      item.reservedQuantity -= line.quantity;
    }
  }
  reservations.delete(reservationId);
  ok(res, { reservationId }, '库存已回滚');
});

app.use((req, res) => fail(res, 404, '路由不存在'));

app.listen(PORT, () => {
  console.log(`[inventory-service] listening on http://localhost:${PORT}`);
});
