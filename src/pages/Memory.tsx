import { useState, useEffect } from 'react';
import {
  Brain,
  Database,
  FileText,
  Folder,
  RefreshCw,
  Archive,
  Moon,
  Sparkles,
  BookOpen,
  Layers,
  HardDrive,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { fetchJson } from '@/lib/api';

// ─── types ───

interface MemoryArchitecture {
  totalFiles: number;
  rootFileCount: number;
  archiveFileCount: number;
  archiveMonths: string[];
  archiveTotalSize: number;
  dreamingFileCount: number;
  dreamingDeepCount: number;
  dreamingRemCount: number;
  dreamingLightCount: number;
  dreamingDirs: string[];
  dreamingTotalSize: number;
  snapshotFileCount: number;
  memoryDirTotalSize: number;
  chromaDbSize: number;
}

interface VectorBreakdown {
  totalEmbeddings: number;
  categories: Array<{ category: string; count: number }>;
  sources: Array<{ source: string; count: number }>;
}

interface WorkspaceFile {
  exists: boolean;
  size: number;
  lines: number;
  preview: string;
}

interface WorkspaceData {
  files: {
    MEMORY: WorkspaceFile;
    SOUL: WorkspaceFile;
    'SESSION-STATE': WorkspaceFile;
  };
  learnings: {
    files: Array<{ name: string; size: number; modified: string }>;
    totalCount: number;
    totalSize: number;
  };
}

// ─── helpers ───

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}秒前`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}分钟前`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}小时前`;
  return `${Math.round(ms / 86_400_000)}天前`;
}

// ─── sub-components ───

function SectionHeader({ icon: Icon, title, subtitle }: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className="p-2 rounded-lg bg-brand/10">
        <Icon size={18} className="text-brand" />
      </div>
      <div>
        <h2 className="title-large text-cl-text-primary">{title}</h2>
        {subtitle && <p className="label-small text-cl-text-muted mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function FileStatusCard({ name, file, icon: Icon }: {
  name: string;
  file: WorkspaceFile;
  icon: LucideIcon;
}) {
  if (!file.exists) {
    return (
      <div className="p-4 rounded-xl bg-bg-secondary border border-cl-border-faint">
        <div className="flex items-center gap-2 mb-1">
          <Icon size={14} className="text-cl-text-muted" />
          <span className="label-medium text-cl-text-muted">{name}</span>
        </div>
        <p className="body-small text-cl-text-faint">文件不存在</p>
      </div>
    );
  }
  return (
    <div className="p-4 rounded-xl bg-bg-secondary border border-cl-border-faint">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-brand" />
          <span className="label-medium text-cl-text-primary">{name}</span>
        </div>
        <span className="cl-badge cl-badge-success">
          {file.lines} 行
        </span>
      </div>
      <p className="label-small text-cl-text-muted">{formatSize(file.size)}</p>
    </div>
  );
}

function CategoryBar({ category, count, total }: {
  category: string;
  count: number;
  total: number;
}) {
  const percent = total > 0 ? (count / total) * 100 : 0;
  const colorMap: Record<string, string> = {
    fact: 'bg-brand',
    diary: 'bg-status-success',
    memory_doc: 'bg-status-info',
    entity: 'bg-status-warning',
    user_profile: 'bg-brand-light',
    preference: 'bg-status-success/60',
    config: 'bg-cl-text-muted',
  };
  const color = colorMap[category] ?? 'bg-cl-text-tertiary';
  const labelMap: Record<string, string> = {
    fact: '事实',
    diary: '日记',
    memory_doc: '文档',
    entity: '实体',
    user_profile: '用户画像',
    preference: '偏好',
    config: '配置',
  };
  return (
    <div className="flex items-center gap-3">
      <span className="label-medium text-cl-text-secondary w-16 text-right">{labelMap[category] ?? category}</span>
      <div className="flex-1 h-5 rounded-md bg-bg-tertiary overflow-hidden">
        <div
          className={`h-full rounded-md ${color} transition-all duration-700`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="label-small text-cl-text-muted w-12 text-right">{count}</span>
      <span className="label-small text-cl-text-faint w-10 text-right">{percent.toFixed(0)}%</span>
    </div>
  );
}

// ─── main ───

export default function Memory() {
  const [arch, setArch] = useState<MemoryArchitecture | null>(null);
  const [vector, setVector] = useState<VectorBreakdown | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showArch, setShowArch] = useState(true);
  const [showVector, setShowVector] = useState(true);
  const [showLearnings, setShowLearnings] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [archData, vectorData, wsData] = await Promise.all([
        fetchJson<MemoryArchitecture>('/memory/architecture'),
        fetchJson<VectorBreakdown>('/memory/vector-breakdown'),
        fetchJson<WorkspaceData>('/memory/workspace'),
      ]);
      setArch(archData);
      setVector(vectorData);
      setWorkspace(wsData);
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
  if (loading && !arch) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="skeleton h-8 w-48 rounded-lg" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 stagger-children">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="cl-card p-4 space-y-2">
              <div className="skeleton h-4 w-16 rounded-md" />
              <div className="skeleton h-6 w-12 rounded-md" />
            </div>
          ))}
        </div>
        <div className="cl-card p-5 space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton h-5 w-full rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  // ─── error ───
  if (error && !arch) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="headline-large text-cl-text-primary">记忆库</h1>
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

  if (!arch || !vector || !workspace) return null;

  const learningsSize = workspace.learnings.totalSize;
  const recentFiles = workspace.learnings.files
    .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime())
    .slice(0, 10);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="headline-large text-cl-text-primary">记忆库</h1>
          <p className="body-medium text-cl-text-muted mt-1">
            记忆系统架构、向量数据库与工作区状态
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

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 stagger-children">
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-bg-secondary">
          <div className="p-1.5 rounded-md bg-brand/10 text-brand">
            <Database size={14} />
          </div>
          <div>
            <p className="label-small text-cl-text-muted">向量记录</p>
            <p className="label-large text-cl-text-primary">{vector.totalEmbeddings}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-bg-secondary">
          <div className="p-1.5 rounded-md bg-status-success/10 text-status-success">
            <FileText size={14} />
          </div>
          <div>
            <p className="label-small text-cl-text-muted">日记文件</p>
            <p className="label-large text-cl-text-primary">{arch.rootFileCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-bg-secondary">
          <div className="p-1.5 rounded-md bg-status-info/10 text-status-info">
            <Archive size={14} />
          </div>
          <div>
            <p className="label-small text-cl-text-muted">归档文件</p>
            <p className="label-large text-cl-text-primary">{arch.archiveFileCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-bg-secondary">
          <div className="p-1.5 rounded-md bg-status-warning/10 text-status-warning">
            <HardDrive size={14} />
          </div>
          <div>
            <p className="label-small text-cl-text-muted">总存储</p>
            <p className="label-large text-cl-text-primary">{formatSize(arch.memoryDirTotalSize)}</p>
          </div>
        </div>
      </div>

      {/* Workspace Core Files */}
      <div className="cl-card p-5 animate-slide-up">
        <SectionHeader icon={FileText} title="核心文件" subtitle="记忆系统入口文件" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <FileStatusCard name="MEMORY.md" file={workspace.files.MEMORY} icon={BookOpen} />
          <FileStatusCard name="SOUL.md" file={workspace.files.SOUL} icon={Sparkles} />
          <FileStatusCard name="SESSION-STATE.md" file={workspace.files['SESSION-STATE']} icon={Layers} />
        </div>
      </div>

      {/* Vector Database Breakdown */}
      <div className="cl-card p-5 animate-slide-up">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setShowVector(!showVector)}
        >
          <SectionHeader icon={Database} title="向量数据库" subtitle={`${vector.totalEmbeddings} 条向量 · ${formatSize(arch.chromaDbSize)}`} />
          {showVector ? <ChevronDown size={18} className="text-cl-text-muted" /> : <ChevronRight size={18} className="text-cl-text-muted" />}
        </div>
        {showVector && (
          <div className="space-y-5">
            {/* Categories */}
            <div>
              <p className="label-medium text-cl-text-muted mb-3">分类分布</p>
              <div className="space-y-2">
                {vector.categories.map((cat) => (
                  <CategoryBar
                    key={cat.category}
                    category={cat.category}
                    count={cat.count}
                    total={vector.totalEmbeddings}
                  />
                ))}
              </div>
            </div>
            {/* Sources */}
            {vector.sources.length > 0 && (
              <div>
                <p className="label-medium text-cl-text-muted mb-3">来源分布 (Top 10)</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {vector.sources.slice(0, 10).map((src) => (
                    <div
                      key={src.source}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-bg-secondary"
                    >
                      <span className="label-small text-cl-text-secondary truncate max-w-[300px]" title={src.source}>
                        {src.source}
                      </span>
                      <span className="label-small text-cl-text-primary font-medium">{src.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Directory Architecture */}
      <div className="cl-card p-5 animate-slide-up">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setShowArch(!showArch)}
        >
          <SectionHeader icon={Folder} title="目录架构" subtitle="memory/ 目录结构" />
          {showArch ? <ChevronDown size={18} className="text-cl-text-muted" /> : <ChevronRight size={18} className="text-cl-text-muted" />}
        </div>
        {showArch && (
          <div className="space-y-3">
            {/* Root */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-bg-secondary">
              <div className="flex items-center gap-2.5">
                <Folder size={16} className="text-brand" />
                <span className="label-large text-cl-text-primary">memory/</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="label-small text-cl-text-muted">{arch.rootFileCount} 个日记</span>
                <span className="label-small text-cl-text-muted">{formatSize(arch.memoryDirTotalSize)}</span>
              </div>
            </div>

            {/* Archive */}
            <div className="ml-4 p-3 rounded-lg bg-bg-secondary">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Archive size={14} className="text-status-info" />
                  <span className="label-large text-cl-text-primary">archive/</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="label-small text-cl-text-muted">{arch.archiveFileCount} 个文件</span>
                  <span className="label-small text-cl-text-muted">{formatSize(arch.archiveTotalSize)}</span>
                </div>
              </div>
              {arch.archiveMonths.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2 ml-6">
                  {arch.archiveMonths.map((month) => (
                    <span key={month} className="cl-badge cl-badge-info">{month}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Dreaming */}
            <div className="ml-4 p-3 rounded-lg bg-bg-secondary">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Moon size={14} className="text-brand-light" />
                  <span className="label-large text-cl-text-primary">dreaming/</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="label-small text-cl-text-muted">{arch.dreamingFileCount} 个文件</span>
                  <span className="label-small text-cl-text-muted">{formatSize(arch.dreamingTotalSize)}</span>
                </div>
              </div>
              <div className="ml-6 mt-2 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="label-small text-cl-text-secondary">deep/</span>
                  <span className="label-small text-cl-text-muted">{arch.dreamingDeepCount} 个</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="label-small text-cl-text-secondary">rem/</span>
                  <span className="label-small text-cl-text-muted">{arch.dreamingRemCount} 个</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="label-small text-cl-text-secondary">light/</span>
                  <span className="label-small text-cl-text-muted">{arch.dreamingLightCount} 个</span>
                </div>
              </div>
            </div>

            {/* Snapshots */}
            {arch.snapshotFileCount > 0 && (
              <div className="ml-4 p-3 rounded-lg bg-bg-secondary">
                <div className="flex items-center gap-2.5">
                  <Layers size={14} className="text-status-warning" />
                  <span className="label-large text-cl-text-primary">snapshots/</span>
                  <span className="label-small text-cl-text-muted">{arch.snapshotFileCount} 个文件</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* .learnings */}
      <div className="cl-card p-5 animate-slide-up">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setShowLearnings(!showLearnings)}
        >
          <SectionHeader icon={Brain} title="经验积累" subtitle={`.learnings/ · ${workspace.learnings.totalCount} 个文件 · ${formatSize(learningsSize)}`} />
          {showLearnings ? <ChevronDown size={18} className="text-cl-text-muted" /> : <ChevronRight size={18} className="text-cl-text-muted" />}
        </div>
        {showLearnings && (
          <div className="space-y-2">
            {recentFiles.map((f) => (
              <div
                key={f.name}
                className="flex items-center justify-between p-3 rounded-lg bg-bg-secondary"
              >
                <div className="flex items-center gap-2.5">
                  <FileText size={14} className="text-brand" />
                  <span className="label-large text-cl-text-primary">{f.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="label-small text-cl-text-muted">{formatSize(f.size)}</span>
                  <span className="label-small text-cl-text-faint">
                    {formatDuration(Date.now() - new Date(f.modified).getTime())}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
