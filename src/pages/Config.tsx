import { useState, useEffect, useMemo } from 'react';
import {
  RefreshCw,
  Search,
  Server,
  Cpu,
  Bot,
  Radio,
  Network,
  Brain,
  Puzzle,
  Wrench,
  Shield,
  Webhook,
  Link2,
  Hash,
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { fetchJson } from '@/lib/api';

// ─── types ───

type ConfigData = Record<string, unknown>;

// ─── 区块定义 ───

interface SectionDef {
  key: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

const SECTIONS: SectionDef[] = [
  { key: 'meta', label: '运行时元数据', icon: Hash, description: '版本与最后修改时间' },
  { key: 'models', label: '模型配置', icon: Cpu, description: 'Provider、模型列表与默认模型' },
  { key: 'agents', label: 'Agent 配置', icon: Bot, description: '默认 Agent、并发、超时、记忆检索' },
  { key: 'channels', label: '渠道', icon: Radio, description: '飞书、钉钉等消息渠道' },
  { key: 'gateway', label: '网关', icon: Network, description: '端口、认证、HTTP 端点' },
  { key: 'memory', label: '记忆', icon: Brain, description: 'QMD 会话记忆设置' },
  { key: 'plugins', label: '插件', icon: Puzzle, description: '插件白名单与启用状态' },
  { key: 'skills', label: '技能', icon: Wrench, description: '技能启用配置' },
  { key: 'tools', label: '工具', icon: Wrench, description: '工具配置、执行权限、循环检测' },
  { key: 'approvals', label: '审批', icon: Shield, description: '执行与插件审批策略' },
  { key: 'hooks', label: '钩子', icon: Webhook, description: '内部钩子注册' },
  { key: 'bindings', label: '绑定', icon: Link2, description: 'Agent 路由绑定' },
  { key: 'messages', label: '消息', icon: Hash, description: '群聊回复、ACK 反应' },
  { key: 'commands', label: '命令', icon: Wrench, description: '原生命令、重启' },
  { key: 'session', label: '会话', icon: Hash, description: 'DM 作用域' },
  { key: 'env', label: '环境变量', icon: Server, description: 'API Key 等环境变量（已脱敏）' },
  { key: 'auth', label: '认证', icon: Shield, description: '认证 Profile' },
  { key: 'wizard', label: '向导', icon: Hash, description: '最近一次诊断信息' },
];

// ─── helpers ───

function isLeafValue(v: unknown): boolean {
  return v === null || typeof v !== 'object';
}

// 判断是否是"键值对全部是叶子"的对象（适合用 key-value 表格展示）
function isFlatObject(obj: unknown): boolean {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const vals = Object.values(obj as Record<string, unknown>);
  return vals.every(isLeafValue);
}

function formatValue(v: unknown): string {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v === '' ? '(空)' : v;
  return JSON.stringify(v);
}

function maskValue(v: string): string {
  if (v.length <= 8) return '••••••';
  return v.slice(0, 4) + '••••' + v.slice(-4);
}

const SENSITIVE = /key|secret|token|password/i;

// ─── components ───

function LeafValue({ k, v }: { k: string; v: unknown }) {
  const [revealed, setRevealed] = useState(false);
  const isStr = typeof v === 'string';
  const isSensitive = isStr && SENSITIVE.test(k) && v.length > 0;
  const display = isSensitive && !revealed ? maskValue(v as string) : formatValue(v);

  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-cl-border-faint last:border-b-0">
      <span className="label-small text-cl-text-faint w-1/3 shrink-0 pt-0.5 break-all">{k}</span>
      <span className={`label-small text-cl-text-primary flex-1 break-all ${isStr && (v as string).length > 80 ? 'font-mono text-xs' : ''}`}>
        {display}
      </span>
      {isSensitive && (
        <button
          onClick={() => setRevealed(!revealed)}
          className="text-cl-text-faint hover:text-cl-text-primary shrink-0 pt-0.5"
          title={revealed ? '隐藏' : '显示'}
        >
          {revealed ? <EyeOff size={11} /> : <Eye size={11} />}
        </button>
      )}
    </div>
  );
}

function TreeView({ data, depth = 0 }: { data: unknown; depth?: number }) {
  if (isLeafValue(data)) {
    return <span className="label-small text-cl-text-primary font-mono">{formatValue(data)}</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="label-small text-cl-text-faint">[] (空数组)</span>;
    return (
      <div className="space-y-1">
        {data.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="label-small text-cl-text-faint w-8 shrink-0 pt-0.5">[{i}]</span>
            <div className="flex-1 min-w-0">
              {isLeafValue(item) ? (
                <LeafValue k={`[${i}]`} v={item} />
              ) : (
                <div className="rounded-md bg-bg-secondary p-2 mt-0.5">
                  <TreeView data={item} depth={depth + 1} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // 对象
  const obj = data as Record<string, unknown>;
  const entries = Object.entries(obj);
  if (entries.length === 0) return <span className="label-small text-cl-text-faint">{} (空对象)</span>;

  // 扁平对象：用 key-value 表格
  if (isFlatObject(obj)) {
    return (
      <div className="rounded-md bg-bg-secondary p-2.5">
        {entries.map(([k, v]) => (
          <LeafValue key={k} k={k} v={v} />
        ))}
      </div>
    );
  }

  // 嵌套对象：递归展示，每个子对象带标题
  return (
    <div className={`space-y-2 ${depth > 0 ? 'pl-3 border-l border-cl-border-faint' : ''}`}>
      {entries.map(([k, v]) => (
        <div key={k}>
          <p className="label-small font-medium text-cl-text-secondary mb-1">{k}</p>
          {isLeafValue(v) ? (
            <div className="pl-3">
              <LeafValue k={k} v={v} />
            </div>
          ) : (
            <TreeView data={v} depth={depth + 1} />
          )}
        </div>
      ))}
    </div>
  );
}

function SectionCard({ def, data, expanded, onToggle }: {
  def: SectionDef;
  data: unknown;
  expanded: boolean;
  onToggle: () => void;
}) {
  // 统计子项数量
  const count = useMemo(() => {
    if (data === null || typeof data !== 'object') return 0;
    if (Array.isArray(data)) return data.length;
    return Object.keys(data as Record<string, unknown>).length;
  }, [data]);

  return (
    <div className="cl-card animate-slide-up overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-surface-hover transition-colors"
      >
        <div className="p-2 rounded-lg bg-brand/10 text-brand shrink-0">
          <def.icon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="label-large text-cl-text-primary">{def.label}</p>
            <span className="cl-badge" style={{ backgroundColor: 'var(--cl-bg-tertiary)', color: 'var(--cl-text-muted)' }}>
              {count}
            </span>
          </div>
          <p className="label-small text-cl-text-muted mt-0.5">{def.description}</p>
        </div>
        {expanded ? (
          <ChevronDown size={16} className="text-cl-text-muted shrink-0" />
        ) : (
          <ChevronRight size={16} className="text-cl-text-muted shrink-0" />
        )}
      </button>
      {expanded && (
        <div className="border-t border-cl-border-faint px-4 py-3 animate-fade-in">
          {data === null || data === undefined ? (
            <p className="body-small text-cl-text-faint">无数据</p>
          ) : (
            <TreeView data={data} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── main ───

export default function Config() {
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchJson<ConfigData>('/config');
      setConfig(data);
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

  const filteredSections = useMemo(() => {
    if (!config) return [];
    return SECTIONS.filter((s) => {
      const matchSearch = search === '' ||
        s.label.toLowerCase().includes(search.toLowerCase()) ||
        s.description.toLowerCase().includes(search.toLowerCase());
      const hasData = config[s.key] !== undefined && config[s.key] !== null;
      return matchSearch && hasData;
    });
  }, [config, search]);

  if (loading && !config) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="skeleton h-8 w-48 rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 stagger-children">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="cl-card p-4 space-y-2">
              <div className="skeleton h-4 w-32 rounded-md" />
              <div className="skeleton h-3 w-48 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error && !config) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="headline-large text-cl-text-primary">系统配置</h1>
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

  if (!config) return null;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="headline-large text-cl-text-primary">系统配置</h1>
          <p className="body-medium text-cl-text-muted mt-1">
            OpenClaw 配置文件只读视图 · {SECTIONS.length} 个区块 · 敏感字段已脱敏
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

      {/* 提示 */}
      <div className="cl-card p-3 flex items-center gap-2.5 bg-brand/5 border-brand/15">
        <Shield size={14} className="text-brand shrink-0" />
        <p className="label-small text-cl-text-secondary">
          只读模式：仅展示 <code className="font-mono text-xs">~/.openclaw/openclaw.json</code> 的当前配置。包含 key/secret/token 的字段已自动脱敏，点击眼睛图标可临时显示。
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cl-text-faint" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索配置区块..."
          className="w-full pl-9 pr-3 py-2 rounded-lg bg-bg-secondary border border-cl-border-faint text-cl-text-primary placeholder:text-cl-text-faint focus:outline-none focus:border-brand/40 body-small"
        />
      </div>

      {/* Sections */}
      <div className="space-y-3">
        {filteredSections.length === 0 ? (
          <div className="cl-card p-8 text-center">
            <p className="body-medium text-cl-text-muted">无匹配配置</p>
          </div>
        ) : (
          filteredSections.map((s) => {
            const isExpanded = expandedKeys.has(s.key);
            return (
              <SectionCard
                key={s.key}
                def={s}
                data={config[s.key]}
                expanded={isExpanded}
                onToggle={() => {
                  setExpandedKeys((prev) => {
                    const next = new Set(prev);
                    if (next.has(s.key)) next.delete(s.key);
                    else next.add(s.key);
                    return next;
                  });
                }}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
