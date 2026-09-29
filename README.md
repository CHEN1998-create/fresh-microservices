# 鲜达生鲜 · 生鲜电商微服务系统

一个以**交易闭环与分布式数据一致性**为核心的微服务实战项目。系统由 1 个 API 网关、4 个领域服务（鉴权 / 商品 / 库存 / 订单）和 2 个 Next.js 前端（用户端 / 管理端）组成，覆盖「浏览商品 → 加购 → 下单 → 库存预扣 → 订单流转 → 后台运营」完整链路，支持 Docker Compose 一键启动与 GitHub Actions 自动构建部署。

## 目录

- [在线演示](#在线演示)
- [功能特性](#功能特性)
- [系统架构](#系统架构)
- [技术栈](#技术栈)
- [目录结构](#目录结构)
- [快速开始](#快速开始)
- [演示数据](#演示数据)
- [API 文档](#api-文档)
- [数据模型与状态机](#数据模型与状态机)
- [一致性与权限设计](#一致性与权限设计)
- [环境变量说明](#环境变量说明)
- [生产部署](#生产部署)
- [CI/CD 流水线](#cicd-流水线)
- [测试与验证脚本](#测试与验证脚本)
- [常见问题排查](#常见问题排查)
- [后续迭代方向](#后续迭代方向)

---

## 在线演示

| 入口 | 地址 | 演示账号 |
|---|---|---|
| 🛒 用户端 | http://nas.qich.top:13000/ | `user@fresh.dev / user123`（或自行注册） |
| ⚙️ 管理端 | http://nas.qich.top:13001/ | `admin@fresh.dev / admin123` |

> 演示环境部署在内网 NAS，需处于同一网络环境访问。若管理端打不开，请检查 NAS 端口映射 `13001 → 容器 3001`。

**推荐演示动线（约 3 分钟跑完全部亮点）：**

1. 用户端登录 → 首页按分类筛选/搜索商品 → 进入详情查看库存
2. 加购 → 购物车改数量 → 提交订单（可故意多买触发"库存不足 409"）
3. 「我的订单」取消刚下的订单 → 到管理端库存页确认库存**已回补**
4. 管理端登录 → 运营概览看商品数 / 库存预警（三文鱼 ≤10 件）/ 待处理订单 / GMV
5. 商品管理下架或删除一个商品 → 用户端刷新，该商品**立即 404 / 不可下单**
6. 订单管理把一个 `created` 订单**标记完成**；再尝试取消它，被状态机拒绝（400）

---

## 功能特性

### 用户端（user-web）

- 商品瀑布流卡片、分类筛选、关键词搜索
- 商品详情页展示价格、描述、库存状态
- 购物车基于 localStorage 持久化，未登录也可加购，结算时再要求登录
- 下单、订单列表、订单状态标签、取消未处理订单

### 管理端（admin-web）

- **运营概览**：在售/全部商品数、低库存预警数、待处理订单数、订单总额（GMV）
- **商品管理**：新增 / 编辑 / 上下架 / 软删除，支持查看含已删除商品的全量视图
- **库存管理**：库存列表、低库存高亮预警（≤10 件）、正负数调整、防止库存为负
- **订单管理**：全部订单、取消订单、标记完成

### 后端与架构亮点

- **统一网关**：路由转发、JWT 验签、基于角色的接口守卫，下游服务不直接暴露
- **交易闭环与补偿**：下单走「校验商品 → 预扣库存 → 创建订单 → 确认扣减」，确认失败自动释放预扣并撤销订单
- **库存强一致**：取消订单先回补库存再改状态；`restockApplied` 标志防止重复回补
- **订单状态机**：`created → completed / cancelled` 不可逆流转，非法变更返回 400
- **商品软删除**：删除对普通用户表现为 404、管理员 `?all=true` 可见，删除接口幂等；历史订单保留商品名称/价格快照
- **权限隔离**：用户只能操作自己的订单，管理员可操作任意订单，管理接口统一 `/api/admin/` 前缀 + admin 角色
- **工程化**：统一响应结构、容器健康检查与按依赖顺序启动、GHCR 镜像流水线、镜像 sha 标签可回滚

---

## 系统架构

```mermaid
flowchart LR
  USER["🛒 用户端 user-web<br/>Next.js :3000"] --> GW["API Gateway<br/>:4000<br/>路由 + JWT 鉴权"]
  ADMIN["⚙️ 管理端 admin-web<br/>Next.js :3001"] --> GW
  GW --> AUTH["Auth Service<br/>:4001"]
  GW --> CATALOG["Catalog Service<br/>:4002"]
  GW --> INVENTORY["Inventory Service<br/>:4003"]
  GW --> ORDER["Order Service<br/>:4004"]
  ORDER -->|"GET /products/:id 校验商品"| CATALOG
  ORDER -->|"POST /reserve /confirm /release /restock"| INVENTORY
  AUTH --> PG[("PostgreSQL 16<br/>users 表")]
```

**关键设计：**

- 前端不直连任何业务服务，统一通过 Next.js rewrites 把 `/api/*` 反代给网关
- 服务间调用走 compose 内网（`http://catalog-service:4002` 等），不经网关、不暴露宿主机端口
- 网关在代理前验签 JWT，并把用户身份以 `x-user-id`、`x-user-role` 请求头注入下游
- 商品/库存/订单三个服务为**独立内存存储**（服务自治、无共享数据库），仅 Auth 使用 PostgreSQL

**下单时序：**

```mermaid
sequenceDiagram
  participant U as 用户端
  participant GW as Gateway
  participant O as Order
  participant C as Catalog
  participant I as Inventory
  U->>GW: POST /api/orders (JWT)
  GW->>O: 转发 + x-user-id
  O->>C: 逐项校验商品存在且 status=on
  C-->>O: 商品信息（服务端价格）
  O->>I: POST /reserve 预扣（整体校验）
  alt 库存充足
    I-->>O: reservationId
    O->>O: 创建订单 created（含商品名/价格快照）
    O->>I: POST /confirm 确认扣减
    alt 确认失败
      O->>I: POST /release 释放预扣
      O->>O: 撤销订单
    end
    O-->>U: 订单创建成功
  else 任一商品不足
    I-->>O: 409（全部不扣）
    O-->>U: 库存不足，下单失败
  end
```

---

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Next.js 14（App Router、standalone 输出）、TypeScript、Tailwind CSS |
| 网关 / 服务 | Node.js 18、Express 4、http-proxy-middleware |
| 鉴权 | jsonwebtoken（JWT，7 天有效期）、bcryptjs（密码哈希） |
| 数据库 | PostgreSQL 16（node-postgres / pg.Pool） |
| 容器化 | Docker（多阶段构建，前端基于 alpine standalone）、Docker Compose |
| CI/CD | GitHub Actions + GHCR（GitHub Container Registry） |
| Monorepo | npm workspaces |

---

## 目录结构

```
.
├── apps/                          # 前端应用（npm workspaces）
│   ├── user-web/                  # 用户端 Next.js 应用
│   │   ├── app/                   #   App Router 页面：首页/商品详情/购物车/订单/登录
│   │   ├── lib/                   #   api.ts(请求封装) cart.ts(购物车) format.ts(金额)
│   │   ├── Dockerfile             #   monorepo 根上下文构建，构建期注入 API_GATEWAY_URL
│   │   └── next.config.mjs        #   /api/* rewrites 反代网关
│   └── admin-web/                 # 管理端 Next.js 应用
│       ├── app/(dashboard)/       #   概览/商品/库存/订单（带侧边栏布局组）
│       ├── lib/                   #   api.ts / format.ts
│       └── Dockerfile
├── services/                      # 后端服务
│   ├── api-gateway/src/index.js   #   网关：鉴权守卫 + 6 组代理规则
│   ├── auth-service/src/
│   │   ├── index.js               #   注册/登录/me，JWT 签发
│   │   └── userStore.js           #   存储抽象层：内存 / PostgreSQL 双实现 + 种子账号
│   ├── catalog-service/src/       #   商品 CRUD、软删除、?all=true 管理员视图（种子 6 商品）
│   ├── inventory-service/src/     #   预扣/确认/释放/回补、库存调整、预警（种子 6 SKU）
│   └── order-service/src/         #   下单编排、订单状态机、取消/完成（种子 2 订单）
├── scripts/                       # 独立验证脚本（Node 直接运行）
│   ├── smoke-test.mjs             #   全链路冒烟：注册/鉴权/商品/下单/库存
│   ├── verify-e2e.mjs             #   端到端主链路
│   ├── verify-order-flow.mjs      #   订单流转 × 库存联动 × 权限（12 个用例）
│   └── verify-soft-delete.mjs     #   软删除权限隔离（11 个用例）
├── .github/workflows/docker-publish.yml  # CI：矩阵构建 7 镜像推送 GHCR
├── docker-compose.yml             # 本地开发编排（含 PG，密码固定 fresh-dev）
├── docker-compose.prod.yml        # 生产编排（GHCR 镜像、健康检查、仅前端暴露端口）
├── .env.example                   # 生产环境变量模板
├── render.yaml                    # Render 平台部署描述文件（备选方案）
├── PRD.md                         # 产品需求文档 v1.0
└── package.json                   # workspaces 根清单
```

---

## 快速开始

### 环境要求

- Node.js ≥ 18（含内置 fetch）
- npm ≥ 9（workspaces）
- 或 Docker Desktop / 服务器 Docker Engine ≥ 24 + Compose 插件

### 方式一：Docker Compose（一条命令起全栈，含 PostgreSQL）

```bash
docker compose up -d --build
```

启动后：

- 用户端：http://localhost:3000
- 管理端：http://localhost:3001
- 网关：http://localhost:4000/health
- PostgreSQL：localhost:5432（用户 fresh / 密码 fresh-dev / 库 fresh）

> 本地编排中 catalog/inventory/order 是内存服务，重建容器后回到种子数据。

### 方式二：Node 本地开发（改代码热重载，auth 自动回退内存存储）

```bash
npm install                # 一次性安装所有 workspace 依赖

# 终端 1：同时启动 5 个后端服务（4000-4004）
npm run dev:services

# 终端 2：用户端 http://localhost:3000
npm run dev:user

# 终端 3：管理端 http://localhost:3001
npm run dev:admin
```

未设置 `DATABASE_URL` 时 auth-service 自动使用内存存储，无需安装 PostgreSQL；如要本地连库，参考 `docker-compose.yml` 启动 postgres 后设置 `DATABASE_URL` 即可。

---

## 演示数据

系统启动时自动播种，开箱即可演示：

**账号（auth-service 写入 PostgreSQL 或内存）：**

| 角色 | 邮箱 | 密码 |
|---|---|---|
| 管理员 | admin@fresh.dev | admin123 |
| 普通用户 | user@fresh.dev | user123 |

**商品（6 个，覆盖 4 个分类）：** 🍅 有机番茄 ¥8.90、🥒 旱黄瓜 ¥5.90、🥚 散养鸡蛋 ¥15.80、🥛 鲜牛奶 ¥22.00、🍎 红富士苹果 ¥12.90、🐟 挪威三文鱼 ¥68.00

**库存：** 番茄 118、黄瓜 60、鸡蛋 40、牛奶 25、苹果 119、三文鱼 **8（低于 10 件预警线，用于演示低库存）**

**历史订单（归属演示用户）：** `o_1001` 已创建（2 份番茄）、`o_1002` 已完成（1 份苹果），库存已对应预占。

---

## API 文档

所有对外接口经网关访问，基础路径 `http://<host>:4000`，前端内则走相对路径 `/api`。

### 统一约定

- 请求 / 响应均为 JSON
- 成功响应：`{ "code": 0, "data": ..., "message": "ok" }`
- 失败响应：HTTP 状态码与 `code` 相同，如 `401 { "code": 401, "data": null, "message": "未登录" }`
- 鉴权：除注册/登录/商品浏览外，请求头携带 `Authorization: Bearer <token>`
- 金额单位统一为**分**（`priceCents` / `totalAmountCents`），前端格式化为元

### 接口清单

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/api/auth/register` | — | 注册，返回 token + user |
| POST | `/api/auth/login` | — | 登录 |
| GET | `/api/auth/me` | 用户 | 当前登录用户 |
| GET | `/api/catalog/products` | 可选 | 列表，query：`category`、`keyword`、`all=true`(仅管理员) |
| GET | `/api/catalog/products/:id` | 可选 | 详情；已删除对非管理员 404 |
| POST | `/api/admin/products` | 管理员 | 新增商品 |
| PATCH | `/api/admin/products/:id` | 管理员 | 编辑 / 上下架（`status: on|off`） |
| DELETE | `/api/admin/products/:id` | 管理员 | 软删除（幂等） |
| GET | `/api/inventory` | — | 库存列表（含 `lowStock` 标记） |
| GET | `/api/inventory/:productId` | — | 单商品库存 |
| PATCH | `/api/inventory/:productId` | 管理员 | 调整库存 `{ "adjustment": -3 }` |
| POST | `/api/orders` | 用户 | 创建订单 |
| GET | `/api/orders/my` | 用户 | 我的订单（按时间倒序） |
| GET | `/api/orders/:id` | 用户/管理员 | 订单详情（属主或管理员） |
| POST | `/api/orders/:id/cancel` | 用户/管理员 | 取消（先回补库存，幂等） |
| GET | `/api/admin/orders` | 管理员 | 全部订单 |
| POST | `/api/admin/orders/:id/complete` | 管理员 | 标记完成 |
| GET | `/health` | — | 网关健康检查 |

服务间内部接口（不经网关，仅 compose 内网）：Inventory 的 `POST /reserve`、`POST /confirm`、`POST /release`、`POST /restock`。

### 典型调用示例

```bash
# 1. 登录
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@fresh.dev","password":"user123"}'
# -> { "code": 0, "data": { "token": "eyJ...", "user": { "id": "u_demo", ... } } }

# 2. 下单（携带 token）
curl -X POST http://localhost:4000/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"items":[{"productId":"p-tomato","quantity":2}]}'
# -> { "code": 0, "data": { "id": "o_1003", "status": "created",
#      "items": [{"productId":"p-tomato","name":"有机番茄","quantity":2,"priceCents":890}],
#      "totalAmountCents": 1780, ... } }

# 3. 取消订单（库存自动回补）
curl -X POST http://localhost:4000/api/orders/o_1003/cancel \
  -H "Authorization: Bearer <TOKEN>"
```

---

## 数据模型与状态机

### users（PostgreSQL，auth-service 启动自动建表 + seed）

```sql
CREATE TABLE users (
  id            text PRIMARY KEY,          -- u_admin / u_demo / u_xxxxxx
  email         text UNIQUE NOT NULL,
  password_hash text NOT NULL,             -- bcrypt(cost=10)
  role          text NOT NULL,             -- 'user' | 'admin'
  created_at    timestamptz NOT NULL DEFAULT now()
);
```

> 双存储实现（内存 Map / PostgreSQL）对外暴露同一套驼峰字段契约（`passwordHash`、`createdAt`），PG 出口由 `mapUserRow` 做下划线→驼峰映射。

### 商品状态机

```
on（在售） ⇄ off（下架）
     └── 任意状态可 → deleted（软删除，幂等；管理员可 PATCH 回 on 恢复）
```

### 订单状态机（不可逆）

```mermaid
stateDiagram-v2
  [*] --> created: 下单成功
  created --> completed: 管理员标记完成
  created --> cancelled: 用户/管理员取消（先 restock 回补库存）
  completed --> [*]
  cancelled --> [*]
```

### 库存模型

每个 SKU：`availableQuantity`（可售）+ `reservedQuantity`（预扣中）。
生命周期：预扣（available↓ reserved↑）→ 确认（reserved↓）或释放（available↑ reserved↓）；取消已确认订单走 `restock`（available↑）。低库存阈值 10 件。

---

## 一致性与权限设计

这是本项目的核心学习点，关键规则均已由 `scripts/verify-*.mjs` 自动化验证：

1. **下单原子性**：库存预扣前先整体校验所有商品，任一不足则全部不扣，杜绝部分扣减
2. **确认失败补偿**：订单落库后确认扣减若失败，先 `release` 预扣再删除订单，绝不出现"有单无库存"
3. **取消先回补**：取消接口先调库存 `/restock`，成功才把订单置为 `cancelled`；回补失败订单保持 `created`，调用方可安全重试
4. **取消幂等**：`restockApplied` 标志位保证同一订单不会重复回补库存（重复取消返回 409）
5. **状态流转保护**：只有 `created` 可取消/完成，终态再操作返回 400
6. **价格服务端计算**：订单金额取自 Catalog 返回的实时价格并做**行快照**，不信任前端传价；商品后续改名/删除不影响历史订单
7. **软删除闭环**：已删除商品对普通用户列表不可见、详情 404、下单被拒（400）；管理员可全量审计；删除操作幂等
8. **鉴权集中在网关**：`/api/orders` 需登录、`/api/admin/` 需 admin、库存写操作需 admin、商品读公开但带 token 时注入身份；下游信任网关注入的 `x-user-*` 头

---

## 环境变量说明

生产环境通过仓库根目录的 `.env` 注入（模板见 `.env.example`，已被 gitignore）：

| 变量 | 用途 | 生成/示例 |
|---|---|---|
| `JWT_SECRET` | JWT 签发与验签密钥，**网关与 auth 必须一致** | `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | PostgreSQL 初始化密码，auth 据此拼 `DATABASE_URL`；**初始化后修改会导致连不上旧数据卷** | `openssl rand -hex 16` |

各服务内置变量（`docker-compose.prod.yml` 已配好，一般无需改动）：

| 服务 | 变量 | 默认/生产值 |
|---|---|---|
| 全部后端 | `PORT` | 4001–4004 / 4000 |
| auth | `DATABASE_URL` | `postgres://fresh:***@postgres:5432/fresh` |
| order | `CATALOG_SERVICE_URL` / `INVENTORY_SERVICE_URL` | compose 内网服务名 |
| gateway | `AUTH/CATALOG/INVENTORY/ORDER_SERVICE_URL`、`JWT_SECRET` | 内网服务名 |
| 前端（构建期） | `API_GATEWAY_URL` | `http://api-gateway:4000`（Dockerfile ARG 注入，见下文注意事项） |

---

## 生产部署

镜像不在服务器构建（避免小内存机器构建 Next.js OOM），由 CI 推送到 GHCR 后服务器拉取运行。

### 一次性准备（Ubuntu 示例）

```bash
# 1. 安装 Docker
curl -fsSL https://get.docker.com | sh

# 2. 防火墙放行（云服务器还需在厂商控制台安全组放行 3000/3001）
sudo ufw allow 22 && sudo ufw allow 3000 && sudo ufw allow 3001
sudo ufw --force enable

# 3. 拉代码、配置密钥
git clone https://github.com/CHEN1998-create/fresh-microservices.git
cd fresh-microservices
cp .env.example .env
sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|; \
        s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 16)|" .env

# 4. 若 GitHub 仓库/镜像包为私有，登录 GHCR（公开可跳过）
#    Token 在 GitHub Settings → Developer settings → PAT 生成，勾选 read:packages
echo "<YOUR_TOKEN>" | docker login ghcr.io -u CHEN1998-create --password-stdin
```

### 启动与验证

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps   # postgres healthy，4 个后端 healthy，网关/前端 running

# 容器内自检（经前端反代打全链路）
curl -i -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@fresh.dev","password":"user123"}'
```

生产编排特性：所有服务 `restart: always`；4 个后端带 wget 健康检查；网关通过 `depends_on: service_healthy` 等下游全部就绪才启动；仅 3000/3001 映射宿主机。

### 日常更新 / 回滚 / 重置

```bash
# 更新到最新镜像
git pull
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# 回滚：把 compose 中对应镜像的 :latest 改为 :sha-xxxx（每次 CI 都会打 sha 短哈希标签）

# 查看日志
docker compose -f docker-compose.prod.yml logs -f api-gateway

# 彻底重置（含数据库，演示环境可随时执行）
docker compose -f docker-compose.prod.yml down
docker volume rm fresh-microservices_fresh-pgdata   # 卷名以 docker volume ls 为准
```

---

## CI/CD 流水线

`.github/workflows/docker-publish.yml`：

- **触发**：push 到 `main`（纯 `*.md` 文档变更自动跳过），或 Actions 页面手动触发
- **构建**：矩阵并行构建 7 个镜像（5 后端 + 2 前端），Buildx + GitHub Actions 层缓存
- **推送**：`ghcr.io/chen1998-create/fresh-{auth,catalog,inventory,order,gateway,user-web,admin-web}`
- **标签**：`latest`（main 最新）+ `sha-<短哈希>`（每次提交，用于回滚）
- **并发控制**：同一分支连续 push 自动取消旧构建
- 鉴权直接使用 Actions 自动签发的 `GITHUB_TOKEN`，无需额外配置 secret

---

## 测试与验证脚本

先启动全部服务（`npm run dev:services` 或 docker compose），再运行：

```bash
npm run smoke                          # 全链路冒烟（注册/登录/商品/下单/库存调整）
node scripts/verify-e2e.mjs            # 用户视角端到端主链路
node scripts/verify-order-flow.mjs     # 订单流转+库存联动+越权防护（12 用例）
node scripts/verify-soft-delete.mjs    # 软删除权限隔离（11 用例）

# 指向其他环境（如线上）：
BASE_URL=http://nas.qich.top:13000/api node scripts/smoke-test.mjs
```

每个脚本输出 ✅/❌ 用例清单并给出失败详情。

---

## 常见问题排查

**1. postgres 反复重启：`Database is uninitialized and superuser password is not specified`**
`.env` 缺失或 `POSTGRES_PASSWORD` 为空。按"生产部署"生成 `.env`，并用 `docker compose -f docker-compose.prod.yml config | grep POSTGRES_PASSWORD` 确认变量已注入。compose 已配置 `:?` 必填校验，缺失时会直接报清晰错误。

**2. 页面能打开，但登录/注册提示"下游服务不可用"（503）**
网关到 auth-service 的网络不通，或 auth 容器在反复重启（如连不上 PG）。排查：
`docker compose ps` 看状态 → `docker compose logs auth-service` 看崩溃原因。生产编排已用健康检查保证网关在下游就绪后才启动。

**3. 前端登录请求打到了 `localhost:4000` 导致失败**
Next.js 的 `rewrites()` 在 `next build` 阶段执行并固化，运行时再设 `API_GATEWAY_URL` 无效。生产镜像必须在构建期通过 `--build-arg API_GATEWAY_URL=http://api-gateway:4000` 注入（本仓库 Dockerfile / workflow / compose 均已配置）。

**4. auth 崩溃：`Error: Illegal arguments: string, undefined`（bcrypt）**
PG 模式下列名是 `password_hash`，业务层读 `passwordHash` 得到 undefined。已由 `mapUserRow` 字段映射修复，拉取最新镜像即可；自行扩展 PG 表时注意保持下划线→驼峰映射。

**5. 重启容器后商品/订单不见了**
catalog/inventory/order 当前为 MVP 内存存储，重建即回到种子数据（用户账号在 PG 中不受影响）。持久化这三个服务是下一阶段计划。

**6. 注册接口 409 或登录提示账号错误**
演示账号固定 seeded；重复注册同邮箱返回 409 属正常。忘记自定义账号密码时，生产环境可删掉 PG 数据卷重新初始化。

---

## 后续迭代方向

- catalog / inventory / order 接入 PostgreSQL（每服务独立库，彻底告别内存存储）
- 库存记录与商品软删除联动（已删除商品库存置灰或自动隐藏）
- 服务间调用增加超时/重试/熔断与链路 ID 日志追踪
- 引入消息队列实现订单事件异步化、分布式事务（Saga / 本地消息表）
- 接入 HTTPS 域名（Caddy/Traefik 自动证书）、接口限流
- 前端补充：商品图片、收货地址、支付模拟、订单分页

---

## 相关文档

- [PRD.md](./PRD.md) — 产品需求文档 v1.0（页面规划、完整接口清单、状态机、非功能要求）
