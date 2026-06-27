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
  action: string;
  path: string;
  detail: string;
}

interface StabilityEvent {
  timestamp: string;
  event: string;
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

// 网关日志行解析：[2026-05-21T08:17:11.988+08:00] [component] message
function parseGatewayLine(line: string): { time: string; component: string; message: string; level: 'info' | 'warn' | 'error' } | null {
  const m = /^(\S+)\s+\[([^\]]+)\]\s+(.*)$/.exec(line);
  if (!m) return null;
  const [, time, component, message] = m;
  let level: 'info' | 'warn' | 'error' = 'info';
  if (/error|fail|fatal/i.test(message)) level = 'error';
  else if (/warn/i.test(message)) level = 'warn';
  return { time, component, message, level };
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

function CommandRow({ cmd }: { cmd: CommandLog }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="cl-card p-3 animate-slide-up">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center gap-3 text-left">
        <LogLevelDot level="info" />
        <span className="label-small text-cl-text-muted w-40 shrink-0">{formatTime(cmd.timestamp)}</span>
        <span className="cl-badge cl-badge-brand shrink-0">{cmd.source}</span>
        <span className="label-small text-cl-text-muted shrink-0">{cmd.action}</span>
        <span className="label-small text-cl-text-faint truncate flex-1">{cmd.senderId}</span>
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
            <span className="label-small text-cl-text-secondary font-mono">{cmd.senderId}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function GatewayLogRow({ line }: { line: string }) {
  const parsed = parseGatewayLine(line);
  if (!parsed) {
    return (
      <div className="px-3 py-1.5 font-mono text-xs text-cl-text-muted hover:bg-surface-hover rounded-md">
        {line}
      </div>
    );
  }
  return (
    <div className="px-3 py-1.5 hover:bg-surface-hover rounded-md flex items-start gap-2">
      <LogLevelDot level={parsed.level} />
      <span className="font-mono text-xs text-cl-text-faint w-44 shrink-0 pt-0.5">{parsed.time}</span>
      <span className="font-mono text-xs text-brand w-32 shrink-0 pt-0.5 truncate">{parsed.component}</span>
      <span className={`font-mono text-xs pt-0.5 break-all ${parsed.level === 'error' ? 'text-status-error' : 'text-cl-text-secondary'}`}>
        {parsed.message}
      </span>
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
      return a.action.toLowerCase().includes(q) || a.path.toLowerCase().includes(q) || a.detail.toLowerCase().includes(q);
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
      return s.event.toLowerCase().includes(q) || s.detail.toLowerCase().includes(q);
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
            filteredRestarts.map((l, i) => (
              <div key={i} className="px-3 py-1.5 font-mono text-xs text-cl-text-secondary hover:bg-surface-hover rounded-md">
                {l}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'audit' && (
        <div className="space-y-2">
          {filteredAudit.length === 0 ? (
            <div className="cl-card p-8 text-center"><p className="body-medium text-cl-text-muted">无匹配记录</p></div>
          ) : (
            filteredAudit.map((a, i) => (
              <div key={i} className="cl-card p-3 animate-slide-up">
                <div className="flex items-center gap-3">
                  <span className="cl-badge cl-badge-brand shrink-0">{a.action || '变更'}</span>
                  <span className="label-small text-cl-text-muted shrink-0">{formatTime(a.timestamp)}</span>
                  <span className="label-small text-cl-text-secondary font-mono truncate flex-1">{a.path || '-'}</span>
                </div>
                <p className="label-small text-cl-text-faint font-mono mt-1.5 break-all line-clamp-2">{a.detail}</p>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'stability' && (
        <div className="space-y-2">
          {filteredStability.length === 0 ? (
            <div className="cl-card p-8 text-center"><p className="body-medium text-cl-text-muted">无稳定性事件</p></div>
          ) : (
            filteredStability.map((s, i) => (
              <div key={i} className="cl-card p-3 animate-slide-up">
                <div className="flex items-center gap-3">
                  <span className="cl-badge cl-badge-error shrink-0">{s.event || '事件'}</span>
                  <span className="label-small text-cl-text-muted shrink-0">{formatTime(s.timestamp)}</span>
                </div>
                <p className="label-small text-cl-text-faint font-mono mt-1.5 break-all line-clamp-3">{s.detail}</p>
              </div>
            ))
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
