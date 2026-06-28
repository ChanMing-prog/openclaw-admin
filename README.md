# OpenClaw Admin

OpenClaw 管理后台 — 一个基于 React + Vite 的本地 Web UI，用于查看 OpenClaw 的运行状态、会话、记忆库、能力中心（插件/技能/扩展）、定时任务、用量分析、系统配置和日志。

> ⚠️ 本项目为 **dev 模式本地预览** 设计，API 中间层是 Vite 插件，仅在 `npm run dev` 时生效。生产部署需要额外搭建后端服务。

## 前置要求

- **Node.js ≥ 20**（推荐 22 LTS）
- **npm ≥ 10**（或 pnpm/yarn）
- **OpenClaw** 已安装并运行过至少一次（生成 `~/.openclaw/` 目录）
- **sqlite3** CLI（用于读取定时任务和向量数据库）

### sqlite3 安装

| 平台 | 命令 |
|------|------|
| macOS | 自带，无需安装 |
| Linux (Debian/Ubuntu) | `sudo apt install sqlite3` |
| Linux (RHEL/CentOS) | `sudo dnf install sqlite` |
| Windows (Scoop) | `scoop install sqlite` |
| Windows (Chocolatey) | `choco install sqlite` |
| Windows (手动) | 从 [sqlite.org](https://www.sqlite.org/download.html) 下载并加入 PATH |

## 快速开始

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

## 配置

所有配置通过环境变量管理，复制 `.env.example` 为 `.env` 并按需修改。

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `OPENCLAW_HOME` | OpenClaw 主目录路径 | `~/.openclaw` |
| `OPENCLAW_SYS_LOGS_DIR` | 网关运行日志目录 | 按平台回退（见下表） |

### 系统日志目录回退规则

`OPENCLAW_SYS_LOGS_DIR` 未设置时，按平台自动回退：

| 平台 | 默认路径 | 说明 |
|------|---------|------|
| macOS | `~/Library/Logs/openclaw` | launchd 重定向目标 |
| Linux | `${XDG_STATE_HOME:-~/.local/state}/openclaw/logs` | 遵循 XDG 规范 |
| Windows | `%LOCALAPPDATA%\openclaw\logs` | 标准应用数据目录 |

如果你的 OpenClaw 网关日志重定向到了自定义位置（如 systemd journald、Docker volume），请显式设置 `OPENCLAW_SYS_LOGS_DIR`。

### 配置示例

```bash
# macOS（通常无需配置，开箱即用）
OPENCLAW_HOME=/Users/yourname/.openclaw

# Linux（如使用自定义日志路径）
OPENCLAW_HOME=/home/yourname/.openclaw
OPENCLAW_SYS_LOGS_DIR=/var/log/openclaw

# Windows（PowerShell）
OPENCLAW_HOME=C:\Users\yourname\.openclaw
OPENCLAW_SYS_LOGS_DIR=C:\ProgramData\openclaw\logs
```

### workspace 路径

自动从 `openclaw.json` 的 `agents.defaults.workspace` 读取。如果 OpenClaw 把 workspace 配到了其他位置（如外接磁盘），无需额外配置，代码会动态读取。

### 环境变量引用解析

OpenClaw 的 `openclaw.json` 中可用 `$VAR` / `${VAR}` 引用 `~/.openclaw/.env` 中的变量。本工具会自动解析并显示真实值（配置页点击眼睛图标可切换显示/脱敏）。

## 多平台部署

### macOS（推荐，开箱即用）

```bash
git clone <repo-url> openclaw-admin && cd openclaw-admin
npm install
npm run dev
```

无需额外配置，所有路径自动适配。

### Linux

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

**systemd 日志重定向**：如你的 OpenClaw 用 systemd 管理且日志输出到 journald，需设置：

```bash
# .env
OPENCLAW_SYS_LOGS_DIR=/var/log/openclaw
```

并在 OpenClaw 的 systemd service 中配置 `StandardOutput=append:/var/log/openclaw/gateway.log`。

### Windows

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

**路径注意**：Windows 下 `.env` 文件中的路径用正斜杠 `/` 或双反斜杠 `\\`：

```bash
# 推荐
OPENCLAW_HOME=C:/Users/yourname/.openclaw
# 或
OPENCLAW_HOME=C:\\Users\\yourname\\.openclaw
```

### Docker 部署（社区方案）

本工具未提供官方 Docker 镜像，但可自行构建。需将 OpenClaw 的数据目录挂载进容器：

```bash
docker run -it --rm \
  -p 5173:5173 \
  -v ~/.openclaw:/root/.openclaw:ro \
  -e OPENCLAW_HOME=/root/.openclaw \
  node:22 bash -c "git clone <repo-url> /app && cd /app && npm install && npm run dev -- --host 0.0.0.0"
```

注意：容器内需安装 `sqlite3`，且无法读取宿主机的 systemd/launchd 日志（需额外挂载日志目录）。

## 数据来源

所有数据通过直接读取文件系统获取（不调用 OpenClaw CLI），包括：

| 数据 | 来源 |
|---|---|
| 会话/Agent | `<OC_HOME>/agents/main/sessions/sessions.json` |
| 定时任务 | `<OC_HOME>/state/openclaw.sqlite` 的 `cron_jobs` 表 |
| 任务执行记录 | `<OC_HOME>/state/openclaw.sqlite` 的 `cron_run_logs` 表 |
| 用量数据 | `<OC_HOME>/agents/*/sessions/*.jsonl` 的 `message.usage` 字段 |
| 插件 | 硬编码已知启用列表 + 扫描 `agents/main/agent/plugins/` |
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

## 页面说明

| 路径 | 页面 | 刷新机制 |
|---|---|---|
| `/` | 仪表盘（状态卡片 + 数据源连接状态 + Agent/Cron 概览） | 30 秒自动轮询 |
| `/agents` | Agent 管理（会话、Token、Cron） | 30 秒自动轮询 |
| `/capabilities` | 能力中心（插件/技能/扩展） | 30 秒自动轮询 |
| `/cron` | 定时任务（任务列表 + 执行历史 + 健康状态机） | 30 秒自动轮询 |
| `/usage` | 用量中心（Token/花费趋势 + 多维度拆分） | 30 秒自动轮询 |
| `/memory` | 记忆库（架构、向量、文件、经验） | 30 秒自动轮询 |
| `/config` | 系统配置（只读，敏感字段脱敏） | 30 秒自动轮询 |
| `/logs` | 日志中心（网关/命令/错误/重启/稳定性/审计） | 30 秒自动轮询 |

### 核心特性

- **数据源连接状态**：仪表盘顶部展示 11 个数据源的健康度（connected/partial/not_connected），未连接的给出修复建议
- **Cron 健康状态机**：定时任务页用 5 态徽章标识每个任务的健康度（scheduled 已排期 / due 到期 / late 迟到 / unknown 未知 / disabled 已禁用），late 优先排序
- **用量分析**：用量中心扫描 session 日志的 `message.usage` 字段，按今日/昨日/近3日/近7日/近30日展示 token 与花费趋势，支持按 Agent / 模型 / Provider / 会话类型 / Cron 任务多维度拆分
- **日志中心**：7 类日志全部结构化展示，支持多行合并、重复警告去重聚合、新旧日志源合并、展开查看原始内容
- **通知中心**：顶栏铃铛聚合 Cron 失败、Cron 禁用、稳定性事件、配置审计 4 类通知，60 秒轮询 + 点击跳转

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

1. **仅支持本地 dev 预览** — `vite build` 产出的静态文件无后端 API，直接部署会 404。生产部署需将 `vite-plugin-openclaw-api.ts` 的逻辑移植到独立 Node/Express 后端
2. **只读** — 所有页面均为只读展示，不支持修改配置
3. **依赖 OpenClaw 已运行** — 需要已生成 `~/.openclaw/` 目录结构和数据文件
4. **网关日志依赖平台路径** — macOS 自动适配；Linux/Windows 需确认 `OPENCLAW_SYS_LOGS_DIR` 配置正确，否则 6.24 后的新日志无法读取（旧位置日志仍可正常显示）
