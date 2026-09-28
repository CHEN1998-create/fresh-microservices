import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';

const PORT = process.env.PORT || 4001;
const JWT_SECRET = process.env.JWT_SECRET || 'fresh-dev-secret';

const app = express();
app.use(cors());
app.use(express.json());

// 统一响应结构：{ code, data, message }
const ok = (res, data, message = 'ok') => res.json({ code: 0, data, message });
const fail = (res, status, message) =>
  res.status(status).json({ code: status, data: null, message });

// MVP：内存用户存储，重启即丢失（后续替换为 PostgreSQL）
const users = new Map(); // id -> user
const emailIndex = new Map(); // email -> id

function publicUser(user) {
  return { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt };
}

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, JWT_SECRET, {
    expiresIn: '7d',
  });
}

function seedUser(email, role, password) {
  const id = `u_${role === 'admin' ? 'admin' : 'demo'}`;
  const user = { id, email, password, role, createdAt: new Date().toISOString() };
  users.set(id, user);
  emailIndex.set(email, id);
}

// 演示账号：管理员 / 普通用户
seedUser('admin@fresh.dev', 'admin', 'admin123');
seedUser('user@fresh.dev', 'user', 'user123');

app.get('/health', (req, res) => {
  ok(res, { service: 'auth-service', status: 'ok', users: users.size });
});

// 注册
app.post('/auth/register', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return fail(res, 400, 'email 和 password 必填');
  if (emailIndex.has(email)) return fail(res, 409, '该邮箱已注册');

  const id = `u_${Math.random().toString(36).slice(2, 10)}`;
  const user = {
    id,
    email,
    password, // MVP 明文仅用于演示，接库时必须改为 bcrypt 哈希
    role: 'user',
    createdAt: new Date().toISOString(),
  };
  users.set(id, user);
  emailIndex.set(email, id);

  ok(res, { token: signToken(user), user: publicUser(user) }, '注册成功');
});

// 登录
app.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return fail(res, 400, 'email 和 password 必填');

  const userId = emailIndex.get(email);
  const user = userId ? users.get(userId) : null;
  if (!user || user.password !== password) return fail(res, 401, '邮箱或密码错误');

  ok(res, { token: signToken(user), user: publicUser(user) }, '登录成功');
});

// 当前登录用户
app.get('/auth/me', (req, res) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return fail(res, 401, '未登录');
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = users.get(payload.sub);
    if (!user) return fail(res, 401, '用户不存在');
    ok(res, { user: publicUser(user) });
  } catch {
    fail(res, 401, 'token 无效或已过期');
  }
});

app.use((req, res) => fail(res, 404, '路由不存在'));

app.listen(PORT, () => {
  console.log(`[auth-service] listening on http://localhost:${PORT}`);
});
