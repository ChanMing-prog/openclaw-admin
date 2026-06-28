import { useState, useEffect } from 'react';
import {
  Bot,
  MessageSquare,
  Cpu,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Zap,
  Search,
  Hash,
} from 'lucide-react';
import type { SystemStatus, CronJob } from '@/types';
import type { LucideIcon } from 'lucide-react';
import { fetchSystemStatus } from '@/lib/api';

// ─── helpers ───

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}秒前`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}分钟前`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}小时前`;
  return `${Math.round(ms / 86_400_000)}天前`;
}

function formatTokens(n: number | undefined): string {
  if (n == null || n === 0) return '-';
  if (n < 1_000) return String(n);
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function sessionKindLabel(kind: string): { label: string; color: string } {
  switch (kind) {
    case 'direct':
      return { label: '对话', color: 'cl-badge-brand' };
    case 'cron':
      return { label: '定时', color: 'cl-badge-info' };
    case 'group':
      return { label: '群聊', color: 'cl-badge-warning' };
    default:
      return { label: kind, color: 'cl-badge-success' };
  }
}

// ─── types ───

interface SessionItem {
  key: string;
  agentId: string;
  sessionId: string;
  model?: string;
  updatedAt: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  kind?: string;
  percentUsed?: number;
  remainingTokens?: number;
}

// ─── sub-components ───

function StatBadge({ icon: Icon, label, value, color }: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-bg-secondary">
      <div className={`p-1.5 rounded-md ${color}`}>
        <Icon size={14} />
      </div>
      <div>
        <p className="label-small text-cl-text-muted">{label}</p>
        <p className="label-large text-cl-text-primary">{value}</p>
      </div>
    </div>
  );
}

function TokenBar({ percent }: { percent: number }) {
  const color =
    percent > 80 ? 'bg-status-error' : percent > 50 ? 'bg-status-warning' : 'bg-brand';
  return (
    <div className="w-full h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
      <div
        className={`h-full rounded-full ${color} transition-all duration-500`}
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </div>
  );
}

// ─── main ───

export default function Agents() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterKind, setFilterKind] = useState<string>('all');

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchSystemStatus();
      setStatus(data);
      setCronJobs(data.cronJobs);
      const enrichedSessions: SessionItem[] = data.sessions.recent.map((s) => {
        const parts = s.key.split(':');
        const kind = parts.length >= 3 ? parts[2] : 'unknown';
        return { ...s, kind };
      });
      setSessions(enrichedSessions);
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

  // ─── loading ───
  if (loading && !status) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-4">
          <div className="skeleton h-8 w-48 rounded-lg" />
          <div className="skeleton h-5 w-36 rounded-md" />
        </div>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="cl-card p-5 space-y-3">
              <div className="skeleton h-5 w-40 rounded-md" />
              <div className="skeleton h-4 w-64 rounded-md" />
              <div className="skeleton h-4 w-32 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── error ───
  if (error && !status) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="headline-large text-cl-text-primary">Agent 管理</h1>
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

  if (!status) return null;

  // ─── data ───
  const agents = status.agents.agents;

  // ─── filter sessions ───
  const filteredSessions = sessions.filter((s) => {
    const matchSearch =
      searchQuery === '' ||
      s.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.sessionId.toLowerCase().includes(searchQuery.toLowerCase());
    const matchKind = filterKind === 'all' || s.kind === filterKind;
    return matchSearch && matchKind;
  });

  // ─── sessions per agent ───
  function getSessionsForAgent(agentId: string): SessionItem[] {
    return filteredSessions.filter((s) => s.agentId === agentId);
  }

  // ─── total tokens per agent ───
  function getTotalTokens(agentId: string): number {
    return sessions
      .filter((s) => s.agentId === agentId)
      .reduce((sum, s) => sum + (s.totalTokens ?? 0), 0);
  }

  const totalTokensAll = sessions.reduce((sum, s) => sum + (s.totalTokens ?? 0), 0);

  const kindCounts = {
    all: sessions.length,
    direct: sessions.filter((s) => s.kind === 'direct').length,
    cron: sessions.filter((s) => s.kind === 'cron').length,
    group: sessions.filter((s) => s.kind === 'group').length,
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="headline-large text-cl-text-primary">Agent 管理</h1>
          <p className="body-medium text-cl-text-muted mt-1">
            管理和监控 AI Agent 的运行状态
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-3">
          <button
            onClick={loadData}
            disabled={loading}
            className="cl-btn cl-btn-ghost text-cl-text-muted"
            title="刷新"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 stagger-children">
        <StatBadge icon={Bot} label="Agent" value={agents.length} color="bg-brand/10 text-brand" />
        <StatBadge
          icon={MessageSquare}
          label="会话总数"
          value={status.sessions.count}
          color="bg-status-success/10 text-status-success"
        />
        <StatBadge
          icon={Cpu}
          label="模型"
          value={status.sessions.defaults.model}
          color="bg-status-info/10 text-status-info"
        />
        <StatBadge
          icon={Zap}
          label="总 Token"
          value={formatTokens(totalTokensAll)}
          color="bg-status-warning/10 text-status-warning"
        />
      </div>

      {/* Agent Cards */}
      <div className="space-y-4">
        {agents.map((agent) => {
          const isExpanded = expandedAgent === agent.id;
          const agentSessions = getSessionsForAgent(agent.id);
          const agentTokens = getTotalTokens(agent.id);

          return (
            <div key={agent.id} className="cl-card animate-slide-up overflow-hidden">
              {/* Agent Header */}
              <div
                className="p-5 cursor-pointer hover:bg-surface-hover transition-colors duration-fast ease-cl-out"
                onClick={() => setExpandedAgent(isExpanded ? null : agent.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-11 h-11 rounded-xl bg-brand/10 flex items-center justify-center">
                      <Bot size={22} className="text-brand" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="title-large text-cl-text-primary">{agent.name}</h3>
                        {agent.id === status.agents.defaultId && (
                          <span className="cl-badge cl-badge-brand">默认</span>
                        )}
                      </div>
                      <p className="label-small text-cl-text-muted mt-0.5">
                        ID: {agent.id} · 最后活跃: {formatDuration(agent.lastActiveAgeMs)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="hidden md:flex items-center gap-6">
                      <div className="text-right">
                        <p className="label-small text-cl-text-muted">会话</p>
                        <p className="label-large text-cl-text-primary">{agentSessions.length}</p>
                      </div>
                      <div className="text-right">
                        <p className="label-small text-cl-text-muted">Token 消耗</p>
                        <p className="label-large text-cl-text-primary">{formatTokens(agentTokens)}</p>
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronDown size={18} className="text-cl-text-muted" />
                    ) : (
                      <ChevronRight size={18} className="text-cl-text-muted" />
                    )}
                  </div>
                </div>

                {/* Mobile stats */}
                <div className="flex md:hidden items-center gap-4 mt-3 pl-15">
                  <span className="label-small text-cl-text-muted">
                    {agentSessions.length} 个会话
                  </span>
                  <span className="label-small text-cl-text-muted">
                    {formatTokens(agentTokens)} Token
                  </span>
                </div>
              </div>

              {/* Expanded: Sessions */}
              {isExpanded && (
                <div className="border-t border-cl-border-faint">
                  {/* Search & Filter */}
                  <div className="p-4 flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Search
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-cl-text-muted"
                      />
                      <input
                        type="text"
                        placeholder="搜索会话 Key 或 ID..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 rounded-lg bg-bg-secondary border border-cl-border-faint text-cl-text-primary body-small placeholder:text-cl-text-faint focus:outline-none focus:border-brand transition-colors"
                      />
                    </div>
                    <div className="flex gap-1.5">
                      {(['all', 'direct', 'cron', 'group'] as const).map((kind) => (
                        <button
                          key={kind}
                          onClick={() => setFilterKind(kind)}
                          className={`cl-chip text-[12px] ${
                            filterKind === kind ? 'selected' : ''
                          }`}
                        >
                          {kind === 'all'
                            ? '全部'
                            : kind === 'direct'
                            ? '对话'
                            : kind === 'cron'
                            ? '定时'
                            : '群聊'}
                          <span className="text-cl-text-faint">
                            {kindCounts[kind]}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sessions Table */}
                  {agentSessions.length === 0 ? (
                    <div className="p-8 text-center">
                      <p className="body-medium text-cl-text-muted">暂无匹配的会话</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-t border-cl-border-faint">
                            <th className="px-4 py-2.5 label-medium text-cl-text-muted font-medium">
                              会话
                            </th>
                            <th className="px-4 py-2.5 label-medium text-cl-text-muted font-medium">
                              类型
                            </th>
                            <th className="px-4 py-2.5 label-medium text-cl-text-muted font-medium hidden md:table-cell">
                              模型
                            </th>
                            <th className="px-4 py-2.5 label-medium text-cl-text-muted font-medium text-right">
                              输入
                            </th>
                            <th className="px-4 py-2.5 label-medium text-cl-text-muted font-medium text-right">
                              输出
                            </th>
                            <th className="px-4 py-2.5 label-medium text-cl-text-muted font-medium text-right">
                              总 Token
                            </th>
                            <th className="px-4 py-2.5 label-medium text-cl-text-muted font-medium hidden lg:table-cell">
                              上下文使用
                            </th>
                            <th className="px-4 py-2.5 label-medium text-cl-text-muted font-medium text-right">
                              最后活跃
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {agentSessions.map((session) => {
                            const kindInfo = sessionKindLabel(session.kind ?? 'unknown');
                            const sessionAge = Date.now() - session.updatedAt;
                            return (
                              <tr
                                key={session.key}
                                className="border-t border-cl-border-faint hover:bg-surface-hover transition-colors"
                              >
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <Hash size={12} className="text-cl-text-faint shrink-0" />
                                    <span className="label-small text-cl-text-primary truncate max-w-[200px]" title={session.key}>
                                      {session.key.split(':').slice(2).join(':') || session.key}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`cl-badge ${kindInfo.color}`}>
                                    {kindInfo.label}
                                  </span>
                                </td>
                                <td className="px-4 py-3 hidden md:table-cell">
                                  <span className={`label-small ${session.model ? 'text-cl-text-secondary' : 'text-cl-text-faint'}`}>
                                    {session.model || '未启动'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <span className="label-small text-cl-text-secondary">
                                    {formatTokens(session.inputTokens)}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <span className="label-small text-cl-text-secondary">
                                    {formatTokens(session.outputTokens)}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <span className="label-small text-cl-text-primary font-medium">
                                    {formatTokens(session.totalTokens)}
                                  </span>
                                </td>
                                <td className="px-4 py-3 hidden lg:table-cell">
                                  {session.percentUsed != null ? (
                                    <div className="flex items-center gap-2">
                                      <TokenBar percent={session.percentUsed} />
                                      <span className="label-small text-cl-text-muted w-8 text-right">
                                        {session.percentUsed}%
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="label-small text-cl-text-faint">-</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <span className="label-small text-cl-text-muted">
                                    {formatDuration(sessionAge)}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Cron Jobs Section */}
      {cronJobs.length > 0 && (
        <div className="cl-card p-5 animate-slide-up">
          <h2 className="title-large text-cl-text-primary mb-4">
            <div className="flex items-center gap-2">
              <Clock size={18} className="text-cl-text-muted" />
              关联定时任务
            </div>
          </h2>
          <div className="space-y-2">
            {cronJobs.slice(0, 8).map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between p-3 rounded-lg bg-bg-secondary"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      job.enabled ? 'bg-status-success' : 'bg-cl-text-muted'
                    }`}
                  />
                  <div>
                    <p className="label-large text-cl-text-primary">
                      {job.name || job.id.slice(0, 8)}
                    </p>
                    <p className="label-small text-cl-text-muted">
                      {job.schedule.expr} ({job.schedule.tz}) · Agent: {job.agentId}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {job.state?.lastRunStatus && (
                    <span
                      className={`cl-badge ${
                        job.state.lastRunStatus === 'ok'
                          ? 'cl-badge-success'
                          : 'cl-badge-error'
                      }`}
                    >
                      {job.state.lastRunStatus === 'ok' ? '正常' : '失败'}
                    </span>
                  )}
                  {job.state?.lastDurationMs != null && (
                    <span className="label-small text-cl-text-muted">
                      {Math.round(job.state.lastDurationMs / 1000)}s
                    </span>
                  )}
                </div>
              </div>
            ))}
            {cronJobs.length > 8 && (
              <p className="label-small text-cl-text-muted text-center pt-2">
                还有 {cronJobs.length - 8} 个任务...
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
