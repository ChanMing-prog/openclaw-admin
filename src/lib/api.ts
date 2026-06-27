import type { SystemStatus, CronJob, PluginInfo, AgentInfo } from '@/types';

const BASE = '/api';

export async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAgent(raw: any): AgentInfo {
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? raw.id ?? ''),
    workspaceDir: String(raw.workspaceDir ?? ''),
    bootstrapPending: Boolean(raw.bootstrapPending),
    sessionsCount: Number(raw.sessionsCount ?? 0),
    lastUpdatedAt: Number(raw.lastUpdatedAt ?? 0),
    lastActiveAgeMs: Number(raw.lastActiveAgeMs ?? 0),
  };
}

export async function fetchSystemStatus(): Promise<SystemStatus> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [status, cronData, pluginsData, memoryArchData, vectorData] =
    await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fetchJson<any>('/status'),
      fetchJson<{ jobs: CronJob[] }>('/cron').catch(() => ({ jobs: [] as CronJob[] })),
      fetchJson<{ plugins: PluginInfo[] }>('/plugins').catch(() => ({
        plugins: [] as PluginInfo[],
      })),
      fetchJson<{ totalFiles: number }>('/memory/architecture').catch(() => ({
        totalFiles: 0,
      })),
      fetchJson<{ count: number }>('/memory/vector-count').catch(() => ({
        count: 0,
      })),
    ]);

  return {
    runtimeVersion: String(status.runtimeVersion ?? ''),
    gateway: {
      mode: String(status.gateway?.mode ?? ''),
      url: String(status.gateway?.url ?? ''),
      reachable: Boolean(status.gateway?.reachable),
      connectLatencyMs: Number(status.gateway?.connectLatencyMs ?? 0),
      self: {
        host: String(status.gateway?.self?.host ?? ''),
        ip: String(status.gateway?.self?.ip ?? ''),
        version: String(status.gateway?.self?.version ?? ''),
        platform: String(status.gateway?.self?.platform ?? ''),
        instanceId: String(status.gateway?.self?.instanceId ?? ''),
      },
    },
    agents: {
      defaultId: String(status.agents?.defaultId ?? ''),
      agents: (status.agents?.agents ?? []).map(mapAgent),
      totalSessions: Number(status.agents?.totalSessions ?? 0),
    },
    sessions: {
      count: Number(status.sessions?.count ?? 0),
      defaults: {
        model: String(status.sessions?.defaults?.model ?? ''),
        contextTokens: Number(status.sessions?.defaults?.contextTokens ?? 0),
      },
      recent: (status.sessions?.recent ?? []).map((s: Record<string, unknown>) => ({
        key: String(s.key ?? ''),
        agentId: String(s.agentId ?? ''),
        sessionId: String(s.sessionId ?? ''),
        model: s.model ? String(s.model) : undefined,
        updatedAt: Number(s.updatedAt ?? 0),
        inputTokens: s.inputTokens ? Number(s.inputTokens) : undefined,
        outputTokens: s.outputTokens ? Number(s.outputTokens) : undefined,
        totalTokens: s.totalTokens ? Number(s.totalTokens) : undefined,
      })),
    },
    tasks: {
      total: Number(status.tasks?.total ?? 0),
      active: Number(status.tasks?.active ?? 0),
      terminal: Number(status.tasks?.terminal ?? 0),
      failures: Number(status.tasks?.failures ?? 0),
      byStatus: (status.tasks?.byStatus ?? {}) as Record<string, number>,
      byRuntime: (status.tasks?.byRuntime ?? {}) as Record<string, number>,
    },
    cronJobs: cronData.jobs,
    plugins: pluginsData.plugins,
    memoryFiles: [],
    memoryFileCount: memoryArchData.totalFiles,
    vectorDbCount: vectorData.count,
  };
}
