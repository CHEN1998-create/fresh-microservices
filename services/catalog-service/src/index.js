import express from 'express';
import cors from 'cors';

const PORT = process.env.PORT || 4002;

const app = express();
app.use(cors());
app.use(express.json());

const ok = (res, data, message = 'ok') => res.json({ code: 0, data, message });
const fail = (res, status, message) =>
  res.status(status).json({ code: status, data: null, message });

// MVP：内存商品目录，重启即丢失（后续替换为 PostgreSQL products 表）
const products = [
  {
    id: 'p-tomato',
    name: '有机番茄',
    category: '蔬菜',
    priceCents: 890,
    status: 'on',
    emoji: '🍅',
    description: '自然成熟，沙瓤多汁，约 500g/份',
    createdAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'p-cucumber',
    name: '旱黄瓜',
    category: '蔬菜',
    priceCents: 590,
    status: 'on',
    emoji: '🥒',
    description: '顶花带刺，清脆爽口，约 500g/份',
    createdAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'p-egg',
    name: '散养鸡蛋（10 枚）',
    category: '肉蛋',
    priceCents: 1580,
    status: 'on',
    emoji: '🥚',
    description: '谷饲散养，蛋黄饱满，55g±5g/枚',
    createdAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'p-milk',
    name: '鲜牛奶 950ml',
    category: '乳品',
    priceCents: 2200,
    status: 'on',
    emoji: '🥛',
    description: '当日巴氏杀菌，冷链配送',
    createdAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'p-apple',
    name: '红富士苹果',
    category: '水果',
    priceCents: 1290,
    status: 'on',
    emoji: '🍎',
    description: '脆甜多汁，果径 80mm+，约 4 粒/份',
    createdAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'p-salmon',
    name: '挪威三文鱼刺身',
    category: '肉蛋',
    priceCents: 6800,
    status: 'on',
    emoji: '🐟',
    description: '冰鲜空运，刺身级，约 200g/份',
    createdAt: '2026-09-01T00:00:00.000Z',
  },
];

app.get('/health', (req, res) => {
  ok(res, { service: 'catalog-service', status: 'ok', products: products.length });
});

// 商品列表：?category=&keyword=&all=
// ?all=true 仅对管理员（由 Gateway 注入 x-user-role: admin）生效，普通用户/未登录一律只看在售
app.get('/products', (req, res) => {
  const { category, keyword, all } = req.query;
  const isAdmin = req.header('x-user-role') === 'admin';
  let list = [...products];
  if (all !== 'true' || !isAdmin) list = list.filter((p) => p.status === 'on');
  if (category) list = list.filter((p) => p.category === category);
  if (keyword) list = list.filter((p) => p.name.includes(String(keyword)));
  ok(res, list);
});

// 商品详情
// 已删除商品对非管理员返回 404；管理员可通过 ?all=true 查看（用于后台审计）
app.get('/products/:id', (req, res) => {
  const product = products.find((p) => p.id === req.params.id);
  if (!product) return fail(res, 404, '商品不存在');
  const isAdmin = req.header('x-user-role') === 'admin';
  const showAll = req.query.all === 'true' && isAdmin;
  if (product.status === 'deleted' && !showAll) {
    return fail(res, 404, '商品不存在');
  }
  ok(res, product);
});

// 管理员新增商品
app.post('/admin/products', (req, res) => {
  const { name, category, priceCents, description } = req.body || {};
  if (!name || !category || !Number.isInteger(priceCents) || priceCents <= 0) {
    return fail(res, 400, 'name、category 必填，priceCents 必须为正整数');
  }
  const product = {
    id: `p-${Math.random().toString(36).slice(2, 8)}`,
    name,
    category,
    priceCents,
    status: 'on',
    emoji: '🥬',
    description: description || '',
    createdAt: new Date().toISOString(),
  };
  products.push(product);
  ok(res, product, '商品已创建');
});

// 管理员编辑商品 / 上下架
app.patch('/admin/products/:id', (req, res) => {
  const product = products.find((p) => p.id === req.params.id);
  if (!product) return fail(res, 404, '商品不存在');

  const { name, category, priceCents, status, description } = req.body || {};
  if (name !== undefined) product.name = name;
  if (category !== undefined) product.category = category;
  if (description !== undefined) product.description = description;
  if (priceCents !== undefined) {
    if (!Number.isInteger(priceCents) || priceCents <= 0) {
      return fail(res, 400, 'priceCents 必须为正整数');
    }
    product.priceCents = priceCents;
  }
  if (status !== undefined) {
    if (!['on', 'off'].includes(status)) return fail(res, 400, "status 只能是 on / off");
    product.status = status;
  }
  ok(res, product, '商品已更新');
});

// 管理员删除商品（软删除：status -> 'deleted'）
// 保留记录用于订单历史引用与审计；恢复可通过 PATCH status='on' 完成
app.delete('/admin/products/:id', (req, res) => {
  const product = products.find((p) => p.id === req.params.id);
  if (!product) return fail(res, 404, '商品不存在');
  if (product.status === 'deleted') return ok(res, product, '商品已删除'); // 幂等
  product.status = 'deleted';
  product.updatedAt = new Date().toISOString();
  ok(res, product, '商品已删除');
});

app.use((req, res) => fail(res, 404, '路由不存在'));

app.listen(PORT, () => {
  console.log(`[catalog-service] listening on http://localhost:${PORT}`);
});
