import { useState, useEffect, useMemo } from 'react';
import {
  RefreshCw,
  Search,
  FileText,
  Terminal,
  AlertTriangle,
  RotateCw,
  ShieldCheck,
  HardDrive,
  Activity,
  ChevronDown,
  ChevronRight,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { fetchJson } from '@/lib/api';

// ─── types ───

interface LogFile {
  name: string;
  size: number;
  modified: string;
  lines: number;
  location: string;
}

interface CommandLog {
  timestamp: string;
  action: string;
  sessionKey: string;
  senderId: string;
  source: string;
}

interface AuditLog {
  timestamp: string;
  event: string;
  source: string;
  command: string;
  configPath: string;
  result: string;
  previousBytes: number | null;
  nextBytes: number | null;
  deltaBytes: number | null;
  hashChanged: boolean;
  detail: string;
}

interface StabilityEvent {
  timestamp: string;
  reason: string;
  errorMessage: string;
  errorName: string;
  pid: number;
  node: string;
  uptimeMs: number;
  detail: string;
}

interface LogStats {
  fileCount: number;
  totalSize: number;
  commandCount: number;
  errorCount: number;
  stabilityCount: number;
  latestCommand: string;
  latestGateway: string;
}

interface LogsData {
  files: LogFile[];
  stats: LogStats;
  commands: CommandLog[];
  gateway: string[];
  errors: string[];
  restarts: string[];
  audit: AuditLog[];
  stability: StabilityEvent[];
  health: Record<string, unknown> | null;
}

// ─── helpers ───

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatTime(iso: string): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

function relativeTime(iso: string): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso).getTime();
    const now = Date.now();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return `${diff}秒前`;
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
    return `${Math.floor(diff / 86400)}天前`;
  } catch {
    return iso;
  }
}

// 网关日志行解析：[2026-05-21T08:17:11.988+08:00] [component] message [key=value ...]
// 也支持错误日志的多种格式：[component] msg、纯文本、聚合条目
interface ParsedGateway {
  time: string;        // 原始 ISO 时间（可能为空）
  timeLocal: string;   // 本地化时间
  component: string;   // 原始组件名
  componentLabel: string;  // 本地化组件名
  componentColor: string;  // 组件 badge 颜色
  message: string;     // 消息主体（单行）
  fullContent: string; // 完整内容（含多行，用于展开显示）
  level: 'info' | 'warn' | 'error';
  kv: Array<{ k: string; v: string }>;  // 解析出的 key=value
  isMultiline: boolean; // 是否多行
  isAggregated: boolean; // 是否为后端聚合的条目
}
function parseGatewayLine(line: string): ParsedGateway | null {
  // 拆分首行和剩余内容
  const newlineIdx = line.indexOf('\n');
  const firstLine = newlineIdx >= 0 ? line.slice(0, newlineIdx) : line;
  const restLines = newlineIdx >= 0 ? line.slice(newlineIdx + 1) : '';
  const isMultiline = newlineIdx >= 0;

  // 模式 1：ISO时间 [组件] 消息 key=value
  const m1 = /^(\d{4}-\d{2}-\d{2}T\S+)\s+\[([^\]]+)\]\s+(.*)$/.exec(firstLine);
  // 模式 2：[组件] 消息（无时间戳，如 [tools] web_fetch failed: ...）
  const m2 = /^\[([a-zA-Z][a-zA-Z0-9_:]*)\]\s+(.*)$/.exec(firstLine);
  // 模式 3：聚合条目（⚠️ 开头）
  const m3 = /^(⚠️|🔍|❌)\s+(.*)$/.exec(firstLine);

  let time = '';
  let component = '';
  let rest = firstLine;
  let isAggregated = false;

  if (m1) {
    [, time, component, rest] = m1;
  } else if (m2) {
    [, component, rest] = m2;
  } else if (m3) {
    [, , rest] = m3;
    component = 'aggregated';
    isAggregated = true;
  } else {
    // 模式 4：纯文本（如 Config warnings:）
    component = '';
    rest = firstLine;
  }

  // 提取消息前缀和 key=value 对
  const kvRegex = /\s([a-zA-Z_][a-zA-Z0-9_]*)=([^\s]+)/g;
  const kv: Array<{ k: string; v: string }> = [];
  let kvMatch: RegExpExecArray | null;
  const kvEnds: Array<number> = [];
  while ((kvMatch = kvRegex.exec(rest)) !== null) {
    kv.push({ k: kvMatch[1], v: kvMatch[2] });
    kvEnds.push(kvMatch.index + kvMatch[0].length);
  }
  // 消息主体 = 最后一个 kv 之前的所有内容（去掉尾部空格）
  const message = kvEnds.length > 0
    ? rest.slice(0, kvEnds[0]).trim()
    : rest.trim();

  // 级别判断
  let level: 'info' | 'warn' | 'error' = 'info';
  if (isAggregated) level = 'warn';
  else if (/error|fail|fatal|crash|failed/i.test(rest)) level = 'error';
  else if (/warn|deprecat|skipping|escape/i.test(rest)) level = 'warn';
  else if (component === 'warn') level = 'warn';

  // 本地化时间：2026-06-28T16:24:20.818+08:00 → 06-28 16:24:20
  let timeLocal = '';
  if (time) {
    try {
      const d = new Date(time);
      if (!Number.isNaN(d.getTime())) {
        const pad = (n: number) => String(n).padStart(2, '0');
        timeLocal = `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      } else {
        timeLocal = time;
      }
    } catch {
      timeLocal = time;
    }
  }

  const cmeta = componentMeta(component);
  return {
    time,
    timeLocal,
    component,
    componentLabel: cmeta.label,
    componentColor: cmeta.color,
    message,
    fullContent: restLines,
    level,
    kv,
    isMultiline,
    isAggregated,
  };
}

// 网关日志组件本地化
function componentMeta(component: string): { label: string; color: string } {
  // 子组件：[DingTalk:__default__]
  if (component.startsWith('DingTalk')) return { label: '钉钉', color: 'cl-badge-info' };
  switch (component) {
    case 'feishu': return { label: '飞书', color: 'cl-badge-brand' };
    case 'plugins': return { label: '插件', color: 'cl-badge-success' };
    case 'gateway': return { label: '网关', color: 'cl-badge-brand' };
    case 'ws': return { label: 'WS', color: 'cl-badge-info' };
    case 'default':
    case '__default__': return { label: '默认', color: '' };
    case 'BotIdentity': return { label: '身份', color: 'cl-badge-warning' };
    case 'shutdown': return { label: '关闭', color: 'cl-badge-error' };
    case 'reload': return { label: '重载', color: 'cl-badge-warning' };
    case 'hooks': return { label: '钩子', color: '' };
    case 'heartbeat': return { label: '心跳', color: 'cl-badge-success' };
    case 'warn': return { label: '警告', color: 'cl-badge-warning' };
    case 'info': return { label: '信息', color: '' };
    case 'skills': return { label: '技能', color: 'cl-badge-warning' };
    case 'memory': return { label: '记忆', color: 'cl-badge-brand' };
    case 'tools': return { label: '工具', color: 'cl-badge-error' };
    case 'aggregated': return { label: '聚合', color: 'cl-badge-warning' };
    case '': return { label: '日志', color: '' };
    default: return { label: component, color: '' };
  }
}

// 消息摘要：对常见模式提取关键信息
function summarizeMessage(message: string, kv: Array<{ k: string; v: string }>): string {
  // active-memory: ... start / done
  if (/^active-memory:/.test(message)) {
    const isDone = /\bdone\b/.test(message);
    const status = kv.find((x) => x.k === 'status')?.v;
    const elapsed = kv.find((x) => x.k === 'elapsedMs')?.v;
    if (isDone) {
      return `活跃记忆完成${status ? `（${statusLabel(status)}）` : ''}${elapsed ? ` · ${elapsed}ms` : ''}`;
    }
    return '活跃记忆启动';
  }
  // memory-core: ...
  if (/^memory-core:/.test(message)) {
    return message.replace(/^memory-core:\s*/, '记忆核心：');
  }
  // memory sync failed (watch): Error: openai embeddings failed: 404 Not Found
  if (/^sync failed/.test(message)) {
    return '同步失败：' + message.replace(/^sync failed\s*\(?\w*\)?:\s*/i, '');
  }
  // openai embeddings failed: 404 Not Found
  if (/^openai embeddings failed/.test(message)) {
    return '嵌入服务失败：' + message.replace(/^openai embeddings failed:\s*/i, '');
  }
  // Skipping escaped skill path outside its configured root
  if (/^Skipping escaped skill path/.test(message)) {
    return '技能符号链接逃逸（跳过加载）';
  }
  // Subagent orphan run pruned source=restore run=... child=... reason=...
  if (/^Subagent orphan run pruned/.test(message)) {
    const reason = kv.find((x) => x.k === 'reason')?.v;
    return `孤儿子代理运行被清理${reason ? `（${reason}）` : ''}`;
  }
  // web_fetch failed: ...
  if (/^web_fetch failed/i.test(message)) {
    return '网页抓取失败：' + message.replace(/^web_fetch failed:?\s*/i, '');
  }
  // read failed: ENOENT: ...
  if (/^read failed/i.test(message)) {
    return '读取失败：' + message.replace(/^read failed:?\s*/i, '');
  }
  // config warnings:
  if (/^config warnings/i.test(message)) {
    return '配置警告';
  }
  // plugins.entries.active-memory: plugin disabled
  if (/^plugins\.entries\./.test(message)) {
    return '插件配置：' + message;
  }
  // feishu[xxx]: message ...
  if (/^feishu\[/.test(message)) {
    return message.replace(/^feishu\[[^\]]*\]:\s*/, '');
  }
  // ⇄ res ✓ agent.wait 38311ms
  if (/^[⇄→←]/.test(message)) {
    return message;
  }
  return message;
}

function statusLabel(s: string): string {
  switch (s) {
    case 'ok': return '成功';
    case 'timeout': return '超时';
    case 'timeout_partial': return '部分超时';
    case 'error': return '错误';
    case 'failed': return '失败';
    default: return s;
  }
}

// ─── 重启日志解析 ───
// 旧格式：[2026-05-21T06:34:24Z] openclaw restart attempt source=launchd-handoff mode=kickstart target=gui/501/ai.openclaw.gateway waitPid=64748
// 新格式：2026-06-28T11:03:50.260+08:00 [gateway] received SIGTERM; restarting
//        2026-06-28T11:03:50.290+08:00 [shutdown] started: gateway restarting
//        2026-06-28T11:03:50.292+08:00 [shutdown] waiting for 23 pending reply(ies) before restart shutdown (timeout 299999ms)
//        2026-06-24T09:01:46.396+08:00 [gateway] restart mode: full process restart (supervisor restart)
//        2026-06-28T11:03:29.872+08:00 [gateway-tool] gateway tool: restart requested (delayMs=default, reason=none)
interface ParsedRestart {
  time: string;
  timeLocal: string;
  phase: 'attempt' | 'done';
  source: string;
  mode: string;
  target: string;
  waitPid: string;
  message: string;  // 新格式的消息内容
  raw: string;
}
function parseRestartLine(line: string): ParsedRestart | null {
  // 旧格式：[ISO时间] openclaw restart attempt/done source=xxx ...
  const m1 = /^\[([^\]]+)\]\s+openclaw restart\s+(\S+)\s+(.*)$/.exec(line);
  if (m1) {
    const [, time, phase, rest] = m1;
    const kv: Record<string, string> = {};
    const kvRegex = /([a-zA-Z_]+)=(\S+)/g;
    let kvMatch: RegExpExecArray | null;
    while ((kvMatch = kvRegex.exec(rest)) !== null) {
      kv[kvMatch[1]] = kvMatch[2];
    }
    return {
      time,
      timeLocal: toLocalTime(time),
      phase: phase === 'done' ? 'done' : 'attempt',
      source: kv.source ?? '',
      mode: kv.mode ?? '',
      target: kv.target ?? '',
      waitPid: kv.waitPid ?? '',
      message: '',
      raw: line,
    };
  }

  // 新格式：ISO时间 [组件] 消息
  const m2 = /^(\d{4}-\d{2}-\d{2}T\S+)\s+\[[^\]]+\]\s+(.*)$/.exec(line);
  if (m2) {
    const [, time, msg] = m2;
    let phase: 'attempt' | 'done' = 'attempt';
    let source = '';
    let message = msg;

    if (/received SIGTERM;\s*restarting/i.test(msg)) {
      phase = 'attempt';
      source = 'sigterm';
      message = '收到 SIGTERM 信号，准备重启';
    } else if (/shutdown\] started:\s*gateway restarting/i.test(msg)) {
      phase = 'attempt';
      source = 'shutdown';
      message = '开始关闭网关以重启';
    } else if (/restart mode:/i.test(msg)) {
      phase = 'attempt';
      source = 'supervisor';
      const modeMatch = /restart mode:\s*(.+?)$/i.exec(msg);
      message = `重启模式：${modeMatch ? modeMatch[1] : '未知'}`;
    } else if (/gateway tool:\s*restart requested/i.test(msg)) {
      phase = 'attempt';
      source = 'tool';
      const delayMatch = /delayMs=(\S+)/i.exec(msg);
      const reasonMatch = /reason=(\S+)/i.exec(msg);
      message = `工具请求重启${delayMatch ? `（延迟 ${delayMatch[1]}）` : ''}${reasonMatch ? `（原因 ${reasonMatch[1]}）` : ''}`;
    } else if (/waiting for\s+(\d+)\s+pending/i.test(msg)) {
      phase = 'attempt';
      source = 'shutdown';
      const pendingMatch = /waiting for\s+(\d+)\s+pending/i.exec(msg);
      const timeoutMatch = /timeout\s+(\d+)ms/i.exec(msg);
      message = `等待 ${pendingMatch?.[1] ?? '?'} 个待处理回复${timeoutMatch ? `（超时 ${timeoutMatch[1]}ms）` : ''}`;
    }

    return {
      time,
      timeLocal: toLocalTime(time),
      phase,
      source,
      mode: '',
      target: '',
      waitPid: '',
      message,
      raw: line,
    };
  }

  return null;
}

function toLocalTime(time: string): string {
  try {
    const d = new Date(time);
    if (!Number.isNaN(d.getTime())) {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }
  } catch {}
  return time;
}

function restartSourceLabel(source: string): { label: string; color: string } {
  switch (source) {
    case 'update': return { label: '更新', color: 'cl-badge-brand' };
    case 'launchd-handoff': return { label: '交接', color: 'cl-badge-info' };
    case 'manual': return { label: '手动', color: 'cl-badge-warning' };
    case 'sigterm': return { label: '信号', color: 'cl-badge-warning' };
    case 'shutdown': return { label: '关闭', color: 'cl-badge-info' };
    case 'supervisor': return { label: '管理', color: 'cl-badge-brand' };
    case 'tool': return { label: '工具', color: 'cl-badge-success' };
    default: return { label: source || '未知', color: '' };
  }
}

// ─── 配置审计格式化 ───
function auditEventLabel(event: string): { label: string; color: string } {
  switch (event) {
    case 'config.write': return { label: '写入', color: 'cl-badge-brand' };
    case 'config.read': return { label: '读取', color: 'cl-badge-info' };
    case 'config.delete': return { label: '删除', color: 'cl-badge-error' };
    case 'config.rename': return { label: '重命名', color: 'cl-badge-warning' };
    default: return { label: event || '变更', color: '' };
  }
}

function formatBytesDelta(delta: number | null): string {
  if (delta == null) return '';
  if (delta === 0) return '0 B';
  const sign = delta > 0 ? '+' : '';
  const abs = Math.abs(delta);
  if (abs < 1024) return `${sign}${delta} B`;
  if (abs < 1024 * 1024) return `${sign}${(delta / 1024).toFixed(1)} KB`;
  return `${sign}${(delta / (1024 * 1024)).toFixed(2)} MB`;
}

// ─── 稳定性事件格式化 ───
function stabilityReasonLabel(reason: string): { label: string; color: string } {
  switch (reason) {
    case 'gateway.startup_failed': return { label: '启动失败', color: 'cl-badge-error' };
    case 'gateway.crash': return { label: '崩溃', color: 'cl-badge-error' };
    case 'gateway.oom': return { label: '内存溢出', color: 'cl-badge-error' };
    case 'gateway.unhandled_rejection': return { label: '未处理异常', color: 'cl-badge-error' };
    default: return { label: reason || '事件', color: 'cl-badge-error' };
  }
}

function formatUptime(ms: number): string {
  if (ms <= 0) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}秒`;
  return `${Math.round(ms / 60_000)}分钟`;
}

// 命令日志 source 本地化
function sourceLabel(source: string): { label: string; color: string } {
  switch (source) {
    case 'feishu':
      return { label: '飞书', color: 'cl-badge-brand' };
    case 'dingtalk-connector':
      return { label: '钉钉', color: 'cl-badge-info' };
    case 'webchat':
      return { label: 'Web', color: 'cl-badge-success' };
    case 'cron':
      return { label: '定时', color: 'cl-badge-warning' };
    default:
      return { label: source || '未知', color: '' };
  }
}

// 命令日志 action 本地化
const ACTION_ZH: Record<string, string> = {
  new: '新建会话',
  message: '消息',
  invoke: '调用',
  resume: '恢复',
  abort: '中止',
  end: '结束',
};

// 从 sessionKey 第三段提取会话类型
function sessionKindLabel(kind: string): { label: string; color: string } {
  switch (kind) {
    case 'direct':
      return { label: '对话', color: 'cl-badge-brand' };
    case 'cron':
      return { label: '定时', color: 'cl-badge-info' };
    case 'group':
      return { label: '群聊', color: 'cl-badge-warning' };
    case 'feishu':
      return { label: '飞书', color: 'cl-badge-brand' };
    case 'dingtalk-connector':
      return { label: '钉钉', color: 'cl-badge-info' };
    case 'webchat':
      return { label: 'Web', color: 'cl-badge-success' };
    default:
      return { label: kind || '未知', color: '' };
  }
}

// ─── components ───

function StatCard({ icon: Icon, label, value, sub, color = 'text-cl-text-primary' }: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="cl-card p-4 animate-slide-up">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className="text-cl-text-muted" />
        <p className="label-small text-cl-text-muted">{label}</p>
      </div>
      <p className={`headline-small ${color}`}>{value}</p>
      {sub && <p className="label-small text-cl-text-faint mt-1">{sub}</p>}
    </div>
  );
}

function TabButton({ active, onClick, icon: Icon, label, count }: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all duration-fast ease-cl-out ${
        active
          ? 'bg-brand/10 text-brand border border-brand/20'
          : 'text-cl-text-muted hover:text-cl-text-primary hover:bg-surface-hover border border-transparent'
      }`}
    >
      <Icon size={16} />
      <span className="label-large">{label}</span>
      {count !== undefined && count > 0 && (
        <span className={`label-small px-1.5 py-0.5 rounded-md ${
          active ? 'bg-brand/15 text-brand' : 'bg-bg-tertiary text-cl-text-muted'
        }`}>
          {count}
        </span>
      )}
    </button>
  );
}

function LogLevelDot({ level }: { level: 'info' | 'warn' | 'error' }) {
  const color = level === 'error' ? 'bg-status-error' : level === 'warn' ? 'bg-status-warning' : 'bg-status-success';
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${color}`} />;
}

function RestartRow({ line }: { line: string }) {
  const [expanded, setExpanded] = useState(false);
  const parsed = parseRestartLine(line);
  if (!parsed) {
    return (
      <div className="px-3 py-1.5 font-mono text-xs text-cl-text-muted hover:bg-surface-hover rounded-md">
        {line}
      </div>
    );
  }
  const sourceMeta = restartSourceLabel(parsed.source);
  const phaseColor = parsed.phase === 'done' ? 'bg-status-success' : 'bg-status-warning';
  const phaseLabel = parsed.phase === 'done' ? '完成' : '尝试';
  const hasDetail = Boolean(parsed.target || parsed.waitPid || parsed.mode);
  return (
    <div
      className="px-3 py-1.5 hover:bg-surface-hover rounded-md cursor-pointer"
      onClick={() => hasDetail && setExpanded(!expanded)}
      title={hasDetail ? (expanded ? '点击收起' : '点击展开') : undefined}
    >
      <div className="flex items-center gap-2">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${phaseColor} shrink-0`} />
        <span className="font-mono text-xs text-cl-text-faint w-24 shrink-0 tabular-nums">{parsed.timeLocal}</span>
        <span className={`cl-badge ${sourceMeta.color} shrink-0`}>{sourceMeta.label}</span>
        <span className="label-small text-cl-text-secondary shrink-0">{phaseLabel}</span>
        {parsed.mode && (
          <span className="label-small text-cl-text-faint shrink-0">· {parsed.mode}</span>
        )}
        <span className="label-small text-cl-text-secondary truncate flex-1">
          {parsed.message || parsed.target || parsed.waitPid || ''}
        </span>
        {hasDetail && (
          expanded
            ? <ChevronDown size={12} className="text-cl-text-faint shrink-0" />
            : <ChevronRight size={12} className="text-cl-text-faint shrink-0" />
        )}
      </div>
      {expanded && hasDetail && (
        <div className="mt-2 ml-7 pl-3 border-l-2 border-cl-border-faint space-y-1">
          <div className="flex gap-2">
            <span className="label-small text-cl-text-faint w-20 shrink-0">原始时间</span>
            <span className="label-small text-cl-text-secondary font-mono">{parsed.time}</span>
          </div>
          {parsed.target && (
            <div className="flex gap-2">
              <span className="label-small text-cl-text-faint w-20 shrink-0">目标</span>
              <span className="label-small text-cl-text-secondary font-mono break-all">{parsed.target}</span>
            </div>
          )}
          {parsed.waitPid && (
            <div className="flex gap-2">
              <span className="label-small text-cl-text-faint w-20 shrink-0">等待 PID</span>
              <span className="label-small text-cl-text-secondary font-mono">{parsed.waitPid}</span>
            </div>
          )}
          {parsed.message && (
            <div className="flex gap-2">
              <span className="label-small text-cl-text-faint w-20 shrink-0">原始记录</span>
              <span className="label-small text-cl-text-secondary font-mono break-all">{parsed.raw}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AuditRow({ a }: { a: AuditLog }) {
  const [expanded, setExpanded] = useState(false);
  const eventMeta = auditEventLabel(a.event);
  const deltaStr = formatBytesDelta(a.deltaBytes);
  const deltaColor = a.deltaBytes != null && a.deltaBytes > 0 ? 'text-status-warning' : a.deltaBytes != null && a.deltaBytes < 0 ? 'text-status-success' : 'text-cl-text-faint';
  return (
    <div className="cl-card p-3 animate-slide-up">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-3 text-left">
        <span className={`cl-badge ${eventMeta.color} shrink-0`}>{eventMeta.label}</span>
        <span className="label-small text-cl-text-muted w-40 shrink-0">{formatTime(a.timestamp)}</span>
        {a.command && (
          <span className="label-small text-cl-text-secondary shrink-0 font-mono">{a.command}</span>
        )}
        {a.result && (
          <span className="label-small text-cl-text-faint shrink-0">· {a.result}</span>
        )}
        {deltaStr && (
          <span className={`label-small ${deltaColor} shrink-0 tabular-nums`}>{deltaStr}</span>
        )}
        {a.hashChanged && (
          <span className="cl-badge cl-badge-warning shrink-0">哈希变更</span>
        )}
        <span className="label-small text-cl-text-faint truncate flex-1 font-mono">{a.configPath || '-'}</span>
        {expanded ? <ChevronDown size={14} className="text-cl-text-faint shrink-0" /> : <ChevronRight size={14} className="text-cl-text-faint shrink-0" />}
      </button>
      {expanded && (
        <div className="mt-2 pt-2 border-t border-cl-border-faint space-y-1">
          {a.configPath && (
            <div className="flex gap-2">
              <span className="label-small text-cl-text-faint w-20 shrink-0">配置路径</span>
              <span className="label-small text-cl-text-secondary font-mono break-all">{a.configPath}</span>
            </div>
          )}
          {a.source && (
            <div className="flex gap-2">
              <span className="label-small text-cl-text-faint w-20 shrink-0">来源</span>
              <span className="label-small text-cl-text-secondary font-mono">{a.source}</span>
            </div>
          )}
          {a.previousBytes != null && a.nextBytes != null && (
            <div className="flex gap-2">
              <span className="label-small text-cl-text-faint w-20 shrink-0">文件大小</span>
              <span className="label-small text-cl-text-secondary font-mono">
                {a.previousBytes} B → {a.nextBytes} B
              </span>
            </div>
          )}
          <div className="flex gap-2">
            <span className="label-small text-cl-text-faint w-20 shrink-0">原始记录</span>
            <span className="label-small text-cl-text-secondary font-mono break-all">{a.detail}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function StabilityRow({ s }: { s: StabilityEvent }) {
  const [expanded, setExpanded] = useState(false);
  const reasonMeta = stabilityReasonLabel(s.reason);
  return (
    <div className="cl-card p-3 animate-slide-up">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-start gap-3 text-left">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-status-error shrink-0 mt-1.5" />
        <span className={`cl-badge ${reasonMeta.color} shrink-0`}>{reasonMeta.label}</span>
        <span className="label-small text-cl-text-muted w-40 shrink-0">{formatTime(s.timestamp)}</span>
        <span className="label-small text-status-error flex-1 break-all">{s.errorMessage || s.errorName || '未知错误'}</span>
        {expanded ? <ChevronDown size={14} className="text-cl-text-faint shrink-0 mt-0.5" /> : <ChevronRight size={14} className="text-cl-text-faint shrink-0 mt-0.5" />}
      </button>
      {expanded && (
        <div className="mt-2 pt-2 border-t border-cl-border-faint space-y-1">
          {s.errorName && (
            <div className="flex gap-2">
              <span className="label-small text-cl-text-faint w-20 shrink-0">错误类型</span>
              <span className="label-small text-cl-text-secondary font-mono">{s.errorName}</span>
            </div>
          )}
          {s.pid > 0 && (
            <div className="flex gap-2">
              <span className="label-small text-cl-text-faint w-20 shrink-0">进程</span>
              <span className="label-small text-cl-text-secondary font-mono">PID {s.pid} · Node {s.node} · 运行 {formatUptime(s.uptimeMs)}</span>
            </div>
          )}
          <div className="flex gap-2">
            <span className="label-small text-cl-text-faint w-20 shrink-0">原始记录</span>
            <span className="label-small text-cl-text-secondary font-mono break-all">{s.detail}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function CommandRow({ cmd }: { cmd: CommandLog }) {
  const [expanded, setExpanded] = useState(false);
  const sourceMeta = sourceLabel(cmd.source);
  const actionLabel = ACTION_ZH[cmd.action] ?? cmd.action ?? '事件';
  // 从 sessionKey 提取会话类型（格式：agent:main:<kind>:...）
  const parts = cmd.sessionKey.split(':');
  const sessionKind = parts.length >= 3 ? parts[2] : '';
  const kindMeta = sessionKindLabel(sessionKind);
  return (
    <div className="cl-card p-3 animate-slide-up">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-3 text-left">
        <LogLevelDot level="info" />
        <span className="label-small text-cl-text-muted w-40 shrink-0">{formatTime(cmd.timestamp)}</span>
        <span className={`cl-badge ${sourceMeta.color} shrink-0`}>{sourceMeta.label}</span>
        <span className="label-small text-cl-text-secondary shrink-0">{actionLabel}</span>
        <span className={`cl-badge ${kindMeta.color} shrink-0`}>{kindMeta.label}</span>
        <span className="label-small text-cl-text-faint truncate flex-1 font-mono">{cmd.senderId}</span>
        {expanded ? <ChevronDown size={14} className="text-cl-text-faint shrink-0" /> : <ChevronRight size={14} className="text-cl-text-faint shrink-0" />}
      </button>
      {expanded && (
        <div className="mt-2 pt-2 border-t border-cl-border-faint space-y-1">
          <div className="flex gap-2">
            <span className="label-small text-cl-text-faint w-20 shrink-0">时间</span>
            <span className="label-small text-cl-text-secondary font-mono">{cmd.timestamp}</span>
          </div>
          <div className="flex gap-2">
            <span className="label-small text-cl-text-faint w-20 shrink-0">会话</span>
            <span className="label-small text-cl-text-secondary font-mono break-all">{cmd.sessionKey}</span>
          </div>
          <div className="flex gap-2">
            <span className="label-small text-cl-text-faint w-20 shrink-0">发送者</span>
            <span className="label-small text-cl-text-secondary font-mono break-all">{cmd.senderId}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function GatewayLogRow({ line }: { line: string }) {
  const [expanded, setExpanded] = useState(false);
  const parsed = parseGatewayLine(line);
  if (!parsed) {
    return (
      <div className="px-3 py-1.5 font-mono text-xs text-cl-text-muted hover:bg-surface-hover rounded-md">
        {line}
      </div>
    );
  }
  const summary = summarizeMessage(parsed.message, parsed.kv);
  // 可展开条件：长消息、多 kv、多行内容、聚合条目
  const isLong = summary.length > 80 || parsed.kv.length > 3 || parsed.isMultiline || parsed.isAggregated;
  const visibleKv = expanded ? parsed.kv : parsed.kv.slice(0, 2);
  const hiddenKvCount = parsed.kv.length - visibleKv.length;
  return (
    <div
      className="px-3 py-1.5 hover:bg-surface-hover rounded-md cursor-pointer"
      onClick={() => isLong && setExpanded(!expanded)}
      title={isLong ? (expanded ? '点击收起' : '点击展开') : undefined}
    >
      <div className="flex items-start gap-2">
        <LogLevelDot level={parsed.level} />
        {parsed.timeLocal ? (
          <span className="font-mono text-xs text-cl-text-faint w-24 shrink-0 pt-0.5 tabular-nums">{parsed.timeLocal}</span>
        ) : (
          <span className="font-mono text-xs text-cl-text-faint w-24 shrink-0 pt-0.5">-</span>
        )}
        <span className={`cl-badge ${parsed.componentColor} shrink-0`}>{parsed.componentLabel}</span>
        <span className={`text-xs pt-0.5 break-all flex-1 ${parsed.level === 'error' ? 'text-status-error' : parsed.level === 'warn' ? 'text-status-warning' : 'text-cl-text-secondary'}`}>
          {summary}
          {visibleKv.length > 0 && (
            <span className="ml-2 text-cl-text-faint font-mono">
              {visibleKv.map((kv) => (
                <span key={kv.k} className="mr-2">
                  <span className="text-cl-text-muted">{kv.k}=</span>
                  <span className="text-brand">{kv.v}</span>
                </span>
              ))}
              {!expanded && hiddenKvCount > 0 && (
                <span className="text-cl-text-faint">+{hiddenKvCount}</span>
              )}
            </span>
          )}
        </span>
        {isLong && (
          expanded
            ? <ChevronDown size={12} className="text-cl-text-faint shrink-0 mt-0.5" />
            : <ChevronRight size={12} className="text-cl-text-faint shrink-0 mt-0.5" />
        )}
      </div>
      {expanded && parsed.fullContent && (
        <div className="mt-2 ml-7 pl-3 border-l-2 border-cl-border-faint font-mono text-xs text-cl-text-faint whitespace-pre-wrap break-all max-h-60 overflow-y-auto">
          {parsed.fullContent}
        </div>
      )}
    </div>
  );
}

function FileRow({ file }: { file: LogFile }) {
  const sizeColor = file.size > 10 * 1024 * 1024 ? 'text-status-warning' : 'text-cl-text-secondary';
  return (
    <div className="cl-card p-3 flex items-center gap-3 animate-slide-up">
      <div className="p-1.5 rounded-lg bg-bg-tertiary text-cl-text-muted shrink-0">
        <FileText size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="label-medium text-cl-text-primary font-mono">{file.name}</p>
          <span className={`cl-badge ${file.location === 'system' ? 'cl-badge-brand' : ''}`} style={file.location !== 'system' ? { backgroundColor: 'var(--cl-bg-tertiary)', color: 'var(--cl-text-muted)' } : {}}>
            {file.location === 'system' ? '系统' : 'openclaw'}
          </span>
        </div>
        <p className="label-small text-cl-text-faint mt-0.5">
          {file.lines.toLocaleString()} 行 · {relativeTime(file.modified)}
        </p>
      </div>
      <span className={`label-small ${sizeColor} shrink-0`}>{formatBytes(file.size)}</span>
    </div>
  );
}

// ─── main ───

export default function Logs() {
  const [data, setData] = useState<LogsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'commands' | 'gateway' | 'errors' | 'restarts' | 'audit' | 'stability' | 'files'>('gateway');
  const [search, setSearch] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const d = await fetchJson<LogsData>('/logs');
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 30_000);
    return () => clearInterval(timer);
  }, []);

  const filteredCommands = useMemo(() => {
    if (!data) return [];
    return data.commands.filter((c) => {
      if (search === '') return true;
      const q = search.toLowerCase();
      return c.source.toLowerCase().includes(q) ||
        c.action.toLowerCase().includes(q) ||
        c.senderId.toLowerCase().includes(q) ||
        c.sessionKey.toLowerCase().includes(q);
    });
  }, [data, search]);

  const filteredGateway = useMemo(() => {
    if (!data) return [];
    return data.gateway.filter((l) => search === '' || l.toLowerCase().includes(search.toLowerCase()));
  }, [data, search]);

  const filteredErrors = useMemo(() => {
    if (!data) return [];
    return data.errors.filter((l) => search === '' || l.toLowerCase().includes(search.toLowerCase()));
  }, [data, search]);

  const filteredRestarts = useMemo(() => {
    if (!data) return [];
    return data.restarts.filter((l) => search === '' || l.toLowerCase().includes(search.toLowerCase()));
  }, [data, search]);

  const filteredAudit = useMemo(() => {
    if (!data) return [];
    return data.audit.filter((a) => {
      if (search === '') return true;
      const q = search.toLowerCase();
      return a.event.toLowerCase().includes(q) ||
        a.command.toLowerCase().includes(q) ||
        a.configPath.toLowerCase().includes(q) ||
        a.detail.toLowerCase().includes(q);
    });
  }, [data, search]);

  const filteredFiles = useMemo(() => {
    if (!data) return [];
    return data.files.filter((f) => search === '' || f.name.toLowerCase().includes(search.toLowerCase()));
  }, [data, search]);

  const filteredStability = useMemo(() => {
    if (!data) return [];
    return data.stability.filter((s) => {
      if (search === '') return true;
      const q = search.toLowerCase();
      return s.reason.toLowerCase().includes(q) ||
        s.errorMessage.toLowerCase().includes(q) ||
        s.detail.toLowerCase().includes(q);
    });
  }, [data, search]);

  if (loading && !data) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="skeleton h-8 w-48 rounded-lg" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton h-20 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="headline-large text-cl-text-primary">日志中心</h1>
        <div className="cl-card p-8 flex flex-col items-center justify-center min-h-[200px]">
          <p className="body-medium text-status-error mb-3">{error}</p>
          <button onClick={loadData} className="cl-btn cl-btn-outline">
            <RefreshCw size={16} />
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="headline-large text-cl-text-primary">日志中心</h1>
          <p className="body-medium text-cl-text-muted mt-1">
            OpenClaw 运行日志 · 网关 {relativeTime(data.stats.latestGateway)} · 命令 {relativeTime(data.stats.latestCommand)}
          </p>
        </div>
        <button onClick={loadData} disabled={loading} className="cl-btn cl-btn-ghost text-cl-text-muted" title="刷新">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={HardDrive} label="日志文件" value={data.stats.fileCount} sub={`共 ${formatBytes(data.stats.totalSize)}`} />
        <StatCard icon={Activity} label="网关日志" value={data.gateway.length} sub={relativeTime(data.stats.latestGateway)} />
        <StatCard icon={AlertTriangle} label="错误/稳定性" value={data.stats.errorCount + data.stats.stabilityCount} sub={`错误 ${data.stats.errorCount} · 稳定性 ${data.stats.stabilityCount}`} color={data.stats.errorCount + data.stats.stabilityCount > 0 ? 'text-status-error' : 'text-cl-text-primary'} />
        <StatCard icon={Terminal} label="命令记录" value={data.stats.commandCount} sub={relativeTime(data.stats.latestCommand)} />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <TabButton active={tab === 'gateway'} onClick={() => setTab('gateway')} icon={Activity} label="网关日志" count={data.gateway.length} />
        <TabButton active={tab === 'commands'} onClick={() => setTab('commands')} icon={Terminal} label="命令日志" count={data.commands.length} />
        <TabButton active={tab === 'errors'} onClick={() => setTab('errors')} icon={AlertTriangle} label="错误日志" count={data.errors.length} />
        <TabButton active={tab === 'stability'} onClick={() => setTab('stability')} icon={Zap} label="稳定性事件" count={data.stability.length} />
        <TabButton active={tab === 'restarts'} onClick={() => setTab('restarts')} icon={RotateCw} label="重启日志" count={data.restarts.length} />
        <TabButton active={tab === 'audit'} onClick={() => setTab('audit')} icon={ShieldCheck} label="配置审计" count={data.audit.length} />
        <TabButton active={tab === 'files'} onClick={() => setTab('files')} icon={FileText} label="文件列表" count={data.files.length} />
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cl-text-faint" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索日志内容..."
          className="w-full pl-9 pr-3 py-2 rounded-lg bg-bg-secondary border border-cl-border-faint text-cl-text-primary placeholder:text-cl-text-faint focus:outline-none focus:border-brand/40 body-small"
        />
      </div>

      {/* Content */}
      {tab === 'commands' && (
        <div className="space-y-2">
          {filteredCommands.length === 0 ? (
            <div className="cl-card p-8 text-center"><p className="body-medium text-cl-text-muted">无匹配记录</p></div>
          ) : (
            filteredCommands.map((c, i) => <CommandRow key={i} cmd={c} />)
          )}
        </div>
      )}

      {tab === 'gateway' && (
        <div className="cl-card p-3 space-y-0.5 max-h-[600px] overflow-y-auto">
          {filteredGateway.length === 0 ? (
            <div className="p-8 text-center"><p className="body-medium text-cl-text-muted">无匹配记录</p></div>
          ) : (
            filteredGateway.map((l, i) => <GatewayLogRow key={i} line={l} />)
          )}
        </div>
      )}

      {tab === 'errors' && (
        <div className="cl-card p-3 space-y-0.5 max-h-[600px] overflow-y-auto">
          {filteredErrors.length === 0 ? (
            <div className="p-8 text-center"><p className="body-medium text-cl-text-muted">无匹配记录</p></div>
          ) : (
            filteredErrors.map((l, i) => <GatewayLogRow key={i} line={l} />)
          )}
        </div>
      )}

      {tab === 'restarts' && (
        <div className="cl-card p-3 space-y-0.5 max-h-[600px] overflow-y-auto">
          {filteredRestarts.length === 0 ? (
            <div className="p-8 text-center"><p className="body-medium text-cl-text-muted">无匹配记录</p></div>
          ) : (
            filteredRestarts.map((l, i) => <RestartRow key={i} line={l} />)
          )}
        </div>
      )}

      {tab === 'audit' && (
        <div className="space-y-2">
          {filteredAudit.length === 0 ? (
            <div className="cl-card p-8 text-center"><p className="body-medium text-cl-text-muted">无匹配记录</p></div>
          ) : (
            filteredAudit.map((a, i) => <AuditRow key={i} a={a} />)
          )}
        </div>
      )}

      {tab === 'stability' && (
        <div className="space-y-2">
          {filteredStability.length === 0 ? (
            <div className="cl-card p-8 text-center"><p className="body-medium text-cl-text-muted">无稳定性事件</p></div>
          ) : (
            filteredStability.map((s, i) => <StabilityRow key={i} s={s} />)
          )}
        </div>
      )}

      {tab === 'files' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {filteredFiles.length === 0 ? (
            <div className="cl-card p-8 text-center md:col-span-2"><p className="body-medium text-cl-text-muted">无匹配文件</p></div>
          ) : (
            filteredFiles.map((f) => <FileRow key={f.name} file={f} />)
          )}
        </div>
      )}
    </div>
  );
}
