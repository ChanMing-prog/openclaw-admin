import { useState, useEffect, useMemo } from 'react';
import {
  Zap,
  RefreshCw,
  Search,
  Power,
  PowerOff,
  Package,
  Filter,
  Blocks,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { fetchJson } from '@/lib/api';

// ─── types ───

interface PluginItem {
  name: string;
  version?: string;
  enabled: boolean;
  description?: string;
  slot?: string;
}

interface SkillItem {
  name: string;
  description?: string;
  emoji?: string;
  eligible: boolean;
  disabled: boolean;
  source: string;
  bundled: boolean;
  homepage?: string;
  missing?: {
    bins?: string[];
    env?: string[];
    config?: string[];
    os?: string[];
  };
}

interface ExtensionItem {
  name: string;
  description: string;
  type: string;
  path: string;
}

// ─── Chinese translations for known plugins ───
const PLUGIN_ZH: Record<string, string> = {
  'Active Memory': '活跃记忆：在对话回复前运行记忆子代理，注入相关记忆到上下文',
  '@openclaw/memory-core': '记忆核心：向量数据库存储与检索引擎',
  '@openclaw/xiaomi-provider': '小米模型提供者：接入小米大模型 API',
  '@openclaw/admin-http-rpc': '管理 HTTP RPC：提供管理后台 API 接口',
  '@openclaw/alibaba-provider': '阿里云模型提供者：接入通义千问等模型',
  '@openclaw/anthropic-provider': 'Anthropic 模型提供者：接入 Claude 系列模型',
  'Azure Speech': 'Azure 语音：文本转语音（MP3、语音消息、电话音频）',
  'DingTalk Channel': '钉钉渠道：OpenClaw 钉钉官方连接插件',
  '@larksuite/openclaw-lark': '飞书渠道：OpenClaw 飞书/Lark 连接插件',
  'Feishu Channel': '飞书渠道：飞书消息收发与群聊管理',
  'OpenClaw Web UI': 'Web 界面：基于浏览器的聊天交互界面',
};

// ─── Chinese translations for known skills ───
const SKILL_ZH: Record<string, string> = {
  'guancli': '观远BI 数据分析：查询 ETL、数据集、仪表板、卡片、血缘、SQL、指标等',
  'guanvis': '观远BI 可视化：新建/修改图表卡片、筛选器、仪表板布局',
  'dws': '钉钉能力管理：AI表格、日历、通讯录、群聊、待办、审批、考勤、日志等',
  'dws-cli': '钉钉 CLI：通过命令行管理钉钉产品能力',
  'Agent Browser': '浏览器自动化：无头浏览器导航、点击、输入、页面快照',
  'baidu-baike-data': '百度百科：查询权威百科知识数据',
  'baidu-web-search': '百度搜索：通过千帆 API 实时网络检索',
  'canvas': '画布展示：在连接的节点上展示 HTML、导航、截图',
  'diagram-maker': '图表制作：生成 SVG/HTML 或 Excalidraw 架构图、流程图',
  'memory-hygiene': '记忆清理：审计、清理和优化向量记忆库',
  'orchestrator': '技能编排：多技能协作调度、共享状态管理',
  'proactive-agent': '主动代理：从任务执行者转变为主动预测型伙伴',
  'Productivity': '生产力工具：计划、专注、目标管理与时间分块',
  'self-improvement': '自我改进：捕获经验、错误和修正以持续优化',
  'skill-creator': '技能创建：创建自定义技能的指南',
  'skill-vetter': '技能审查：安装前的安全审查',
  'summarize': '摘要生成：对 URL 或文件进行智能摘要',
  'tavily': 'AI 搜索：使用 Tavily API 进行深度网络搜索',
  'Tools': '工具偏好：学习并适应用户的工具使用习惯',
  'find-skills': '技能发现：帮助用户发现和安装新技能',
  'general-marketing-operations-xiaohongshu': '小红书运营：内容发布、搜索、互动、数据采集',
  'lark-base': '飞书多维表格：建表、字段管理、记录读写、视图配置',
  'lark-calendar': '飞书日历：日程管理、参会人、忙闲查询、会议室预定',
  'lark-doc': '飞书云文档：创建和编辑飞书文档',
  'lark-drive': '飞书云空间：文件上传下载、文件夹管理、权限管理',
  'lark-im': '飞书即时通讯：收发消息、管理群聊、上传下载文件',
  'lark-mail': '飞书邮箱：收发邮件、管理草稿、搜索邮件',
  'lark-minutes': '飞书妙记：查询会议纪要、下载音视频、获取 AI 摘要',
  'lark-okr': '飞书 OKR：管理目标与关键结果',
  'lark-sheets': '飞书电子表格：创建和操作电子表格',
  'lark-task': '飞书任务：创建待办、拆分子任务、分配协作',
  'lark-vc': '飞书视频会议：查询会议记录、获取会议纪要',
  'lark-wiki': '飞书知识库：管理知识空间和文档节点',
  'lark-whiteboard': '飞书画板：查询和编辑画板，导出为图片',
  'lark-slides': '飞书幻灯片：创建和编辑 PPT',
  'lark-approval': '飞书审批：审批实例和任务管理',
  'lark-attendance': '飞书考勤：查询打卡记录',
  'lark-contact': '飞书通讯录：查询组织架构和人员信息',
  'lark-event': '飞书事件订阅：实时监听飞书事件',
  'lark-openapi-explorer': '飞书 OpenAPI 探索：挖掘未封装的原生接口',
  'lark-shared': '飞书 CLI 共享：认证登录、权限管理',
  'lark-skill-maker': '飞书技能创建：封装 API 为可复用技能',
  'lark-workflow-meeting-summary': '会议纪要工作流：汇总会议纪要生成结构化报告',
  'lark-workflow-standup-report': '日程待办摘要：生成日程与未完成任务摘要',
};

// ─── Chinese translations for extensions ───
const EXT_ZH: Record<string, string> = {
  'bi-analytics': '观远BI 数据获取：通过 BI 平台 API 获取数据',
  'vscm-analytics': '领猫SCM：查询款式、BOM、供应商、核价、物料库存等数据',
  'jushuitan-analytics': '聚水潭ERP：查询成品库存数据，支持 SKU 查询和分页',
  'content-collector': '内容收录：自动收集群聊中分享的链接并归档到飞书文档',
  'openclaw-lark': '飞书连接器：OpenClaw 飞书通道插件',
};

// ─── helpers ───

function translatePlugin(name: string, desc?: string): string {
  if (PLUGIN_ZH[name]) return PLUGIN_ZH[name];
  if (desc) return desc.length > 60 ? desc.slice(0, 60) + '...' : desc;
  return name;
}

function translateSkill(name: string, desc?: string): string {
  if (SKILL_ZH[name]) return SKILL_ZH[name];
  if (desc) return desc.length > 60 ? desc.slice(0, 60) + '...' : desc;
  return name;
}

function translateExt(name: string, desc?: string): string {
  if (EXT_ZH[name]) return EXT_ZH[name];
  if (desc) return desc.length > 60 ? desc.slice(0, 60) + '...' : desc;
  return name;
}

function skillStatusLabel(s: SkillItem): { label: string; color: string } {
  if (s.disabled) return { label: '禁用', color: 'cl-badge-error' };
  if (!s.eligible) return { label: '未就绪', color: 'cl-badge-warning' };
  return { label: '可用', color: 'cl-badge-success' };
}

function pluginSourceLabel(s: PluginItem): string {
  if (s.slot === 'memory-core') return '记忆核心';
  if (s.slot === 'channel') return '渠道';
  if (s.slot === 'provider') return '模型';
  if (s.slot) return s.slot;
  return '插件';
}

function sourceLabel(source: string): string {
  const map: Record<string, string> = {
    'openclaw-bundled': '内置',
    'openclaw-workspace': '工作区',
    'openclaw-extra': '扩展包',
    'openclaw-managed': '托管',
    'agents-skills-personal': '个人',
    'agents-skills-project': '项目',
  };
  return map[source] ?? source;
}

// ─── components ───

function TabButton({ active, onClick, icon: Icon, label, count }: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  count: number;
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
      <span className={`label-small px-1.5 py-0.5 rounded-md ${
        active ? 'bg-brand/15 text-brand' : 'bg-bg-tertiary text-cl-text-muted'
      }`}>
        {count}
      </span>
    </button>
  );
}

function PluginCard({ plugin }: { plugin: PluginItem }) {
  return (
    <div className="cl-card p-4 animate-slide-up">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <div className={`p-1.5 rounded-lg ${plugin.enabled ? 'bg-status-success/10 text-status-success' : 'bg-cl-text-tertiary/8 text-cl-text-tertiary'}`}>
            <Package size={16} />
          </div>
          <div>
            <p className="label-large text-cl-text-primary">{plugin.name}</p>
            {plugin.version && (
              <p className="label-small text-cl-text-faint">v{plugin.version}</p>
            )}
          </div>
        </div>
        {plugin.enabled ? (
          <span className="cl-badge cl-badge-success">
            <Power size={10} />
            启用
          </span>
        ) : (
          <span className="cl-badge" style={{ backgroundColor: 'var(--cl-bg-tertiary)', color: 'var(--cl-text-muted)' }}>
            <PowerOff size={10} />
            禁用
          </span>
        )}
      </div>
      <p className="body-small text-cl-text-secondary mt-2 line-clamp-2">{translatePlugin(plugin.name, plugin.description)}</p>
      <div className="flex items-center gap-2 mt-3">
        <span className="cl-badge" style={{ backgroundColor: 'var(--cl-bg-tertiary)', color: 'var(--cl-text-muted)' }}>
          {pluginSourceLabel(plugin)}
        </span>
      </div>
    </div>
  );
}

function SkillCard({ skill }: { skill: SkillItem }) {
  const status = skillStatusLabel(skill);
  const missingBins = skill.missing?.bins?.length ?? 0;
  const missingEnv = skill.missing?.env?.length ?? 0;

  return (
    <div className="cl-card p-4 animate-slide-up">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <div className={`p-1.5 rounded-lg text-lg ${skill.eligible && !skill.disabled ? 'bg-status-success/10' : 'bg-cl-text-tertiary/8'}`}>
            {skill.emoji || '🔧'}
          </div>
          <div>
            <p className="label-large text-cl-text-primary">{skill.name}</p>
            <p className="label-small text-cl-text-faint">{sourceLabel(skill.source)}</p>
          </div>
        </div>
        <span className={`cl-badge ${status.color}`}>{status.label}</span>
      </div>
      <p className="body-small text-cl-text-secondary mt-2 line-clamp-3">{translateSkill(skill.name, skill.description)}</p>
      <div className="flex flex-wrap items-center gap-1.5 mt-3">
        {skill.bundled && (
          <span className="cl-badge" style={{ backgroundColor: 'var(--cl-bg-tertiary)', color: 'var(--cl-text-muted)' }}>内置</span>
        )}
        {!skill.bundled && skill.source === 'openclaw-workspace' && (
          <span className="cl-badge cl-badge-brand">工作区</span>
        )}
        {!skill.bundled && (skill.source === 'agents-skills-personal' || skill.source === 'agents-skills-project') && (
          <span className="cl-badge cl-badge-brand">自定义</span>
        )}
        {missingBins > 0 && (
          <span className="cl-badge cl-badge-warning">缺少 {missingBins} 个命令</span>
        )}
        {missingEnv > 0 && (
          <span className="cl-badge cl-badge-warning">缺少 {missingEnv} 个环境变量</span>
        )}
        {skill.homepage && (
          <a
            href={skill.homepage}
            target="_blank"
            rel="noopener noreferrer"
            className="label-small text-brand hover:underline"
          >
            文档 ↗
          </a>
        )}
      </div>
    </div>
  );
}

function ExtensionCard({ ext }: { ext: ExtensionItem }) {
  return (
    <div className="cl-card p-4 animate-slide-up">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-brand/10 text-brand">
            <Blocks size={16} />
          </div>
          <div>
            <p className="label-large text-cl-text-primary">{ext.name}</p>
            <p className="label-small text-cl-text-faint">扩展</p>
          </div>
        </div>
        <span className="cl-badge cl-badge-brand">自定义</span>
      </div>
      <p className="body-small text-cl-text-secondary mt-2 line-clamp-3">{translateExt(ext.name, ext.description)}</p>
    </div>
  );
}

// ─── main ───

export default function Capabilities() {
  const [plugins, setPlugins] = useState<PluginItem[]>([]);
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [extensions, setExtensions] = useState<ExtensionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'plugins' | 'skills' | 'extensions'>('plugins');
  const [search, setSearch] = useState('');
  const [filterEnabled, setFilterEnabled] = useState<'all' | 'enabled' | 'disabled'>('all');

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [pluginData, skillData, extData] = await Promise.all([
        fetchJson<{ plugins: PluginItem[] }>('/plugins').catch(() => ({ plugins: [] as PluginItem[] })),
        fetchJson<{ skills: SkillItem[] }>('/skills').catch(() => ({ skills: [] as SkillItem[] })),
        fetchJson<{ extensions: ExtensionItem[] }>('/extensions').catch(() => ({ extensions: [] as ExtensionItem[] })),
      ]);
      setPlugins(pluginData.plugins);
      setSkills(skillData.skills);
      setExtensions(extData.extensions);
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

  // ─── filter ───
  const filteredPlugins = useMemo(() => {
    return plugins.filter((p) => {
      const zh = translatePlugin(p.name, p.description);
      const matchSearch = search === '' ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        zh.toLowerCase().includes(search.toLowerCase());
      const matchEnabled = filterEnabled === 'all' ||
        (filterEnabled === 'enabled' && p.enabled) ||
        (filterEnabled === 'disabled' && !p.enabled);
      return matchSearch && matchEnabled;
    });
  }, [plugins, search, filterEnabled]);

  const filteredSkills = useMemo(() => {
    return skills.filter((s) => {
      const zh = translateSkill(s.name, s.description);
      const matchSearch = search === '' ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        zh.toLowerCase().includes(search.toLowerCase());
      const matchEnabled = filterEnabled === 'all' ||
        (filterEnabled === 'enabled' && s.eligible && !s.disabled) ||
        (filterEnabled === 'disabled' && (!s.eligible || s.disabled));
      return matchSearch && matchEnabled;
    });
  }, [skills, search, filterEnabled]);

  const filteredExtensions = useMemo(() => {
    return extensions.filter((e) => {
      const zh = translateExt(e.name, e.description);
      return search === '' ||
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        zh.toLowerCase().includes(search.toLowerCase());
    });
  }, [extensions, search]);

  // ─── loading ───
  if (loading && plugins.length === 0 && skills.length === 0) {
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
      </div>
    );
  }

  // ─── error ───
  if (error && plugins.length === 0 && skills.length === 0) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="headline-large text-cl-text-primary">能力中心</h1>
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

  const currentCount = tab === 'plugins' ? filteredPlugins.length : tab === 'skills' ? filteredSkills.length : filteredExtensions.length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="headline-large text-cl-text-primary">能力中心</h1>
          <p className="body-medium text-cl-text-muted mt-1">
            插件、技能与扩展的统一管理视图
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
            <Package size={14} />
          </div>
          <div>
            <p className="label-small text-cl-text-muted">插件</p>
            <p className="label-large text-cl-text-primary">{plugins.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-bg-secondary">
          <div className="p-1.5 rounded-md bg-status-success/10 text-status-success">
            <Zap size={14} />
          </div>
          <div>
            <p className="label-small text-cl-text-muted">技能</p>
            <p className="label-large text-cl-text-primary">{skills.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-bg-secondary">
          <div className="p-1.5 rounded-md bg-status-info/10 text-status-info">
            <Blocks size={14} />
          </div>
          <div>
            <p className="label-small text-cl-text-muted">扩展</p>
            <p className="label-large text-cl-text-primary">{extensions.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-bg-secondary">
          <div className="p-1.5 rounded-md bg-status-warning/10 text-status-warning">
            <Filter size={14} />
          </div>
          <div>
            <p className="label-small text-cl-text-muted">当前视图</p>
            <p className="label-large text-cl-text-primary">{currentCount} 项</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <TabButton
          active={tab === 'plugins'}
          onClick={() => { setTab('plugins'); setSearch(''); setFilterEnabled('all'); }}
          icon={Package}
          label="插件"
          count={plugins.length}
        />
        <TabButton
          active={tab === 'skills'}
          onClick={() => { setTab('skills'); setSearch(''); setFilterEnabled('all'); }}
          icon={Zap}
          label="技能"
          count={skills.length}
        />
        <TabButton
          active={tab === 'extensions'}
          onClick={() => { setTab('extensions'); setSearch(''); setFilterEnabled('all'); }}
          icon={Blocks}
          label="扩展"
          count={extensions.length}
        />
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cl-text-muted" />
          <input
            type="text"
            placeholder={`搜索${tab === 'plugins' ? '插件' : tab === 'skills' ? '技能' : '扩展'}名称或描述...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-bg-secondary border border-cl-border-faint text-cl-text-primary body-small placeholder:text-cl-text-faint focus:outline-none focus:border-brand transition-colors"
          />
        </div>
        {tab !== 'extensions' && (
          <div className="flex gap-1.5">
            {(['all', 'enabled', 'disabled'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilterEnabled(f)}
                className={`cl-chip text-[12px] ${filterEnabled === f ? 'selected' : ''}`}
              >
                {f === 'all' ? '全部' : f === 'enabled' ? '已启用' : '已禁用'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      {tab === 'plugins' && (
        filteredPlugins.length === 0 ? (
          <div className="cl-card p-8 text-center">
            <p className="body-medium text-cl-text-muted">暂无匹配的插件</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
            {filteredPlugins.map((p) => (
              <PluginCard key={p.name} plugin={p} />
            ))}
          </div>
        )
      )}

      {tab === 'skills' && (
        filteredSkills.length === 0 ? (
          <div className="cl-card p-8 text-center">
            <p className="body-medium text-cl-text-muted">暂无匹配的技能</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
            {filteredSkills.map((s) => (
              <SkillCard key={s.name} skill={s} />
            ))}
          </div>
        )
      )}

      {tab === 'extensions' && (
        filteredExtensions.length === 0 ? (
          <div className="cl-card p-8 text-center">
            <p className="body-medium text-cl-text-muted">暂无匹配的扩展</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
            {filteredExtensions.map((e) => (
              <ExtensionCard key={e.name} ext={e} />
            ))}
          </div>
        )
      )}
    </div>
  );
}
