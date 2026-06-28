import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, Minus, HelpCircle, Coins, Zap, Hash, Database } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { fetchJson } from '@/lib/api';

// ─── types ───

interface UsagePeriod {
  key: 'today' | 'yesterday' | '3d' | '7d' | '30d';
  label: string;
  tokens: number;
  estimatedCost: number;
  requests: number;
  pace: { label: string; state: 'rising' | 'steady' | 'cooling' | 'unknown' };
}

interface UsageBreakdownRow {
  key: string;
  label: string;
  tokens: number;
  estimatedCost: number;
  requests: number;
  sessions: number;
}

interface UsageCostData {
  generatedAt: string;
  periods: UsagePeriod[];
  breakdown: {
    byAgent: UsageBreakdownRow[];
    byModel: UsageBreakdownRow[];
    byProvider: UsageBreakdownRow[];
    bySessionType: UsageBreakdownRow[];
    byCronJob: UsageBreakdownRow[];
  };
  totalEvents: number;
  sourceConnected: boolean;
}

type Dimension = 'byAgent' | 'byModel' | 'byProvider' | 'bySessionType' | 'byCronJob';

const DIMENSION_LABELS: Record<Dimension, string> = {
  byAgent: '按 Agent',
  byModel: '按模型',
  byProvider: '按 Provider',
  bySessionType: '按会话类型',
  byCronJob: '按 Cron 任务',
};

// ─── helpers ───

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

function formatCost(n: number): string {
  if (n === 0) return '¥0';
  if (n < 0.01) return `¥${n.toFixed(4)}`;
  return `¥${n.toFixed(2)}`;
}

const PACE_META: Record<UsagePeriod['pace']['state'], { icon: LucideIcon; color: string }> = {
  rising: { icon: TrendingUp, color: 'text-status-error' },
  steady: { icon: Minus, color: 'text-status-success' },
  cooling: { icon: TrendingDown, color: 'text-cl-info' },
  unknown: { icon: HelpCircle, color: 'text-cl-text-muted' },
};

// ─── period card ───

function PeriodCard({ period }: { period: UsagePeriod }) {
  const pace = PACE_META[period.pace.state];
  const PaceIcon = pace.icon;
  return (
    <div className="cl-card p-5 animate-slide-up">
      <div className="flex items-center justify-between mb-3">
        <span className="label-medium text-cl-text-muted">{period.label}</span>
        <span className={`inline-flex items-center gap-1 text-xs ${pace.color}`}>
          <PaceIcon size={12} />
          {period.pace.label}
        </span>
      </div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-2xl font-semibold text-cl-text-primary tabular-nums">
          {formatTokens(period.tokens)}
        </span>
        <span className="label-small text-cl-text-muted">tokens</span>
      </div>
      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-cl-border-faint">
        <div className="flex items-center gap-1.5">
          <Coins size={13} className="text-cl-text-muted" />
          <span className="label-small text-cl-text-secondary tabular-nums">
            {formatCost(period.estimatedCost)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Hash size={13} className="text-cl-text-muted" />
          <span className="label-small text-cl-text-secondary tabular-nums">
            {formatNumber(period.requests)} 请求
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── breakdown row ───

function BreakdownRow({ row, max }: { row: UsageBreakdownRow; max: number }) {
  const percent = max > 0 ? Math.round((row.tokens / max) * 100) : 0;
  return (
    <div className="py-3 border-b border-cl-border-faint last:border-b-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="body-medium text-cl-text-primary truncate pr-3">{row.label}</span>
        <span className="label-small text-cl-text-muted tabular-nums whitespace-nowrap">
          {formatTokens(row.tokens)} · {formatNumber(row.requests)} 次 · {row.sessions} 会话
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-hover overflow-hidden">
        <div
          className="h-full rounded-full bg-brand transition-all duration-normal ease-cl-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

// ─── main ───

export default function Usage() {
  const [data, setData] = useState<UsageCostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dim, setDim] = useState<Dimension>('byAgent');

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const d = await fetchJson<UsageCostData>('/usage-cost');
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

  const rows = useMemo(() => {
    if (!data) return [] as UsageBreakdownRow[];
    return data.breakdown[dim] ?? [];
  }, [data, dim]);

  const maxTokens = useMemo(() => rows.reduce((m, r) => Math.max(m, r.tokens), 0), [rows]);

  // ─── loading ───
  if (loading && !data) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="skeleton h-8 w-48 rounded-lg" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 stagger-children">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="cl-card p-5 space-y-3">
              <div className="skeleton h-3 w-20 rounded-md" />
              <div className="skeleton h-7 w-24 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="headline-large text-cl-text-primary">用量中心</h1>
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

  if (data && !data.sourceConnected) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="headline-large text-cl-text-primary">用量中心</h1>
        <div className="cl-card p-8 flex flex-col items-center justify-center min-h-[240px]">
          <Database size={32} className="text-cl-text-muted mb-3" />
          <p className="body-medium text-cl-text-secondary mb-1">未检测到用量数据</p>
          <p className="label-medium text-cl-text-muted">
            扫描 ~/.openclaw/agents/*/sessions/*.jsonl 未找到 assistant message usage 记录
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="headline-large text-cl-text-primary">用量中心</h1>
          <p className="body-medium text-cl-text-muted mt-1">
            Token 消耗与花费趋势 · 近 30 日 {formatNumber(data?.totalEvents ?? 0)} 条用量记录
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

      {/* Period cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 stagger-children">
        {data?.periods.map((p) => (
          <PeriodCard key={p.key} period={p} />
        ))}
      </div>

      {/* Breakdown */}
      <div className="cl-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Zap size={16} className="text-cl-text-muted" />
          <h2 className="title-medium text-cl-text-primary">维度拆分（近 30 日）</h2>
        </div>

        {/* dimension tabs */}
        <div className="flex flex-wrap gap-1 mb-4 p-1 bg-surface-hover rounded-lg w-fit">
          {(Object.keys(DIMENSION_LABELS) as Dimension[]).map((d) => (
            <button
              key={d}
              onClick={() => setDim(d)}
              className={`px-3 py-1.5 rounded-md label-medium transition-all duration-fast ease-cl-out ${
                dim === d
                  ? 'bg-surface text-cl-text-primary shadow-xs'
                  : 'text-cl-text-muted hover:text-cl-text-secondary'
              }`}
            >
              {DIMENSION_LABELS[d]}
            </button>
          ))}
        </div>

        {/* rows */}
        {rows.length === 0 ? (
          <div className="py-8 text-center">
            <p className="label-medium text-cl-text-muted">该维度暂无数据</p>
          </div>
        ) : (
          <div>
            {rows.map((r) => (
              <BreakdownRow key={r.key} row={r} max={maxTokens} />
            ))}
          </div>
        )}
      </div>

      <p className="label-small text-cl-text-muted text-center">
        数据来源：~/.openclaw/agents/*/sessions/*.jsonl · 10 秒缓存 · 30 秒自动刷新
      </p>
    </div>
  );
}
