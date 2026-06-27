# OpenClaw Admin

OpenClaw 管理后台 — 一个基于 React + Vite 的本地 Web UI，用于查看 OpenClaw 的运行状态、会话、记忆库、能力中心（插件/技能/扩展）、定时任务、系统配置和日志。

> ⚠️ 本项目为 **dev 模式本地预览** 设计，API 中间层是 Vite 插件，仅在 `npm run dev` 时生效。生产部署需要额外搭建后端服务。

## 前置要求

- **Node.js ≥ 20**（推荐 22 LTS）
- **npm ≥ 10**（或 pnpm/yarn）
- **OpenClaw** 已安装并运行过至少一次（生成 `~/.openclaw/` 目录）
- **sqlite3** CLI（macOS 自带；Linux 需 `apt install sqlite3`）

## 快速开始

```bash
# 1. 克隆项目
git clone <repo-url> openclaw-admin
cd openclaw-admin

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev
```

浏览器打开 http://localhost:5173 即可。

## 配置 OpenClaw 路径

**主目录**：默认读取 `~/.openclaw/`。如果你的 OpenClaw 装在别处：

```bash
cp .env.example .env
# 编辑 .env，设置：
# OPENCLAW_HOME=/your/path/to/openclaw
```

或在启动时直接指定：

```bash
OPENCLAW_HOME=/your/path npm run dev
```

**workspace 路径**：自动从 `openclaw.json` 的 `agents.defaults.workspace` 读取。如果别人把 workspace 配到了其他位置（如外接磁盘），无需额外配置，代码会动态读取。

**日志路径**：
- OpenClaw 内部日志：`<OPENCLAW_HOME>/logs/`（固定）
- 网关运行日志：`~/Library/Logs/openclaw/`（macOS launchd 重定向，固定）

如果别人的 macOS 用户目录非默认，`HOME` 环境变量会自动适配。

## 数据来源

所有数据通过直接读取文件系统获取（不调用 OpenClaw CLI），包括：

| 数据 | 来源 |
|---|---|
| 会话/Agent | `~/.openclaw/agents/main/sessions/sessions.json` |
| 定时任务 | `~/.openclaw/state/openclaw.sqlite` 的 `cron_jobs` 表 |
| 任务执行记录 | `~/.openclaw/state/openclaw.sqlite` 的 `cron_run_logs` 表 |
| 插件 | 硬编码已知启用列表 + 扫描 `agents/main/agent/plugins/` |
| 技能 | 扫描 `~/.openclaw/skills/` + `workspace/skills/` |
| 扩展 | 扫描 `~/.openclaw/extensions/` |
| 记忆库 | `~/.openclaw/workspace/memory/` + ChromaDB SQLite |
| 系统配置 | `~/.openclaw/openclaw.json` |
| 网关日志 | `~/Library/Logs/openclaw/gateway.log`（macOS）|
| 命令日志 | `~/.openclaw/logs/commands.log` |

## 页面说明

| 路径 | 页面 | 刷新机制 |
|---|---|---|
| `/` | 仪表盘 | 30 秒自动轮询 |
| `/agents` | Agent 管理（会话、Token、Cron） | 30 秒自动轮询 |
| `/capabilities` | 能力中心（插件/技能/扩展） | 30 秒自动轮询 |
| `/cron` | 定时任务（任务列表 + 执行历史） | 30 秒自动轮询 |
| `/memory` | 记忆库（架构、向量、文件、经验） | 30 秒自动轮询 |
| `/config` | 系统配置（只读，敏感字段脱敏） | 30 秒自动轮询 |
| `/logs` | 日志中心（网关/命令/错误/稳定性/审计） | 30 秒自动轮询 |

## 常用命令

```bash
npm run dev       # 启动开发服务器
npm run build     # 生产构建（输出到 dist/）
npm run check     # TypeScript 类型检查
npm run lint      # ESLint
```

## 技术栈

- React 18 + TypeScript + Vite 6
- Tailwind CSS 3 + 自定义设计系统（cl-card / cl-badge / cl-btn）
- lucide-react 图标
- react-router-dom 7
- Vite 自定义插件作为 API 中间层（仅 dev 模式）

## 限制

1. **仅支持本地 dev 预览** — `vite build` 产出的静态文件无后端 API，直接部署会 404
2. **仅 macOS 完整支持** — 系统日志路径 `~/Library/Logs/` 是 macOS 特有的
3. **只读** — 所有页面均为只读展示，不支持修改配置
4. **依赖 OpenClaw 已运行** — 需要已生成 `~/.openclaw/` 目录结构和数据文件
