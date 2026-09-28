import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createStore, publicUser } from './userStore.js';

const PORT = process.env.PORT || 4001;
const JWT_SECRET = process.env.JWT_SECRET || 'fresh-dev-secret';

const app = express();
app.use(cors());
app.use(express.json());

// 统一响应结构：{ code, data, message }
const ok = (res, data, message = 'ok') => res.json({ code: 0, data, message });
const fail = (res, status, message) =>
  res.status(status).json({ code: status, data: null, message });

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, JWT_SECRET, {
    expiresIn: '7d',
  });
}

let userStore;
let pgPool;

// 启动时初始化存储层（pg 或内存）
async function bootstrap() {
  ({ store: userStore, pool: pgPool } = await createStore());
  const mode = process.env.DATABASE_URL ? 'postgres' : 'memory';
  console.log(`[auth-service] storage mode: ${mode}, users seeded: ${await userStore.count()}`);

  app.listen(PORT, () => {
    console.log(`[auth-service] listening on http://localhost:${PORT}`);
  });
}

// 健康检查：同时暴露 /health（直连）和 /auth/health（经 gateway 重写后可达）
async function healthHandler(req, res) {
  ok(res, {
    service: 'auth-service',
    status: 'ok',
    storage: process.env.DATABASE_URL ? 'postgres' : 'memory',
    users: await userStore.count(),
  });
}
app.get('/health', healthHandler);
app.get('/auth/health', healthHandler);

// 注册
app.post('/auth/register', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return fail(res, 400, 'email 和 password 必填');
  if (await userStore.findByEmail(email)) return fail(res, 409, '该邮箱已注册');

  const id = `u_${Math.random().toString(36).slice(2, 10)}`;
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await userStore.create({ id, email, passwordHash, role: 'user' });
  ok(res, { token: signToken(user), user: publicUser(user) }, '注册成功');
});

// 登录
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return fail(res, 400, 'email 和 password 必填');

  const user = await userStore.findByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return fail(res, 401, '邮箱或密码错误');
  }
  ok(res, { token: signToken(user), user: publicUser(user) }, '登录成功');
});

// 当前登录用户
app.get('/auth/me', async (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return fail(res, 401, '未登录');
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await userStore.findById(payload.sub);
    if (!user) return fail(res, 401, '用户不存在');
    ok(res, { user: publicUser(user) });
  } catch {
    fail(res, 401, 'token 无效或已过期');
  }
});

app.use((req, res) => fail(res, 404, '路由不存在'));

// 优雅关闭：释放 pg 连接池
async function shutdown(signal) {
  console.log(`[auth-service] received ${signal}, shutting down...`);
  if (pgPool) await pgPool.end();
  process.exit(0);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

bootstrap().catch((err) => {
  console.error('[auth-service] bootstrap failed:', err);
  process.exit(1);
});
