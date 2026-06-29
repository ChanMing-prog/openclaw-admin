# OpenClaw Admin 技术架构文档

> 版本：v1.0 | 更新日期：2026-06-29

## 1. 项目概述

OpenClaw Admin 是 OpenClaw AI Agent 平台的本地管理控制台（控制中台），以**只读**方式展示 Agent 运行状态、会话管理、能力中心（插件/技能/扩展）、定时任务、用量分析、系统配置和日志中心。

**定位**：本地 dev 模式 Web UI，不提供独立后端服务，API 层通过 Vite 插件直接读取本地文件系统。

---

## 2. 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端框架 | React | 18 |
| 类型系统 | TypeScript | 5.8 |
| 构建工具 | Vite | 6.3 |
| 路由 | React Router DOM | 7.18 |
| 样式方案 | Tailwind CSS + 自定义 CSS Token 系统 | 3.4 |
| 图标库 | Lucide React | - |
| 工具库 | clsx + tailwind-merge | - |
| 数据库访问 | sqlite3 CLI（外部进程调用） | 系统自带 |
| 状态管理 | React Context + useState（无第三方库） | - |

---

## 3. 系统架构

### 3.1 整体架构图

```
┌─────────────────────────────────────────────────────────┐
│                    浏览器 (localhost:5173)                 │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌──────────┐  │
│  │Dashboard │  │ Agents  │  │ Usage   │  │  Logs    │  │
│  │ Capabil. │  │ Memory  │  │ Config  │  │  Tasks   │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬──────┘  │
│       └──────────────┼──────────────┼────────────┘        │
│                 fetch('/api/*')                            │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────┐
│         Vite 开发服务器 (中间件层)                         │
│  ┌──────────────────────┼──────────────────────────────┐ │
│  │ vite-plugin-openclaw-api.ts                          │ │
│  │  ├─ 16 个 API 端点                                    │ │
│  │  ├─ 3 层缓存 (config/env/usage)                      │ │
│  │  ├─ 平台适配 (macOS/Linux/Windows)                   │ │
│  │  └─ sqlite3 CLI 调用                                  │ │
│  └──────────────────────┬──────────────────────────────┘ │
└─────────────────────────┼───────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────┐
│              本地文件系统数据源                             │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌──────────────┐  │
│  │ JSONL  │  │SQLite  │  │ 日志   │  │  JSON/MD/ENV │  │
│  │会话记录│  │Cron/Mem│  │文件系统│  │  配置/记忆   │  │
│  └────────┘  └────────┘  └────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 3.2 关键设计决策

| 决策 | 理由 |
|------|------|
| Vite 插件作为 API 层 | 开发体验好，热更新无缝衔接，无需独立后端 |
| 直接读文件系统 | 避免依赖 OpenClaw CLI，可离线分析 |
| sqlite3 CLI 调用 | 避免原生模块编译问题，跨平台兼容 |
| 无前端状态管理库 | 数据均来自 API 轮询，无复杂交互状态 |
| 30 秒轮询刷新 | 平衡实时性和系统开销 |

---

## 4. 项目结构

```
openclaw-admin/
├── vite-plugin-openclaw-api.ts    # 核心后端：Vite 插件，16 个 API 端点
├── vite.config.ts                 # Vite 配置，加载 4 个插件
├── tailwind.config.js             # Tailwind 主题扩展
├── .env.example                   # 环境变量模板
├── src/
│   ├── main.tsx                   # 应用入口
│   ├── App.tsx                    # 根组件（ThemeProvider + Router）
│   ├── index.css                  # CSS Token 系统 + 组件类
│   ├── types/index.ts             # 全局 TypeScript 类型定义
│   ├── config/navigation.ts       # 导航配置
│   ├── theme/index.tsx            # 主题系统（light/dark/system）
│   ├── lib/
│   │   ├── api.ts                 # API 客户端封装
│   │   └── utils.ts               # 工具函数（cn()）
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Layout.tsx         # 页面布局骨架
│   │   │   ├── TopBar.tsx         # 顶部导航栏
│   │   │   ├── Sidebar.tsx        # 侧边栏（平板端）
│   │   │   └── BottomNav.tsx      # 底部导航（移动端）
│   │   └── NotificationBell.tsx   # 通知中心组件
│   └── pages/
│       ├── Dashboard.tsx          # 仪表盘
│       ├── Agents.tsx             # Agent 管理
│       ├── Capabilities.tsx       # 能力中心
│       ├── Tasks.tsx              # 定时任务
│       ├── Usage.tsx              # 用量中心
│       ├── Memory.tsx             # 记忆库
│       ├── Config.tsx             # 系统配置
│       └── Logs.tsx               # 日志中心
└── docs/
    ├── TECHNICAL_ARCHITECTURE.md  # 本文档
    └── PRODUCT_REQUIREMENTS.md    # 产品需求文档
```

---

## 5. API 层设计（vite-plugin-openclaw-api.ts）

### 5.1 端点清单

| 端点 | 方法 | 数据源 | 说明 |
|------|------|--------|------|
| `/api/status` | GET | 聚合多源 | 系统状态总览（Gateway/Agent/Capabilities/Task 概览） |
| `/api/sessions` | GET | `sessions/sessions.json` + `*.jsonl` | Agent 会话列表及详情 |
| `/api/cron` | GET | `openclaw.sqlite` cron_jobs 表 | 定时任务列表 |
| `/api/cron/runs` | GET | `openclaw.sqlite` cron_run_logs 表 | 任务执行记录（最近 200 条） |
| `/api/plugins` | GET | `openclaw.json` plugins 配置 + 目录扫描 | 插件列表（跳过空目录） |
| `/api/config` | GET | `openclaw.json` 深度解析 + `$VAR` 引用解析 | 完整配置（敏感字段前端脱敏） |
| `/api/logs` | GET | 6 个日志源合并 | 日志全景（7 种类型） |
| `/api/skills` | GET | 3 个来源目录扫描 + 去重 | 技能列表 |
| `/api/extensions` | GET | `extensions/` 目录扫描 | 扩展列表 |
| `/api/usage-cost` | GET | `*.jsonl` + `*.trajectory.jsonl` 扫描 | 用量成本分析 |
| `/api/connectors` | GET | 多数据源健康检查 | 11 个数据源连接状态 |
| `/api/memory/files` | GET | `workspace/memory/*.md` | 记忆文件列表 |
| `/api/memory/vector-count` | GET | ChromaDB sqlite3 查询 | 向量记录总数 |
| `/api/memory/architecture` | GET | `workspace/memory/` 递归扫描 | 记忆目录架构 |
| `/api/memory/vector-breakdown` | GET | ChromaDB embedding_metadata 查询 | 向量分类分布 |
| `/api/memory/workspace` | GET | workspace 核心文件读取 | MEMORY.md/SOUL.md 等 |

### 5.2 数据源体系

**文件系统路径常量**：

| 常量 | 路径 | 说明 |
|------|------|------|
| `OC_HOME` | `OPENCLAW_HOME` 或 `~/.openclaw` | 主目录（环境变量可覆盖） |
| `AGENTS_DIR` | `<OC_HOME>/agents` | Agent 数据目录 |
| `CHROMA_DB` | `<OC_HOME>/memory/chroma_db/chroma.sqlite3` | 向量数据库 |
| `SKILLS_DIR` | `<OC_HOME>/skills` | 技能目录 |
| `EXT_DIR` | `<OC_HOME>/extensions` | 扩展目录 |
| `OC_STATE_DB` | `<OC_HOME>/state/openclaw.sqlite` | 状态数据库（Cron/任务） |
| `LOGS_DIR` | `<OC_HOME>/logs` | 内部日志目录 |
| `SYS_LOGS_DIR` | 平台相关（见下） | 系统日志目录 |

**系统日志目录平台适配**（`resolveSysLogsDir()`）：

| 平台 | 路径 | 说明 |
|------|------|------|
| macOS | `~/Library/Logs/openclaw` | launchd 重定向目标 |
| Linux | `${XDG_STATE_HOME:-~/.local/state}/openclaw/logs` | 遵循 XDG 规范 |
| Windows | `%LOCALAPPDATA%\openclaw\logs` | 标准应用数据目录 |
| 自定义 | `OPENCLAW_SYS_LOGS_DIR` 环境变量 | 覆盖所有平台默认值 |

**用户主目录兼容**：
```typescript
const HOME = process.env.HOME ?? process.env.USERPROFILE ?? '~';
```

### 5.3 缓存策略

| 缓存项 | TTL | 机制 |
|--------|-----|------|
| `cachedConfig`（openclaw.json） | 永久（进程生命周期） | 内存变量，首次读取后不再刷新 |
| `cachedEnvFile`（.env 文件） | 5 秒 | `ENV_FILE_CACHE_TTL_MS = 5_000` |
| `usageCache`（用量成本数据） | 10 秒 | 预热 + 后台定时刷新 |

**用量缓存预热机制**：
```typescript
configureServer(server) {
  readUsageCost().catch(() => {});  // 异步预热，不阻塞启动
  setInterval(() => { readUsageCost().catch(() => {}); }, USAGE_CACHE_TTL_MS);
  // ...
}
```

### 5.4 sqlite3 调用方式

通过 `execFile('sqlite3', [dbPath, '-json', sql])` 调用系统 sqlite3 CLI，返回 JSON 结果。避免了原生模块编译问题，但要求系统安装 sqlite3。

---

## 6. 前端架构

### 6.1 路由系统

```
/              → Dashboard     仪表盘（系统概览 + 数据源状态）
/agents        → Agents        Agent 管理（会话列表 + 详情）
/capabilities  → Capabilities  能力中心（插件/技能/扩展）
/cron          → Tasks         定时任务（任务列表 + 执行历史 + 健康状态机）
/usage         → Usage         用量中心（Token/费用趋势 + 多维拆分）
/memory        → Memory        记忆库（向量/文件/架构/经验）
/config        → Config        系统配置（只读 JSON 树 + 脱敏）
/logs          → Logs          日志中心（7 类日志 Tab）
```

所有路由嵌套在 `<Layout>` 内，由 `<ThemeProvider>` 提供主题上下文。

### 6.2 状态管理

**无第三方状态管理库**，采用：

1. **React Context**（1 个）：`ThemeContext` — 管理 light/dark/system 三态主题
2. **组件内 useState**：每个页面独立管理 `loading`、`error`、数据状态
3. **localStorage**（2 处）：
   - `theme-mode`：主题偏好
   - `oc-notif-read`：通知已读状态

### 6.3 数据获取模式

所有页面统一模式：

```
loadData() {
  setLoading(true)
  并行调用 fetchJson / fetchSystemStatus
  try/catch -> setError
  finally -> setLoading(false)
}

useEffect(() => {
  loadData()
  const timer = setInterval(loadData, 30_000)  // 30 秒轮询
  return () => clearInterval(timer)
}, [])
```

**轮询间隔**：所有页面 30 秒，通知中心 60 秒。

**错误处理**：统一 try/catch，非关键 API 使用 `.catch(() => defaultValue)` 降级。

### 6.4 设计系统

**CSS Token 体系**（`--cl-*` 前缀）：

| 类别 | Token 示例 | 说明 |
|------|-----------|------|
| Brand | `--cl-brand` (#d97757) | 品牌色（暖橙色） |
| Background | `--cl-bg-primary/secondary/tertiary/elevated/sunken` | 5 级背景 |
| Surface | `--cl-surface/secondary/hover/active` | 卡片表面色 |
| Text | `--cl-text-primary/secondary/tertiary/muted/faint/inverse` | 6 级文字色 |
| Border | `--cl-border-primary/secondary/faint` | 3 级边框 |
| Status | `--cl-status-success/warning/error/info` | 状态色 |
| Radius | `--cl-radius-sm/md/lg/xl/2xl/full` | 圆角梯度 |
| Shadow | `--cl-shadow-xs/sm/md/lg/xl` | 阴影梯度 |

**自定义 CSS 组件类**：
- `.cl-card`：卡片（hover 阴影/边框变化）
- `.cl-btn` + 6 种变体：primary/secondary/ghost/outline/soft/default
- `.cl-nav-item`：导航项（active 高亮）
- `.cl-switch`：开关
- `.cl-chip`：筛选标签
- `.cl-progress` + shimmer：进度条
- `.cl-badge` + 5 种颜色：success/warning/error/info/brand
- `.skeleton`：骨架屏加载

**暗色模式**：`.dark` 类名切换 CSS Token 值，ThemeProvider 在 `<html>` 上管理类名。

**排版阶梯**：display-lg/md/sm → headline → title → body → label，均使用 Inter 字体。

**动画系统**：5 个预定义动画 + 交错入场（`.stagger-children`）。

---

## 7. 核心业务逻辑

### 7.1 用量成本计算

**数据采集**（`scanUsageEvents()`）：

1. 遍历 `agents/*/sessions/` 下的 `.jsonl` 和 `.trajectory.jsonl` 文件
2. 62 天回溯窗口，按文件修改时间过滤
3. 8 个 worker 并发扫描
4. 解析两种格式：
   - `.jsonl`：`type=message` + `role=assistant` + `message.usage`
   - `.trajectory.jsonl`：`type=trace.artifacts` + `data.usage`
5. 按 `时间戳秒级 + 模型 + token 数` 去重，优先保留有 cost 的记录

**模型定价表**（人民币 ¥/百万 tokens）：

| 模型 | 缓存输入 | 未缓存输入 | 输出 |
|------|---------|-----------|------|
| mimo-v2.5 | 0.02 | 1.00 | 2.00 |
| mimo-v2.5-pro | 0.025 | 3.00 | 6.00 |
| MiniMax-M3 | 0.42 | 2.10 | 8.40 |

**Provider 标准化**（`normalizeProvider()`）：
- `xiaomi-token-plan` / `mimo` → `Xiaomi`
- `minimax` / `minimax-portal` → `MiniMax`
- `sensenova` → `SenseNova`
- `gpt` / `o1` / `o3` → `OpenAI`
- `claude` → `Anthropic`
- `gemini` → `Google`
- `deepseek` → `DeepSeek`

**统计维度**（5 个 breakdown）：按 Agent、模型、Provider、会话类型（Cron/Discord/Telegram/Main）、Cron 任务。

### 7.2 Cron 健康状态机

```
状态: disabled → unknown → scheduled → due → late

计算逻辑:
  !enabled        → disabled
  !nextRunAtMs    → unknown
  lag > 0         → scheduled（未来还有时间）
  lag >= -5min    → due（已到期）
  lag < -5min     → late（超时未执行）

排序: late(0) > due(1) > unknown(2) > scheduled(3) > disabled(4)
```

### 7.3 日志解析

**网关日志**（`parseGatewayLine()`）支持 4 种格式：
1. `ISO时间 [组件] 消息 key=value`（标准格式）
2. `[组件] 消息`（无时间戳）
3. `⚠️ ...`（聚合条目）
4. 纯文本

**错误日志去重**（`readErrorLogTail()`）：
1. 多行合并：以时间戳或 `[component]` 开头的行作为新条目
2. 同类警告聚合：匹配 "Skipping escaped skill path" / "Subagent orphan run pruned" 模式，动态部分替换后聚合

**重启日志**：支持旧格式 `[ISO] openclaw restart attempt/done` 和新格式 `ISO [gateway] received SIGTERM`，合并两个来源。

### 7.4 通知聚合

4 类通知源：Cron 失败、Cron 禁用、稳定性事件、配置变更。通过 localStorage 持久化已读状态，60 秒轮询刷新。

---

## 8. 组件架构

### 8.1 布局组件

| 组件 | 位置 | 说明 |
|------|------|------|
| `Layout` | 布局骨架 | TopBar + Sidebar + main + BottomNav |
| `TopBar` | 顶部 | Logo + 桌面导航 + 主题下拉 + 通知铃铛 |
| `Sidebar` | 左侧（平板） | 仅图标，md 断点显示 |
| `BottomNav` | 底部（移动端） | 8 项导航，md 以下显示 |

### 8.2 页面组件内联子组件

各页面内部定义了丰富的展示组件，不跨页面复用：

| 页面 | 内联组件 |
|------|---------|
| Dashboard | StatusCard |
| Agents | StatBadge, TokenBar |
| Capabilities | TabButton, PluginCard, SkillCard, ExtensionCard |
| Tasks | StatusBadge, JobCard(可展开), RunRow, HealthBadge |
| Usage | PeriodCard, BreakdownRow(带进度条) |
| Memory | SectionHeader, FileStatusCard, CategoryBar |
| Config | LeafValue(脱敏+眼睛切换), TreeView(递归JSON树) |
| Logs | LogLevelDot, GatewayLogRow, RestartRow, AuditRow, StabilityRow, CommandRow, FileRow |

---

## 9. 跨平台兼容性

### 9.1 平台支持矩阵

| 能力 | macOS | Linux | Windows |
|------|:-----:|:-----:|:-------:|
| 主目录读取 | ✅ | ✅ | ✅ |
| OPENCLAW_HOME 覆盖 | ✅ | ✅ | ✅ |
| 系统日志目录 | ✅ 自动 | ✅ 自动 | ✅ 自动 |
| sqlite3 CLI | ✅ 自带 | ✅ 需安装 | ⚠️ 需安装 |
| npm 依赖 | ✅ | ✅ | ✅ |

### 9.2 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `OPENCLAW_HOME` | OpenClaw 主目录 | `~/.openclaw` |
| `OPENCLAW_SYS_LOGS_DIR` | 系统日志目录 | 按平台回退 |

---

## 10. 性能优化

| 优化项 | 方案 |
|--------|------|
| 用量数据预热 | 服务器启动时异步扫描，每 10 秒后台刷新 |
| 用量数据去重 | `.jsonl` 和 `.trajectory.jsonl` 按秒级时间戳+模型+token 去重 |
| 用量并发扫描 | 8 个 worker 并行读取文件 |
| 错误日志去重 | 同类警告合并为聚合条目 |
| 配置缓存 | openclaw.json 进程生命周期内缓存 |
| 环境文件缓存 | .env 文件 5 秒 TTL |

---

## 11. 已知限制

1. **仅支持 dev 预览**：Vite 插件 API 仅在 `npm run dev` 下生效，`vite build` 产出无后端
2. **只读**：所有页面均为只读展示
3. **sqlite3 依赖**：Cron 任务和向量数据库查询需要系统安装 sqlite3 CLI
4. **用量精度**：与 Provider 后台的调用数有差异（子代理/工具重试等中间调用不在日志中）
5. **无认证**：本地使用，无用户认证机制
