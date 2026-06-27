export interface GatewayInfo {
  mode: string;
  url: string;
  reachable: boolean;
  connectLatencyMs: number;
  self: {
    host: string;
    ip: string;
    version: string;
    platform: string;
    instanceId: string;
  };
}

export interface AgentInfo {
  id: string;
  name: string;
  workspaceDir: string;
  bootstrapPending: boolean;
  sessionsCount: number;
  lastUpdatedAt: number;
  lastActiveAgeMs: number;
}

export interface SessionSummary {
  key: string;
  sessionKey: string;
  sessionId: string;
  agentId: string;
  state: string;
  active: boolean;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  updatedAtMs?: number;
}

export interface CronJob {
  id: string;
  name: string;
  enabled: boolean;
  agentId: string;
  schedule: {
    kind: string;
    expr: string;
    tz: string;
  };
  state?: {
    nextRunAtMs?: number;
    lastRunAtMs?: number;
    lastRunStatus?: string;
    lastDurationMs?: number;
  };
}

export interface PluginInfo {
  name: string;
  version?: string;
  enabled: boolean;
  description?: string;
}

export interface MemoryFile {
  name: string;
  size: number;
  modified: string;
}

export interface SystemStatus {
  runtimeVersion: string;
  gateway: GatewayInfo;
  agents: {
    defaultId: string;
    agents: AgentInfo[];
    totalSessions: number;
  };
  sessions: {
    count: number;
    defaults: {
      model: string;
      contextTokens: number;
    };
    recent: Array<{
      key: string;
      agentId: string;
      sessionId: string;
      model?: string;
      updatedAt: number;
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    }>;
  };
  tasks: {
    total: number;
    active: number;
    terminal: number;
    failures: number;
    byStatus: Record<string, number>;
    byRuntime: Record<string, number>;
  };
  cronJobs: CronJob[];
  plugins: PluginInfo[];
  memoryFiles: MemoryFile[];
  memoryFileCount: number;
  vectorDbCount: number;
}
