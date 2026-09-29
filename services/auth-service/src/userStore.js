// 用户存储抽象层：根据是否配置 DATABASE_URL 自动选择 pg 或内存实现
// - 未配置 DATABASE_URL：使用内存 Map（重启即丢，仅用于本地开发）
// - 配置 DATABASE_URL：使用 PostgreSQL，schema 自动初始化，演示账号自动 seed
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 10;

export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

// 演示账号：管理员 / 普通用户
const SEED_ACCOUNTS = [
  { id: 'u_admin', email: 'admin@fresh.dev', role: 'admin', password: 'admin123' },
  { id: 'u_demo', email: 'user@fresh.dev', role: 'user', password: 'user123' },
];

// ---- 内存实现 ----
function createMemoryStore() {
  const users = new Map(); // id -> user
  const emailIndex = new Map(); // email -> id

  return {
    async init() {
      for (const a of SEED_ACCOUNTS) {
        const passwordHash = await bcrypt.hash(a.password, BCRYPT_ROUNDS);
        users.set(a.id, { ...a, passwordHash, createdAt: new Date().toISOString() });
        emailIndex.set(a.email, a.id);
      }
    },
    async findByEmail(email) {
      const id = emailIndex.get(email);
      return id ? users.get(id) ?? null : null;
    },
    async findById(id) {
      return users.get(id) ?? null;
    },
    async create({ id, email, passwordHash, role }) {
      const user = { id, email, passwordHash, role, createdAt: new Date().toISOString() };
      users.set(id, user);
      emailIndex.set(email, id);
      return user;
    },
    async count() {
      return users.size;
    },
  };
}

// ---- PostgreSQL 实现 ----
// PG 列名为下划线风格，统一映射为业务层使用的驼峰字段，避免 passwordHash 读到 undefined
function mapUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt: row.created_at,
  };
}

function createPgStore(pgPool) {
  return {
    async init() {
      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id            text PRIMARY KEY,
          email          text UNIQUE NOT NULL,
          password_hash  text NOT NULL,
          role           text NOT NULL,
          created_at     timestamptz NOT NULL DEFAULT now()
        )
      `);
      for (const a of SEED_ACCOUNTS) {
        const passwordHash = await bcrypt.hash(a.password, BCRYPT_ROUNDS);
        await pgPool.query(
          `INSERT INTO users (id, email, password_hash, role)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO NOTHING`,
          [a.id, a.email, passwordHash, a.role]
        );
      }
    },
    async findByEmail(email) {
      const { rows } = await pgPool.query('SELECT * FROM users WHERE email = $1', [email]);
      return mapUserRow(rows[0]);
    },
    async findById(id) {
      const { rows } = await pgPool.query('SELECT * FROM users WHERE id = $1', [id]);
      return mapUserRow(rows[0]);
    },
    async create({ id, email, passwordHash, role }) {
      const { rows } = await pgPool.query(
        `INSERT INTO users (id, email, password_hash, role)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [id, email, passwordHash, role]
      );
      return mapUserRow(rows[0]);
    },
    async count() {
      const { rows } = await pgPool.query('SELECT COUNT(*)::int AS n FROM users');
      return rows[0].n;
    },
  };
}

// 工厂：根据环境变量返回 store（含 pgPool 引用，便于关闭）
export async function createStore() {
  if (process.env.DATABASE_URL) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const store = createPgStore(pool);
    await store.init();
    return { store, pool };
  }
  const store = createMemoryStore();
  await store.init();
  return { store, pool: null };
}
