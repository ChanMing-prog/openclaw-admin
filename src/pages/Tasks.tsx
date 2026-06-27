import { useState, useEffect, useMemo } from 'react';
import {
  Clock,
  RefreshCw,
  Search,
  Calendar,
  CheckCircle2,
  XCircle,
  ChevronRight,
  ChevronDown,
  Send,
  Play,
  Timer,
  AlertTriangle,
  History,
  MessageSquare,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { fetchJson } from '@/lib/api';

// ─── types ───

interface CronSchedule {
  kind: string;
  expr: string;
  tz: string;
}

interface CronPayload {
  kind: string;
  message?: string;
  timeoutSeconds?: number;
}

interface CronDelivery {
  mode?: string;
  channel?: string;
  to?: string;
  bestEffort?: boolean;
}

interface CronState {
  nextRunAtMs?: number;
  lastRunAtMs?: number;
  lastRunStatus?: string;
  lastStatus?: string;
  lastDurationMs?: number;
  lastDeliveryStatus?: string;
  lastError?: string;
  consecutiveErrors?: number;
  consecutiveFailures?: number;
  consecutiveSuccesses?: number;
}

interface CronJob {
  id: string;
  agentId: string;
  sessionKey: string;
  name: string;
  enabled: boolean;
  createdAtMs: number;
  schedule: CronSchedule;
  sessionTarget?: string;
  wakeMode?: string;
  payload?: CronPayload;
  deleteAfterRun?: boolean;
  delivery?: CronDelivery;
  state?: CronState;
}

interface CronRun {
  ts: number;
  jobId: string;
  status: string;
  summary?: string;
  error?: string;
  deliveryStatus?: string;
  delivered?: boolean;
  durationMs?: number;
  model?: string;
  provider?: string;
  totalTokens?: number;
}

// ─── helpers ───

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function describeCron(expr: string): string {
  // 5-field cron: minute hour day-of-month month day-of-week
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [min, hour, dom, , dow] = parts;

  const at = (h: string, m: string) => {
    const hh = h === '*' ? '每小时' : `${h.padStart(2, '0')}`;
    const mm = m === '*' ? '' : `:${m.padStart(2, '0')}`;
    return `${hh}${mm}`;
  };

  if (dom === '*' && dow !== '*') {
    const days = dow.split(',').map((d) => `每周${WEEKDAYS[Number(d)] ?? d}`).join('、');
    return `${days} ${at(hour, min)}`;
  }
  if (dom !== '*' && dow === '*') return `每月 ${dom} 日 ${at(hour, min)}`;
  if (min !== '*' && hour !== '*' && dom === '*' && dow === '*') return `每天 ${at(hour, min)}`;
  if (min === '0' && hour === '*' && dom === '*' && dow === '*') return '每小时整点';
  return expr;
}

function formatTime(ms: number): string {
  if (!ms || ms <= 0) return '-';
  return new Date(ms).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '-';
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}秒`;
  return `${Math.round(ms / 60_000)}分${Math.round((ms % 60_000) / 1000)}秒`;
}

function relativeTime(ms: number): string {
  if (!ms || ms <= 0) return '-';
  const diff = Date.now() - ms;
  if (diff < 0) {
    const ahead = -diff;
    if (ahead < 3600_000) return `${Math.round(ahead / 60_000)}分钟后`;
    if (ahead < 86400_000) return `${Math.round(ahead / 3600_000)}小时后`;
    return `${Math.round(ahead / 86400_000)}天后`;
  }
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.round(diff / 60_000)}分钟前`;
  if (diff < 86400_000) return `${Math.round(diff / 3600_000)}小时前`;
  return `${Math.round(diff / 86400_000)}天前`;
}

function deliveryLabel(d?: CronDelivery): string {
  if (!d) return '无';
  const ch = d.channel ? `${d.channel} ` : '';
  const mode = d.mode ?? '';
  return `${ch}${mode}`.trim() || '默认';
}

function sessionTargetLabel(t?: string): string {
  const map: Record<string, string> = {
    isolated: '隔离会话',
    shared: '共享会话',
    resume: '恢复会话',
  };
  return map[t ?? ''] ?? t ?? '-';
}

// ─── components ───

function StatCard({ icon: Icon, label, value, sub, variant = 'brand' }: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  variant?: 'brand' | 'success' | 'warning' | 'error' | 'neutral';
}) {
  const bg = {
    brand: 'bg-brand/10 text-brand',
    success: 'bg-status-success/10 text-status-success',
    warning: 'bg-status-warning/10 text-status-warning',
    error: 'bg-status-error/10 text-status-error',
    neutral: 'bg-cl-text-tertiary/8 text-cl-text-tertiary',
  }[variant];
  return (
    <div className="cl-card p-4 animate-slide-up">
      <div className="flex items-center justify-between mb-2">
        <p className="label-medium text-cl-text-muted">{label}</p>
        <div className={`p-1.5 rounded-lg ${bg}`}>
          <Icon size={14} />
        </div>
      </div>
      <p className="headline-small text-cl-text-primary">{value}</p>
      {sub && <p className="label-small text-cl-text-faint mt-0.5">{sub}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'ok' || status === 'succeeded') {
    return (
      <span className="cl-badge cl-badge-success">
        <CheckCircle2 size={10} />
        成功
      </span>
    );
  }
  if (status === 'error' || status === 'failed') {
    return (
      <span className="cl-badge cl-badge-error">
        <XCircle size={10} />
        失败
      </span>
    );
  }
  if (status === 'timed_out') {
    return (
      <span className="cl-badge cl-badge-warning">
        <Timer size={10} />
        超时
      </span>
    );
  }
  if (status === 'running') {
    return <span className="cl-badge cl-badge-brand">运行中</span>;
  }
  return <span className="cl-badge cl-badge-warning">{status}</span>;
}

function JobCard({ job, runs, expanded, onToggle }: {
  job: CronJob;
  runs: CronRun[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const jobRuns = useMemo(
    () => runs.filter((r) => r.jobId === job.id).sort((a, b) => b.ts - a.ts).slice(0, 8),
    [runs, job.id],
  );
  const payload = job.payload?.message ?? '';
  const hasError = job.state?.lastRunStatus && job.state.lastRunStatus !== 'ok';

  return (
    <div className="cl-card animate-slide-up overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-surface-hover transition-colors"
      >
        <div className={`w-2 h-2 rounded-full shrink-0 ${job.enabled ? 'bg-status-success' : 'bg-cl-text-tertiary'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="label-large text-cl-text-primary truncate">{job.name || job.id}</p>
            {job.enabled ? (
              <span className="cl-badge cl-badge-success">启用</span>
            ) : (
              <span className="cl-badge" style={{ backgroundColor: 'var(--cl-bg-tertiary)', color: 'var(--cl-text-muted)' }}>禁用</span>
            )}
            {hasError && (
              <span className="cl-badge cl-badge-error">
                <AlertTriangle size={10} />
                上次失败
              </span>
            )}
          </div>
          <p className="label-small text-cl-text-muted mt-1 flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1">
              <Calendar size={11} />
              {describeCron(job.schedule.expr)}
            </span>
            <span className="text-cl-text-faint">·</span>
            <span>{job.schedule.tz}</span>
            <span className="text-cl-text-faint">·</span>
            <span className="flex items-center gap-1">
              <Send size={11} />
              {deliveryLabel(job.delivery)}
            </span>
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="label-small text-cl-text-muted">下次执行</p>
          <p className="label-small text-cl-text-primary">{relativeTime(job.state?.nextRunAtMs ?? 0)}</p>
        </div>
        {expanded ? (
          <ChevronDown size={16} className="text-cl-text-muted shrink-0" />
        ) : (
          <ChevronRight size={16} className="text-cl-text-muted shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-cl-border-faint px-4 py-4 space-y-4 animate-fade-in">
          {/* 调度信息 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <p className="label-small text-cl-text-faint">Cron 表达式</p>
              <p className="label-medium text-cl-text-primary font-mono">{job.schedule.expr}</p>
            </div>
            <div className="space-y-1">
              <p className="label-small text-cl-text-faint">会话模式</p>
              <p className="label-medium text-cl-text-primary">{sessionTargetLabel(job.sessionTarget)}</p>
            </div>
            <div className="space-y-1">
              <p className="label-small text-cl-text-faint">上次耗时</p>
              <p className="label-medium text-cl-text-primary">{formatDuration(job.state?.lastDurationMs ?? 0)}</p>
            </div>
            <div className="space-y-1">
              <p className="label-small text-cl-text-faint">连续错误</p>
              <p className="label-medium text-cl-text-primary">{job.state?.consecutiveErrors ?? 0} 次</p>
            </div>
          </div>

          {/* 时间线 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg bg-bg-secondary p-3">
              <p className="label-small text-cl-text-faint mb-1">上次执行</p>
              <div className="flex items-center gap-2">
                {job.state?.lastRunStatus && <StatusBadge status={job.state.lastRunStatus} />}
                <span className="label-medium text-cl-text-primary">{formatTime(job.state?.lastRunAtMs ?? 0)}</span>
              </div>
              <p className="label-small text-cl-text-muted mt-1">{relativeTime(job.state?.lastRunAtMs ?? 0)}</p>
            </div>
            <div className="rounded-lg bg-bg-secondary p-3">
              <p className="label-small text-cl-text-faint mb-1">下次执行</p>
              <p className="label-medium text-cl-text-primary">{formatTime(job.state?.nextRunAtMs ?? 0)}</p>
              <p className="label-small text-cl-text-muted mt-1">{relativeTime(job.state?.nextRunAtMs ?? 0)}</p>
            </div>
          </div>

          {/* 投递配置 */}
          {job.delivery && (
            <div className="rounded-lg bg-bg-secondary p-3 space-y-1.5">
              <p className="label-small text-cl-text-faint flex items-center gap-1">
                <Send size={11} />
                投递配置
              </p>
              <div className="flex flex-wrap gap-3 label-small text-cl-text-secondary">
                <span>模式：<span className="text-cl-text-primary">{job.delivery.mode ?? '-'}</span></span>
                <span>渠道：<span className="text-cl-text-primary">{job.delivery.channel ?? '-'}</span></span>
                <span>目标：<span className="text-cl-text-primary font-mono text-xs">{job.delivery.to ?? '-'}</span></span>
                <span>投递状态：<span className="text-cl-text-primary">{job.state?.lastDeliveryStatus ?? '-'}</span></span>
              </div>
            </div>
          )}

          {/* Payload 预览 */}
          {payload && (
            <div className="rounded-lg bg-bg-secondary p-3 space-y-1.5">
              <p className="label-small text-cl-text-faint flex items-center gap-1">
                <MessageSquare size={11} />
                执行消息
              </p>
              <pre className="label-small text-cl-text-secondary whitespace-pre-wrap break-all max-h-40 overflow-y-auto font-sans leading-relaxed">
                {payload.slice(0, 800)}{payload.length > 800 ? '\n...' : ''}
              </pre>
            </div>
          )}

          {/* 运行历史 */}
          {jobRuns.length > 0 && (
            <div className="space-y-2">
              <p className="label-small text-cl-text-faint flex items-center gap-1">
                <History size={11} />
                运行历史（最近 {jobRuns.length} 次）
              </p>
              <div className="space-y-1.5">
                {jobRuns.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 rounded-md bg-bg-secondary">
                    <StatusBadge status={r.status} />
                    <span className="label-small text-cl-text-muted w-28">{formatTime(r.ts)}</span>
                    <span className="label-small text-cl-text-faint flex items-center gap-1">
                      <Timer size={11} />
                      {formatDuration(r.durationMs ?? 0)}
                    </span>
                    <span className="label-small text-cl-text-muted truncate flex-1">
                      {r.summary?.split('\n')[0]?.slice(0, 60) || '-'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 元数据 */}
          <div className="flex flex-wrap gap-3 label-small text-cl-text-faint pt-1">
            <span>Agent: {job.agentId}</span>
            <span>·</span>
            <span>创建: {formatTime(job.createdAtMs)}</span>
            <span>·</span>
            <span className="font-mono text-xs">ID: {job.id.slice(0, 8)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function RunRow({ run, jobName }: { run: CronRun; jobName: string }) {
  return (
    <div className="cl-card p-3 animate-slide-up">
      <div className="flex items-center gap-3 mb-1">
        <StatusBadge status={run.status} />
        <span className="label-medium text-cl-text-primary truncate">{jobName}</span>
        <span className="label-small text-cl-text-muted ml-auto">{formatTime(run.ts)}</span>
      </div>
      <div className="flex items-center gap-3 label-small text-cl-text-faint flex-wrap">
        <span className="flex items-center gap-1">
          <Timer size={11} />
          {formatDuration(run.durationMs ?? 0)}
        </span>
        {run.model && <span>{run.model}</span>}
        {run.totalTokens ? (
          <span>{(run.totalTokens / 1000).toFixed(1)}k tokens</span>
        ) : null}
        {run.deliveryStatus && run.deliveryStatus !== 'not_applicable' && <span>投递: {run.deliveryStatus}</span>}
        <span className="text-cl-text-faint">{relativeTime(run.ts)}</span>
      </div>
      {run.summary && (
        <pre className="label-small text-cl-text-secondary whitespace-pre-wrap break-words mt-2 max-h-24 overflow-y-auto font-sans leading-relaxed border-t border-cl-border-faint pt-2">
          {run.summary.slice(0, 300)}{run.summary.length > 300 ? '...' : ''}
        </pre>
      )}
    </div>
  );
}

// ─── main ───

export default function Tasks() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [runs, setRuns] = useState<CronRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled' | 'error'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'jobs' | 'runs'>('jobs');

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [jobData, runData] = await Promise.all([
        fetchJson<{ jobs: CronJob[] }>('/cron'),
        fetchJson<{ runs: CronRun[] }>('/cron/runs').catch(() => ({ runs: [] as CronRun[] })),
      ]);
      setJobs(jobData.jobs);
      setRuns(runData.runs);
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

  // ─── stats ───
  const enabledCount = jobs.filter((j) => j.enabled).length;
  const errorJobs = jobs.filter((j) => j.state?.lastRunStatus && j.state.lastRunStatus !== 'ok').length;
  const okRuns = runs.filter((r) => r.status === 'ok' || r.status === 'succeeded').length;
  const successRate = runs.length > 0 ? Math.round((okRuns / runs.length) * 100) : 0;
  const jobNameMap = useMemo(() => {
    const m = new Map<string, string>();
    jobs.forEach((j) => m.set(j.id, j.name || j.id));
    return m;
  }, [jobs]);

  // ─── filter ───
  const filteredJobs = useMemo(() => {
    return jobs.filter((j) => {
      const matchSearch = search === '' || j.name.toLowerCase().includes(search.toLowerCase());
      const matchFilter =
        filter === 'all' ||
        (filter === 'enabled' && j.enabled) ||
        (filter === 'disabled' && !j.enabled) ||
        (filter === 'error' && j.state?.lastRunStatus && j.state.lastRunStatus !== 'ok');
      return matchSearch && matchFilter;
    });
  }, [jobs, search, filter]);

  const filteredRuns = useMemo(() => {
    return runs.filter((r) => {
      const name = jobNameMap.get(r.jobId) ?? r.jobId;
      return search === '' || name.toLowerCase().includes(search.toLowerCase());
    });
  }, [runs, search, jobNameMap]);

  // ─── loading ───
  if (loading && jobs.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="skeleton h-8 w-48 rounded-lg" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 stagger-children">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="cl-card p-4 space-y-2">
              <div className="skeleton h-3 w-20 rounded-md" />
              <div className="skeleton h-6 w-14 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error && jobs.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="headline-large text-cl-text-primary">定时任务</h1>
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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="headline-large text-cl-text-primary">定时任务</h1>
          <p className="body-medium text-cl-text-muted mt-1">
            Cron 任务调度与执行历史 · 共 {jobs.length} 个任务 · {runs.length} 次执行记录
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="cl-btn cl-btn-ghost text-cl-text-muted"
          title="刷新"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 stagger-children">
        <StatCard icon={Clock} label="任务总数" value={jobs.length} sub={`${enabledCount} 启用 · ${jobs.length - enabledCount} 禁用`} variant="brand" />
        <StatCard icon={Play} label="执行次数" value={runs.length} sub={`最近 ${relativeTime(runs[0]?.ts ?? 0)}`} variant="neutral" />
        <StatCard icon={CheckCircle2} label="成功率" value={`${successRate}%`} sub={`${okRuns} 成功 · ${runs.length - okRuns} 失败`} variant={successRate >= 90 ? 'success' : 'warning'} />
        <StatCard icon={AlertTriangle} label="异常任务" value={errorJobs} sub={errorJobs > 0 ? '需关注' : '全部正常'} variant={errorJobs > 0 ? 'error' : 'success'} />
      </div>

      {/* Search + Filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cl-text-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索任务名称..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-bg-secondary border border-cl-border-faint text-cl-text-primary placeholder:text-cl-text-faint focus:outline-none focus:border-brand/40 body-small"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {(['all', 'enabled', 'disabled', 'error'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md label-small transition-colors ${
                filter === f
                  ? 'bg-brand/10 text-brand border border-brand/20'
                  : 'text-cl-text-muted hover:text-cl-text-primary hover:bg-surface-hover border border-transparent'
              }`}
            >
              {f === 'all' ? '全部' : f === 'enabled' ? '启用' : f === 'disabled' ? '禁用' : '异常'}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-cl-border-faint pb-2">
        <button
          onClick={() => setTab('jobs')}
          className={`px-4 py-2 rounded-lg label-medium transition-colors flex items-center gap-2 ${
            tab === 'jobs' ? 'bg-brand/10 text-brand' : 'text-cl-text-muted hover:text-cl-text-primary'
          }`}
        >
          <Clock size={14} />
          任务列表
          <span className="label-small px-1.5 py-0.5 rounded-md bg-bg-tertiary">{filteredJobs.length}</span>
        </button>
        <button
          onClick={() => setTab('runs')}
          className={`px-4 py-2 rounded-lg label-medium transition-colors flex items-center gap-2 ${
            tab === 'runs' ? 'bg-brand/10 text-brand' : 'text-cl-text-muted hover:text-cl-text-primary'
          }`}
        >
          <History size={14} />
          执行历史
          <span className="label-small px-1.5 py-0.5 rounded-md bg-bg-tertiary">{filteredRuns.length}</span>
        </button>
      </div>

      {/* Content */}
      {tab === 'jobs' ? (
        <div className="space-y-3">
          {filteredJobs.length === 0 ? (
            <div className="cl-card p-8 text-center">
              <p className="body-medium text-cl-text-muted">无匹配任务</p>
            </div>
          ) : (
            filteredJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                runs={runs}
                expanded={expandedId === job.id}
                onToggle={() => setExpandedId(expandedId === job.id ? null : job.id)}
              />
            ))
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredRuns.length === 0 ? (
            <div className="cl-card p-8 text-center">
              <p className="body-medium text-cl-text-muted">无执行记录</p>
            </div>
          ) : (
            filteredRuns.slice(0, 50).map((r, i) => (
              <RunRow key={i} run={r} jobName={jobNameMap.get(r.jobId) || r.jobId.slice(0, 8)} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
