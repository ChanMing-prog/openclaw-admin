import { useState, useEffect } from 'react';
import { Bot, Puzzle, Clock, Server, ArrowUpRight, ArrowDownRight, RefreshCw, Database, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import type { SystemStatus } from '@/types';
import { fetchSystemStatus, fetchJson } from '@/lib/api';

interface ConnectorItem {
  key: string;
  label: string;
  status: 'connected' | 'partial' | 'not_connected';
  path: string;
  detail: string;
  hint?: string;
}

interface StatusCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  variant?: 'brand' | 'success' | 'warning' | 'error' | 'neutral';
  trend?: 'up' | 'down';
}

function StatusCard({ title, value, subtitle, icon, variant = 'brand', trend }: StatusCardProps) {
  const iconBgMap = {
    brand: 'bg-brand/10 text-brand',
    success: 'bg-status-success/10 text-status-success',
    warning: 'bg-status-warning/10 text-status-warning',
    error: 'bg-status-error/10 text-status-error',
    neutral: 'bg-cl-text-tertiary/8 text-cl-text-tertiary',
  };

  return (
    <div className="cl-card p-5 animate-slide-up group cursor-default">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="label-medium text-cl-text-muted mb-1">{title}</p>
          <p className="headline-small text-cl-text-primary">{value}</p>
          {subtitle && (
            <p className="body-small text-cl-text-muted mt-0.5">{subtitle}</p>
          )}
        </div>
        <div className={`p-2.5 rounded-xl ${iconBgMap[variant]} transition-transform duration-normal ease-cl-out group-hover:scale-105`}>
          {icon}
        </div>
      </div>
      {trend && (
        <div className="flex items-center gap-1.5 pt-3 border-t border-cl-border-faint">
          {trend === 'up' ? (
            <ArrowUpRight size={14} className="text-status-success" />
          ) : (
            <ArrowDownRight size={14} className="text-status-error" />
          )}
          <span className={`label-small ${trend === 'up' ? 'text-status-success' : 'text-status-error'}`}>
            {trend === 'up' ? '活跃中' : '已停止'}
          </span>
        </div>
      )}
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}秒前`;
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}分钟前`;
  if (ms < 86400_000) return `${Math.round(ms / 3600_000)}小时前`;
  return `${Math.round(ms / 86400_000)}天前`;
}


export default function Dashboard() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [connectors, setConnectors] = useState<ConnectorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState(0);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [data, connData] = await Promise.all([
        fetchSystemStatus(),
        fetchJson<{ connectors: ConnectorItem[] }>('/connectors').catch(() => ({ connectors: [] as ConnectorItem[] })),
      ]);
      setStatus(data);
      setConnectors(connData.connectors);
      setLastRefresh(Date.now());
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

  if (loading && !status) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-4">
          <div className="skeleton h-8 w-48 rounded-lg" />
          <div className="skeleton h-5 w-36 rounded-md" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 stagger-children">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="cl-card p-5">
              <div className="skeleton h-3.5 w-20 mb-3 rounded-md" />
              <div className="skeleton h-7 w-14 mb-2 rounded-md" />
              <div className="skeleton h-3 w-28 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="headline-large text-cl-text-primary">仪表盘</h1>
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

  const enabledPlugins = status.plugins.filter((p) => p.enabled).length;
  const enabledCron = status.cronJobs.filter((j) => j.enabled).length;
  const gatewayRunning = status.gateway.reachable;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="headline-large text-cl-text-primary">仪表盘</h1>
          <p className="body-medium text-cl-text-muted mt-1">
            OpenClaw v{status.runtimeVersion} · 系统运行状态概览
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-3">
          {lastRefresh > 0 && (
            <span className="label-small text-cl-text-muted">
              {formatDuration(Date.now() - lastRefresh)}前刷新
            </span>
          )}
          <button
            onClick={loadData}
            disabled={loading}
            className="cl-btn cl-btn-ghost text-cl-text-muted"
            title="刷新"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <span className="cl-badge cl-badge-success">
            <span className="w-1.5 h-1.5 rounded-full bg-status-success animate-pulse" />
            运行正常
          </span>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 stagger-children">
        <StatusCard
          title="Gateway"
          value={gatewayRunning ? '运行中' : '已停止'}
          subtitle={`v${status.gateway.self.version} · ${status.gateway.self.platform}`}
          icon={<Server size={20} />}
          variant={gatewayRunning ? 'success' : 'error'}
        />
        <StatusCard
          title="Agent"
          value={status.agents.agents.length}
          subtitle={`${status.agents.totalSessions} 个会话 · ${status.sessions.defaults.model}`}
          icon={<Bot size={20} />}
          variant="brand"
        />
        <StatusCard
          title="插件"
          value={`${enabledPlugins}/${status.plugins.length}`}
          subtitle="已启用 / 总数"
          icon={<Puzzle size={20} />}
          variant="neutral"
        />
        <StatusCard
          title="定时任务"
          value={`${enabledCron}/${status.cronJobs.length}`}
          subtitle="已启用 / 总数"
          icon={<Clock size={20} />}
          variant={status.tasks.failures > 0 ? 'warning' : 'brand'}
        />
      </div>

      {/* Connector Status */}
      {connectors.length > 0 && (
        <div className="cl-card p-5 animate-slide-up">
          <div className="flex items-center gap-2 mb-4">
            <Database size={16} className="text-cl-text-muted" />
            <h2 className="title-large text-cl-text-primary">数据源连接状态</h2>
            <span className="label-small text-cl-text-muted ml-auto">
              {connectors.filter((c) => c.status === 'connected').length}/{connectors.length} 已连接
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {connectors.map((c) => {
              const meta = {
                connected: { icon: CheckCircle2, color: 'text-status-success', bg: 'bg-status-success/10' },
                partial: { icon: AlertCircle, color: 'text-status-warning', bg: 'bg-status-warning/10' },
                not_connected: { icon: XCircle, color: 'text-status-error', bg: 'bg-status-error/10' },
              }[c.status];
              const Icon = meta.icon;
              return (
                <div
                  key={c.key}
                  className="p-3 rounded-lg bg-bg-secondary border border-cl-border-faint"
                  title={c.hint ?? c.path}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`p-1 rounded ${meta.bg}`}>
                      <Icon size={12} className={meta.color} />
                    </div>
                    <span className="label-medium text-cl-text-primary truncate">{c.label}</span>
                  </div>
                  <p className={`label-small ${meta.color} truncate`}>{c.detail}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Agent Details */}
      <div className="cl-card p-5 animate-slide-up">
        <h2 className="title-large text-cl-text-primary mb-4">Agent 概览</h2>
        <div className="space-y-3">
          {status.agents.agents.map((agent) => (
            <div key={agent.id} className="flex items-center justify-between p-3 rounded-lg bg-bg-secondary">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center">
                  <Bot size={18} className="text-brand" />
                </div>
                <div>
                  <p className="label-large text-cl-text-primary">{agent.name}</p>
                  <p className="label-small text-cl-text-muted">
                    ID: {agent.id} · {agent.sessionsCount} 个会话
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="label-small text-cl-text-muted">
                  最后活跃: {formatDuration(agent.lastActiveAgeMs)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cron Jobs */}
      <div className="cl-card p-5 animate-slide-up">
        <h2 className="title-large text-cl-text-primary mb-4">定时任务</h2>
        {status.cronJobs.length === 0 ? (
          <p className="body-medium text-cl-text-muted">暂无定时任务</p>
        ) : (
          <div className="space-y-3">
            {status.cronJobs.map((job) => (
              <div key={job.id} className="flex items-center justify-between p-3 rounded-lg bg-bg-secondary">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${job.enabled ? 'bg-status-success' : 'bg-cl-text-muted'}`} />
                  <div>
                    <p className="label-large text-cl-text-primary">{job.name || job.id}</p>
                    <p className="label-small text-cl-text-muted">
                      {job.schedule.expr} ({job.schedule.tz})
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  {job.state?.lastRunStatus && (
                    <span className={`cl-badge ${job.state.lastRunStatus === 'ok' ? 'cl-badge-success' : 'cl-badge-error'}`}>
                      {job.state.lastRunStatus === 'ok' ? '正常' : '失败'}
                    </span>
                  )}
                  {job.state?.nextRunAtMs && (
                    <p className="label-small text-cl-text-muted mt-1">
                      下次: {new Date(job.state.nextRunAtMs).toLocaleString('zh-CN')}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Memory & Tasks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="cl-card p-5 animate-slide-up">
          <h2 className="title-large text-cl-text-primary mb-4">记忆库</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="label-medium text-cl-text-muted">记忆文件</span>
              <span className="label-large text-cl-text-primary">{status.memoryFileCount} 个</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="label-medium text-cl-text-muted">向量记录</span>
              <span className="label-large text-cl-text-primary">{status.vectorDbCount.toLocaleString()} 条</span>
            </div>
          </div>
        </div>
        <div className="cl-card p-5 animate-slide-up">
          <h2 className="title-large text-cl-text-primary mb-4">任务统计</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="label-medium text-cl-text-muted">总任务</span>
              <span className="label-large text-cl-text-primary">{status.tasks.total}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="label-medium text-cl-text-muted">成功率</span>
              <span className="label-large text-cl-text-primary">
                {status.tasks.total > 0
                  ? `${Math.round(((status.tasks.total - status.tasks.failures) / status.tasks.total) * 100)}%`
                  : '-'}
              </span>
            </div>
            {status.tasks.failures > 0 && (
              <div className="flex items-center justify-between">
                <span className="label-medium text-status-error">失败任务</span>
                <span className="label-large text-status-error">{status.tasks.failures}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
