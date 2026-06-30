# OpenClaw Admin Code Wiki

## 项目概述

OpenClaw Admin 是一个基于 React + Vite 的本地 Web UI 管理后台，用于查看 OpenClaw 的运行状态、会话、记忆库、能力中心（插件/技能/扩展）、定时任务、用量分析、系统配置和日志。

> ⚠️ 本项目为 **dev 模式本地预览** 设计，API 中间层是 Vite 插件，仅在 `npm run dev` 时生效。生产部署需要额外搭建后端服务。

## 技术栈

- **前端框架**: React 18 + TypeScript
- **构建工具**: Vite 6
- **样式方案**: Tailwind CSS 3 + 自定义设计系统（cl-card / cl-badge / cl-btn）
- **路由**: react-router-dom 7
- **图标**: lucide-react
- **API 中间层**: Vite 自定义插件（仅 dev 模式）

## 项目结构

```
openclaw-admin/
├── docs/                           # 项目文档
│   ├── PRODUCT_REQUIREMENTS.md     # 产品需求文档
│   └── TECHNICAL_ARCHITECTURE.md   # 技术架构文档
├── public/                         # 静态资源
│   └── favicon.svg
├── src/                            # 源代码目录
│   ├── assets/                     # 资源文件
│   │   └── react.svg
│   ├── components/                 # 组件目录
│   │   ├── layout/                 # 布局组件
│   │   │   ├── BottomNav.tsx       # 底部导航栏
│   │   │   ├── Layout.tsx          # 主布局组件
│   │   │   ├── Sidebar.tsx         # 侧边栏
│   │   │   └── TopBar.tsx          # 顶部栏
│   │   └── NotificationBell.tsx    # 通知铃铛组件
│   ├── config/                     # 配置文件
│   │   └── navigation.ts          # 导航配置
│   ├── lib/                        # 工具库
│   │   ├── api.ts                  # API 接口封装
│   │   └── utils.ts                # 工具函数
│   ├── pages/                      # 页面组件
│   │   ├── Agents.tsx              # Agent 管理页面
│   │   ├── Capabilities.tsx        # 能力中心页面
│   │   ├── Config.tsx              # 系统配置页面
│   │   ├── Dashboard.tsx           # 仪表盘页面
│   │   ├── Logs.tsx                # 日志中心页面
│   │   ├── Memory.tsx              # 记忆库页面
│   │   ├── Tasks.tsx               # 定时任务页面
│   │   └── Usage.tsx               # 用量中心页面
│   ├── theme/                      # 主题配置
│   │   └── index.tsx               # 主题提供者
│   ├── types/                      # TypeScript 类型定义
│   │   └── index.ts                # 类型定义文件
│   ├── App.tsx                     # 应用入口组件
│   ├── index.css                   # 全局样式
│   ├── main.tsx                    # 主入口文件
│   └── vite-env.d.ts               # Vite 环境类型声明
├── .env.example                    # 环境变量示例
├── .gitignore                      # Git 忽略配置
├── README.md                       # 项目说明文档
├── eslint.config.js                # ESLint 配置
├── index.html                      # HTML 入口文件
├── package-lock.json               # npm 依赖锁文件
├── package.json                    # npm 配置文件
├── postcss.config.js               # PostCSS 配置
├── tailwind.config.js              # Tailwind CSS 配置
├── tsconfig.json                   # TypeScript 配置
├── vite-plugin-openclaw-api.ts     # Vite API 插件
└── vite.config.ts                  # Vite 配置文件
```

## 核心模块说明

### 1. API 中间层 (vite-plugin-openclaw-api.ts)

这是项目的核心模块，作为 Vite 插件实现，提供后端 API 服务。仅在开发模式下生效。

#### 主要职责

- 读取 OpenClaw 的文件系统数据（不调用 CLI）
- 提供 RESTful API 接口
- 处理数据聚合和转换
- 管理数据缓存

#### 关键函数

| 函数名 | 说明 |
|--------|------|
| `readSessions()` | 读取会话数据 |
| `readCronJobs()` | 读取定时任务 |
| `readCronRuns()` | 读取任务执行记录 |
| `readConfig()` | 读取系统配置 |
| `readLogs()` | 读取各类日志 |
| `readPlugins()` | 读取插件信息 |
| `readPluginMeta()` | 从插件目录读取元数据（package.json/plugin.json） |
| `readSkills()` | 读取技能信息 |
| `readUsageCost()` | 读取用量统计数据 |
| `readConnectors()` | 检查数据源连接状态 |
| `readMemoryArchitecture()` | 读取记忆库架构 |
| `readVectorBreakdown()` | 读取向量库分类统计 |

#### API 端点

| 端点 | 说明 |
|------|------|
| `/api/status` | 系统状态概览 |
| `/api/sessions` | 会话列表 |
| `/api/cron` | 定时任务列表 |
| `/api/cron/runs` | 任务执行记录 |
| `/api/plugins` | 插件列表 |
| `/api/skills` | 技能列表 |
| `/api/extensions` | 扩展列表 |
| `/api/config` | 系统配置 |
| `/api/logs` | 日志数据 |
| `/api/usage-cost` | 用量统计 |
| `/api/connectors` | 数据源连接状态 |
| `/api/memory/files` | 记忆文件列表 |
| `/api/memory/vector-count` | 向量库数量 |
| `/api/memory/architecture` | 记忆库架构 |
| `/api/memory/vector-breakdown` | 向量库分类统计 |
| `/api/memory/workspace` | 工作区信息 |

### 2. 类型定义 (src/types/index.ts)

定义了项目中使用的所有 TypeScript 接口。

#### 主要接口

| 接口名 | 说明 |
|--------|------|
| `GatewayInfo` | 网关信息 |
| `AgentInfo` | Agent 信息 |
| `SessionSummary` | 会话摘要 |
| `CronJob` | 定时任务 |
| `PluginInfo` | 插件信息 |
| `MemoryFile` | 记忆文件 |
| `SystemStatus` | 系统状态 |

### 3. API 客户端 (src/lib/api.ts)

前端使用的 API 调用封装。

#### 主要函数

| 函数名 | 说明 |
|--------|------|
| `fetchJson<T>()` | 通用 JSON 请求方法 |
| `fetchSystemStatus()` | 获取系统状态（聚合多个接口） |

### 4. 页面组件

#### Dashboard (src/pages/Dashboard.tsx)

仪表盘页面，展示系统概览信息。

- 系统状态卡片
- 数据源连接状态
- Agent 概览
- Cron 任务概览
- 30 秒自动轮询

#### Agents (src/pages/Agents.tsx)

Agent 管理页面。

- 会话列表
- Token 使用统计
- Cron 任务关联
- 30 秒自动轮询

#### Capabilities (src/pages/Capabilities.tsx)

能力中心页面。

- 插件管理
- 技能管理
- 扩展管理
- 30 秒自动轮询

#### Tasks (src/pages/Tasks.tsx)

定时任务页面。

- 任务列表
- 执行历史
- 健康状态机（5 态徽章）
- 30 秒自动轮询

#### Usage (src/pages/Usage.tsx)

用量中心页面。

- Token 使用趋势
- 花费趋势
- 多维度拆分（Agent/模型/Provider/会话类型/Cron 任务）
- 30 秒自动轮询

#### Memory (src/pages/Memory.tsx)

记忆库页面。

- 架构信息
- 向量库统计
- 文件列表
- 经验数据
- 30 秒自动轮询

#### Config (src/pages/Config.tsx)

系统配置页面（只读）。

- 配置树展示
- 敏感字段脱敏
- 环境变量引用解析
- 30 秒自动轮询

#### Logs (src/pages/Logs.tsx)

日志中心页面。

- 网关日志
- 命令日志
- 错误日志
- 重启日志
- 稳定性事件
- 配置审计
- 多行合并、重复警告去重聚合
- 30 秒自动轮询

### 5. 布局组件

#### Layout (src/components/layout/Layout.tsx)

主布局组件，包含：

- TopBar：顶部栏，包含通知铃铛
- Sidebar：侧边栏导航
- BottomNav：底部导航栏（移动端）
- 内容区域

#### NotificationBell (src/components/NotificationBell.tsx)

通知铃铛组件，聚合 4 类通知：

- Cron 失败
- Cron 禁用
- 稳定性事件
- 配置审计

60 秒轮询 + 点击跳转

### 6. 主题系统 (src/theme/index.tsx)

提供主题上下文和样式系统。

## 数据来源

所有数据通过直接读取文件系统获取（不调用 OpenClaw CLI）：

| 数据 | 来源 |
|------|------|
| 会话/Agent | `<OC_HOME>/agents/main/sessions/sessions.json` |
| 定时任务 | `<OC_HOME>/state/openclaw.sqlite` 的 `cron_jobs` 表 |
| 任务执行记录 | `<OC_HOME>/state/openclaw.sqlite` 的 `cron_run_logs` 表 |
| 用量数据 | `<OC_HOME>/agents/*/sessions/*.jsonl` 的 `message.usage` 字段 |
| 插件 | 读取 `openclaw.json` 配置 + 扫描 `<OC_HOME>/plugins/` 元数据 + 扫描 `agents/main/agent/plugins/` |
| 技能 | 扫描 `<OC_HOME>/skills/` + `workspace/skills/` |
| 扩展 | 扫描 `<OC_HOME>/extensions/` |
| 记忆库 | `<workspace>/memory/` + ChromaDB SQLite |
| 系统配置 | `<OC_HOME>/openclaw.json` |
| 网关日志 | `<SYS_LOGS_DIR>/gateway.log`（按平台，见上表）|
| 命令日志 | `<OC_HOME>/logs/commands.log` |
| 错误日志 | 合并旧位置 `<OC_HOME>/logs/gateway.err.log` + 新位置 `gateway.log` 中的 warn/error 行 |
| 重启日志 | 合并旧位置 `<OC_HOME>/logs/gateway-restart.log` + 新位置 `gateway.log` 中的重启事件 |
| 配置审计 | `<OC_HOME>/logs/config-audit.jsonl` |
| 稳定性事件 | `<OC_HOME>/logs/stability/*.json` |

> `<OC_HOME>` = `OPENCLAW_HOME` 或 `~/.openclaw`
> `<SYS_LOGS_DIR>` = `OPENCLAW_SYS_LOGS_DIR` 或平台默认路径
> `<workspace>` = 从 `openclaw.json` 动态读取

## 依赖关系

### 生产依赖

| 依赖包 | 版本 | 说明 |
|--------|------|------|
| clsx | ^2.1.1 | 类名合并工具 |
| lucide-react | ^0.511.0 | 图标库 |
| react | ^18.3.1 | React 核心库 |
| react-dom | ^18.3.1 | React DOM 渲染 |
| react-router-dom | ^7.18.0 | React 路由 |
| tailwind-merge | ^3.0.2 | Tailwind 类名合并 |

### 开发依赖

| 依赖包 | 版本 | 说明 |
|--------|------|------|
| @eslint/js | ^9.25.0 | ESLint 核心 |
| @types/node | ^22.15.30 | Node.js 类型定义 |
| @types/react | ^18.3.12 | React 类型定义 |
| @types/react-dom | ^18.3.1 | React DOM 类型定义 |
| @vitejs/plugin-react | ^4.4.1 | Vite React 插件 |
| autoprefixer | ^10.4.21 | CSS 前缀自动补全 |
| eslint | ^9.25.0 | ESLint 代码检查 |
| eslint-plugin-react-hooks | ^5.2.0 | React Hooks 规则 |
| eslint-plugin-react-refresh | ^0.4.19 | React 热更新规则 |
| globals | ^16.0.0 | 全局变量定义 |
| postcss | ^8.5.3 | CSS 处理工具 |
| tailwindcss | ^3.4.17 | Tailwind CSS 框架 |
| typescript | ~5.8.3 | TypeScript 编译器 |
| typescript-eslint | ^8.30.1 | TypeScript ESLint 集成 |
| vite | ^6.3.5 | Vite 构建工具 |
| vite-plugin-trae-solo-badge | ^1.0.0 | Trae 徽章插件 |
| vite-tsconfig-paths | ^5.1.4 | TypeScript 路径别名 |

## 项目运行方式

### 前置要求

- **Node.js ≥ 20**（推荐 22 LTS）
- **npm ≥ 10**（或 pnpm/yarn）
- **OpenClaw** 已安装并运行过至少一次（生成 `~/.openclaw/` 目录）
- **sqlite3** CLI（用于读取定时任务和向量数据库）

### 快速开始

```bash
# 1. 克隆项目
git clone <repo-url> openclaw-admin
cd openclaw-admin

# 2. 安装依赖
npm install

# 3. 配置环境变量（可选，默认读取 ~/.openclaw）
cp .env.example .env
# 按需编辑 .env

# 4. 启动开发服务器
npm run dev
```

浏览器打开 http://localhost:5173 即可。

如需远程访问（从其他机器访问本机 UI）：

```bash
npm run dev -- --host 0.0.0.0
# 然后通过 http://<本机IP>:5173 访问
```

### 环境变量配置

所有配置通过环境变量管理，复制 `.env.example` 为 `.env` 并按需修改。

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `OPENCLAW_HOME` | OpenClaw 主目录路径 | `~/.openclaw` |
| `OPENCLAW_SYS_LOGS_DIR` | 网关运行日志目录 | 按平台回退（见下表） |

#### 系统日志目录回退规则

`OPENCLAW_SYS_LOGS_DIR` 未设置时，按平台自动回退：

| 平台 | 默认路径 | 说明 |
|------|---------|------|
| macOS | `~/Library/Logs/openclaw` | launchd 重定向目标 |
| Linux | `${XDG_STATE_HOME:-~/.local/state}/openclaw/logs` | 遵循 XDG 规范 |
| Windows | `%LOCALAPPDATA%\openclaw\logs` | 标准应用数据目录 |

### 常用命令

```bash
npm run dev       # 启动开发服务器
npm run build     # 生产构建（输出到 dist/）
npm run check     # TypeScript 类型检查
npm run lint      # ESLint
```

### 多平台部署

#### macOS（推荐，开箱即用）

```bash
git clone <repo-url> openclaw-admin && cd openclaw-admin
npm install
npm run dev
```

无需额外配置，所有路径自动适配。

#### Linux

```bash
# 1. 安装 sqlite3
sudo apt install sqlite3  # Debian/Ubuntu
# sudo dnf install sqlite  # RHEL/CentOS

# 2. 克隆并安装
git clone <repo-url> openclaw-admin && cd openclaw-admin
npm install

# 3. 配置（如需）
cp .env.example .env
# 编辑 .env，设置 OPENCLAW_HOME 和 OPENCLAW_SYS_LOGS_DIR

# 4. 启动
npm run dev
```

#### Windows

```powershell
# 1. 安装 sqlite3（任选其一）
scoop install sqlite
# 或 choco install sqlite

# 2. 克隆并安装
git clone <repo-url> openclaw-admin
cd openclaw-admin
npm install

# 3. 配置（如需）
copy .env.example .env
# 编辑 .env，设置 OPENCLAW_HOME 和 OPENCLAW_SYS_LOGS_DIR

# 4. 启动
npm run dev
```

## 核心特性

### 数据源连接状态

仪表盘顶部展示 11 个数据源的健康度（connected/partial/not_connected），未连接的给出修复建议。

### Cron 健康状态机

定时任务页用 5 态徽章标识每个任务的健康度：

- scheduled：已排期
- due：到期
- late：迟到
- unknown：未知
- disabled：已禁用

late 优先排序。

### 用量分析

用量中心扫描 session 日志的 `message.usage` 字段，按今日/昨日/近3日/近7日/近30日展示 token 与花费趋势，支持按 Agent / 模型 / Provider / 会话类型 / Cron 任务多维度拆分。

### 日志中心

7 类日志全部结构化展示，支持多行合并、重复警告去重聚合、新旧日志源合并、展开查看原始内容。

### 通知中心

顶栏铃铛聚合 4 类通知：

- Cron 失败
- Cron 禁用
- 稳定性事件
- 配置审计

60 秒轮询 + 点击跳转。

## 限制

1. **仅支持本地 dev 预览** — `vite build` 产出的静态文件无后端 API，直接部署会 404。生产部署需将 `vite-plugin-openclaw-api.ts` 的逻辑移植到独立 Node/Express 后端
2. **只读** — 所有页面均为只读展示，不支持修改配置
3. **依赖 OpenClaw 已运行** — 需要已生成 `~/.openclaw/` 目录结构和数据文件
4. **网关日志依赖平台路径** — macOS 自动适配；Linux/Windows 需确认 `OPENCLAW_SYS_LOGS_DIR` 配置正确，否则 6.24 后的新日志无法读取（旧位置日志仍可正常显示）

## 开发指南

### 添加新页面

1. 在 `src/pages/` 目录创建新页面组件
2. 在 `src/App.tsx` 中添加路由
3. 在 `src/config/navigation.ts` 中添加导航项
4. 在 `vite-plugin-openclaw-api.ts` 中添加对应的 API 端点（如需要）

### 添加新 API

在 `vite-plugin-openclaw-api.ts` 的 `configureServer` 函数中添加新的路由处理：

```typescript
if (path === '/new-endpoint') {
  data = await readNewData();
}
```

### 样式系统

使用 Tailwind CSS + 自定义设计系统：

- `cl-card`: 卡片组件
- `cl-badge`: 徽章组件
- `cl-btn`: 按钮组件

### 数据刷新机制

所有页面使用 30 秒自动轮询机制，通过 `setInterval` 实现。

## 故障排查

### 数据不显示

1. 检查 OpenClaw 是否已运行并生成 `~/.openclaw/` 目录
2. 检查环境变量 `OPENCLAW_HOME` 是否正确
3. 检查 sqlite3 是否安装

### 日志无法读取

1. 检查 `OPENCLAW_SYS_LOGS_DIR` 配置
2. 确认日志文件存在且有读取权限

### API 错误

1. 检查 Vite 开发服务器是否正常运行
2. 查看浏览器控制台错误信息
3. 检查 Node.js 版本是否符合要求
