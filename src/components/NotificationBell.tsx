import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, X, AlertTriangle, Zap, ShieldCheck, CheckCircle2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { fetchJson } from '@/lib/api';

// ─── types ───

interface CronJob {
  id?: string;
  name?: string;
  enabled?: boolean;
  lastRunStatus?: string;
  lastRunAtMs?: number;
  lastError?: string;
  nextRunAtMs?: number;
}

interface CronRun {
  status?: string;
  ts?: number;
  runAtMs?: number;
  startedAtMs?: number;
  jobId?: string;
  name?: string;
  error?: string;
  summary?: string;
}

interface StabilityEvent {
  timestamp: string;
  event: string;
  detail: string;
}

interface AuditLog {
  timestamp: string;
  action: string;
  path: string;
  detail: string;
}

interface NotificationItem {
  id: string;
  type: 'cron-fail' | 'stability' | 'audit' | 'cron-disabled';
  icon: LucideIcon;
  title: string;
  desc: string;
  time: number;
  color: string;
}

interface LogsData {
  stability: StabilityEvent[];
  audit: AuditLog[];
}

// ─── helpers ───

function toMs(ts: string | number | undefined): number {
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') {
    const d = new Date(ts).getTime();
    return isNaN(d) ? 0 : d;
  }
  return 0;
}

function relativeTime(ms: number): string {
  if (!ms) return '';
  const diff = Date.now() - ms;
  if (diff < 0) return '未来';
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}天前`;
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// ─── component ───

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [readHash, setReadHash] = useState<string>(() => localStorage.getItem('oc-notif-read') ?? '');
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const loadData = async () => {
    setLoading(true);
    try {
      const [cronData, runsData, logsData] = await Promise.all([
        fetchJson<{ jobs: CronJob[] }>('/cron').catch(() => ({ jobs: [] as CronJob[] })),
        fetchJson<{ runs: CronRun[] }>('/cron/runs').catch(() => ({ runs: [] as CronRun[] })),
        fetchJson<LogsData>('/logs').catch(() => ({ stability: [], audit: [] } as LogsData)),
      ]);

      const notifs: NotificationItem[] = [];

      // 1. Cron 任务失败（最近 5 条失败记录）
      const jobNameMap = new Map<string, string>();
      for (const j of cronData.jobs) jobNameMap.set(j.id ?? '', j.name ?? j.id ?? '');
      const failedRuns = runsData.runs
        .filter((r) => {
          const st = String(r.status ?? '').toLowerCase();
          return st === 'failed' || st === 'error' || st === 'timed_out';
        })
        .slice(0, 5);
      for (const r of failedRuns) {
        const runMs = r.runAtMs ?? r.ts ?? r.startedAtMs ?? 0;
        const jobName = (r.jobId && jobNameMap.get(r.jobId)) || r.name || r.jobId || '未知';
        notifs.push({
          id: `cron-run-${runMs}-${r.jobId ?? r.name}`,
          type: 'cron-fail',
          icon: AlertTriangle,
          title: `任务失败：${jobName}`,
          desc: (r.error || r.summary || `状态：${r.status}`).slice(0, 100),
          time: runMs,
          color: 'text-status-error',
        });
      }

      // 2. Cron 任务被禁用
      const disabledJobs = cronData.jobs.filter((j) => j.enabled === false);
      for (const j of disabledJobs) {
        notifs.push({
          id: `cron-disabled-${j.id ?? j.name}`,
          type: 'cron-disabled',
          icon: X,
          title: `任务已禁用：${j.name || '未知'}`,
          desc: '该定时任务当前未启用',
          time: toMs(j.lastRunAtMs),
          color: 'text-cl-text-muted',
        });
      }

      // 3. 稳定性事件（最近 8 条）
      for (const s of logsData.stability.slice(0, 8)) {
        notifs.push({
          id: `stability-${s.timestamp}-${s.event}`,
          type: 'stability',
          icon: Zap,
          title: `稳定性事件：${s.event}`,
          desc: s.detail.slice(0, 100),
          time: toMs(s.timestamp),
          color: 'text-status-warning',
        });
      }

      // 4. 配置审计（最近 5 条）
      for (const a of logsData.audit.slice(0, 5)) {
        notifs.push({
          id: `audit-${a.timestamp}-${a.path}`,
          type: 'audit',
          icon: ShieldCheck,
          title: `配置变更：${a.action}`,
          desc: a.path || a.detail.slice(0, 80),
          time: toMs(a.timestamp),
          color: 'text-brand',
        });
      }

      // 按时间倒序
      notifs.sort((a, b) => b.time - a.time);
      setItems(notifs);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) loadData();
  }, [open]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // 定时刷新（即使关闭也刷新，保证红点准确）
  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 60_000);
    return () => clearInterval(timer);
  }, []);

  // 未读数
  const unread = items.filter((it) => !readHash.includes(it.id)).length;

  const markAllRead = () => {
    const newHash = items.map((i) => i.id).join('|');
    setReadHash(newHash);
    localStorage.setItem('oc-notif-read', newHash);
  };

  const handleClick = (it: NotificationItem) => {
    setOpen(false);
    if (it.type === 'cron-fail' || it.type === 'cron-disabled') {
      navigate('/cron');
    } else if (it.type === 'stability') {
      navigate('/logs');
    } else if (it.type === 'audit') {
      navigate('/logs');
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="p-2.5 rounded-lg text-cl-text-muted hover:text-cl-text-primary hover:bg-surface-hover transition-all duration-fast ease-cl-out relative"
        title="通知中心"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-status-error text-white text-[10px] font-medium flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 max-h-[70vh] bg-surface border border-cl-border-faint rounded-xl shadow-lg overflow-hidden flex flex-col z-50 animate-slide-up">
          {/* header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-cl-border-faint">
            <div className="flex items-center gap-2">
              <Bell size={15} className="text-cl-text-muted" />
              <span className="label-large text-cl-text-primary">通知中心</span>
              {unread > 0 && (
                <span className="cl-badge cl-badge-error">{unread} 条未读</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="label-small text-brand hover:underline flex items-center gap-1"
                >
                  <CheckCircle2 size={12} />
                  全部已读
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-surface-hover text-cl-text-muted"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* list */}
          <div className="flex-1 overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="p-8 text-center">
                <p className="body-small text-cl-text-muted">加载中...</p>
              </div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center flex flex-col items-center gap-2">
                <CheckCircle2 size={28} className="text-status-success" />
                <p className="body-small text-cl-text-muted">全部正常，暂无通知</p>
              </div>
            ) : (
              items.map((it) => {
                const isUnread = !readHash.includes(it.id);
                const Icon = it.icon;
                return (
                  <button
                    key={it.id}
                    onClick={() => handleClick(it)}
                    className={`w-full text-left px-4 py-3 border-b border-cl-border-faint/50 hover:bg-surface-hover transition-colors duration-fast ease-cl-out flex gap-3 ${
                      isUnread ? 'bg-brand/5' : ''
                    }`}
                  >
                    <div className={`shrink-0 mt-0.5 ${it.color}`}>
                      <Icon size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="label-medium text-cl-text-primary truncate">{it.title}</p>
                        <span className="label-small text-cl-text-faint shrink-0">{relativeTime(it.time)}</span>
                      </div>
                      <p className="label-small text-cl-text-muted mt-0.5 line-clamp-2">{it.desc}</p>
                    </div>
                    {isUnread && <span className="w-2 h-2 rounded-full bg-brand shrink-0 mt-1.5" />}
                  </button>
                );
              })
            )}
          </div>

          {/* footer */}
          <div className="px-4 py-2.5 border-t border-cl-border-faint bg-bg-tertiary/50">
            <button
              onClick={() => { setOpen(false); navigate('/logs'); }}
              className="w-full text-center label-small text-brand hover:underline"
            >
              查看全部日志 →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
