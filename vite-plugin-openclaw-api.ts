import type { Plugin } from 'vite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

// 用户主目录：macOS/Linux 用 HOME，Windows 用 USERPROFILE
const HOME = process.env.HOME ?? process.env.USERPROFILE ?? '~';

// 支持环境变量覆盖 OpenClaw 主目录，默认 ~/.openclaw
const OC_HOME = process.env.OPENCLAW_HOME ? String(process.env.OPENCLAW_HOME) : join(HOME, '.openclaw');

// 系统日志目录：可被 OPENCLAW_SYS_LOGS_DIR 覆盖；否则按平台回退
// macOS: ~/Library/Logs/openclaw（launchd 重定向目标）
// Linux: ~/.local/state/openclaw/logs（systemd 用户级日志常见位置）
// Windows: %LOCALAPPDATA%\openclaw\logs
function resolveSysLogsDir(): string {
  if (process.env.OPENCLAW_SYS_LOGS_DIR) return String(process.env.OPENCLAW_SYS_LOGS_DIR);
  const platform = process.platform;
  if (platform === 'darwin') return join(HOME, 'Library/Logs/openclaw');
  if (platform === 'win32') return join(process.env.LOCALAPPDATA ?? join(HOME, 'AppData/Local'), 'openclaw/logs');
  // Linux/其他：默认 ~/.local/state/openclaw/logs，也可用 XDG_STATE_HOME
  const xdgState = process.env.XDG_STATE_HOME;
  return xdgState ? join(xdgState, 'openclaw/logs') : join(HOME, '.local/state/openclaw/logs');
}

// 以下路径从 openclaw.json 动态读取（workspace 可配置），读不到则回退默认值
let cachedConfig: Record<string, unknown> | null = null;

async function loadConfig(): Promise<Record<string, unknown>> {
  if (cachedConfig) return cachedConfig;
  const raw = await readFile(join(OC_HOME, 'openclaw.json'), 'utf8').catch(() => '{}');
  try {
    cachedConfig = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    cachedConfig = {};
  }
  return cachedConfig!;
}

async function getWorkspace(): Promise<string> {
  const cfg = await loadConfig();
  const agents = cfg.agents as Record<string, unknown> | undefined;
  const defaults = agents?.defaults as Record<string, unknown> | undefined;
  const ws = defaults?.workspace;
  return typeof ws === 'string' && ws ? ws : join(OC_HOME, 'workspace');
}

async function getMemoryDir(): Promise<string> {
  return join(await getWorkspace(), 'memory');
}

async function getLearningsDir(): Promise<string> {
  return join(await getWorkspace(), '.learnings');
}

// 这些路径相对 OC_HOME，通常不可配置
const AGENTS_DIR = join(OC_HOME, 'agents');
const CHROMA_DB = join(OC_HOME, 'memory/chroma_db/chroma.sqlite3');
const SKILLS_DIR = join(OC_HOME, 'skills');
const EXT_DIR = join(OC_HOME, 'extensions');
const OC_STATE_DB = join(OC_HOME, 'state/openclaw.sqlite');
const LOGS_DIR = join(OC_HOME, 'logs');
const SYS_LOGS_DIR = resolveSysLogsDir();

// ─── Filesystem helpers (no CLI needed) ───

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function sqlite3(query: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('sqlite3', [CHROMA_DB, query], { timeout: 5000 });
    return stdout.trim();
  } catch {
    return '';
  }
}

const TASKS_DB = join(OC_HOME, 'tasks/runs.sqlite.migrated');

async function sqlite3Json(db: string, query: string): Promise<unknown[]> {
  try {
    const { stdout } = await execFileAsync('sqlite3', [db, '-json', query], { timeout: 5000 });
    const out = stdout.trim();
    return out ? (JSON.parse(out) as unknown[]) : [];
  } catch {
    return [];
  }
}

async function dirSize(dir: string): Promise<number> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    let total = 0;
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        total += await dirSize(full);
      } else {
        const s = await stat(full);
        total += s.size;
      }
    }
    return total;
  } catch {
    return 0;
  }
}

async function fileCount(dir: string, ext: string): Promise<number> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        count += await fileCount(full, ext);
      } else if (entry.name.endsWith(ext)) {
        count++;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

async function readFileSafe(path: string, maxBytes = 2000): Promise<{ exists: boolean; size: number; lines: number; preview: string }> {
  try {
    const s = await stat(path);
    const content = await readFile(path, 'utf8');
    const lines = content.split('\n').length;
    return { exists: true, size: s.size, lines, preview: content.slice(0, maxBytes) };
  } catch {
    return { exists: false, size: 0, lines: 0, preview: '' };
  }
}

// ─── Direct filesystem readers (bypass CLI) ───

async function readSessions(): Promise<Record<string, unknown>> {
  const sessionsJson = await readJsonFile<Record<string, unknown>>(join(AGENTS_DIR, 'main/sessions/sessions.json'));
  if (!sessionsJson) return { count: 0, defaults: { model: 'unknown', contextTokens: 0 }, recent: [], byAgent: [] };

  const entries = Object.entries(sessionsJson);
  const sessions = entries.map(([key, val]) => {
    const r = val as Record<string, unknown>;
    return {
      key,
      sessionKey: key,
      sessionId: r.sessionId ?? '',
      agentId: key.split(':')[1] ?? 'main',
      kind: key.split(':')[2] ?? 'unknown',
      model: r.model ?? '',
      updatedAt: r.updatedAt ?? 0,
      inputTokens: r.inputTokens ?? 0,
      outputTokens: r.outputTokens ?? 0,
      totalTokens: r.totalTokens ?? 0,
      percentUsed: r.percentUsed ?? null,
      remainingTokens: r.remainingTokens ?? null,
      active: r.active ?? false,
      state: r.state ?? 'unknown',
    };
  });

  sessions.sort((a, b) => (b.updatedAt as number) - (a.updatedAt as number));

  // 默认模型取最近一个有 model 的会话（无 model 的会话是未交互/被中止的，不代表当前模型）
  const defaultModel = sessions.find((s) => s.model)?.model || 'unknown';

  return {
    count: sessions.length,
    defaults: { model: defaultModel, contextTokens: 1048576 },
    recent: sessions,
  };
}

async function readCronJobs(): Promise<unknown[]> {
  // Active cron data lives in state/openclaw.sqlite (cron_jobs table).
  const rows = await sqlite3Json(
    OC_STATE_DB,
    `SELECT job_id, name, description, enabled, delete_after_run, created_at_ms, agent_id, session_key, schedule_kind, schedule_expr, schedule_tz, session_target, wake_mode, payload_kind, payload_message, payload_timeout_seconds, delivery_mode, delivery_channel, delivery_to, delivery_best_effort, next_run_at_ms, last_run_at_ms, last_run_status, last_error, last_duration_ms, consecutive_errors, last_delivery_status FROM cron_jobs ORDER BY next_run_at_ms;`,
  );

  return rows.map((r) => {
    const row = r as Record<string, string | number | null>;
    return {
      id: String(row.job_id ?? ''),
      agentId: String(row.agent_id ?? 'main'),
      sessionKey: String(row.session_key ?? ''),
      name: String(row.name ?? ''),
      description: row.description ? String(row.description) : '',
      enabled: Number(row.enabled ?? 0) !== 0,
      createdAtMs: Number(row.created_at_ms ?? 0),
      schedule: {
        kind: String(row.schedule_kind ?? 'cron'),
        expr: String(row.schedule_expr ?? ''),
        tz: String(row.schedule_tz ?? 'Asia/Shanghai'),
      },
      sessionTarget: String(row.session_target ?? 'isolated'),
      wakeMode: String(row.wake_mode ?? 'now'),
      payload: {
        kind: String(row.payload_kind ?? 'agentTurn'),
        message: row.payload_message ? String(row.payload_message) : '',
        timeoutSeconds: row.payload_timeout_seconds ? Number(row.payload_timeout_seconds) : undefined,
      },
      deleteAfterRun: Number(row.delete_after_run ?? 0) !== 0,
      delivery: row.delivery_mode
        ? {
            mode: String(row.delivery_mode ?? ''),
            channel: row.delivery_channel ? String(row.delivery_channel) : '',
            to: row.delivery_to ? String(row.delivery_to) : '',
            bestEffort: Number(row.delivery_best_effort ?? 0) !== 0,
          }
        : undefined,
      state: {
        nextRunAtMs: Number(row.next_run_at_ms ?? 0),
        lastRunAtMs: Number(row.last_run_at_ms ?? 0),
        lastRunStatus: row.last_run_status ? String(row.last_run_status) : '',
        lastError: row.last_error ? String(row.last_error) : '',
        lastDurationMs: Number(row.last_duration_ms ?? 0),
        consecutiveErrors: Number(row.consecutive_errors ?? 0),
        lastDeliveryStatus: row.last_delivery_status ? String(row.last_delivery_status) : '',
      },
    };
  });
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readCronRuns(): Promise<unknown[]> {
  // Active run records live in state/openclaw.sqlite (cron_run_logs table).
  const rows = await sqlite3Json(
    OC_STATE_DB,
    `SELECT job_id, ts, status, error, summary, delivery_status, delivered, session_id, session_key, run_id, run_at_ms, duration_ms, next_run_at_ms, model, provider, total_tokens FROM cron_run_logs ORDER BY ts DESC LIMIT 200;`,
  );

  return rows.map((r) => {
    const row = r as Record<string, string | number | null>;
    return {
      ts: Number(row.ts ?? 0),
      runAtMs: Number(row.run_at_ms ?? row.ts ?? 0),
      jobId: String(row.job_id ?? ''),
      status: String(row.status ?? ''),
      summary: row.summary ? String(row.summary) : (row.error ? String(row.error) : ''),
      error: row.error ? String(row.error) : '',
      deliveryStatus: String(row.delivery_status ?? ''),
      delivered: Number(row.delivered ?? 0) !== 0,
      sessionId: row.session_id ? String(row.session_id) : '',
      sessionKey: row.session_key ? String(row.session_key) : '',
      runId: row.run_id ? String(row.run_id) : '',
      durationMs: Number(row.duration_ms ?? 0),
      nextRunAtMs: Number(row.next_run_at_ms ?? 0),
      model: row.model ? String(row.model) : '',
      provider: row.provider ? String(row.provider) : '',
      totalTokens: Number(row.total_tokens ?? 0),
    };
  });
}

async function readTaskStats(): Promise<{ total: number; failures: number; active: number; terminal: number }> {
  // Count runs in state/openclaw.sqlite (cron_run_logs table).
  const rows = await sqlite3Json(OC_STATE_DB, `SELECT status FROM cron_run_logs;`);
  const total = rows.length;
  let failures = 0;
  for (const r of rows) {
    const st = String((r as Record<string, unknown>).status ?? '');
    if (st === 'error' || st === 'failed' || st === 'timed_out') failures++;
  }
  return { total, failures, active: 0, terminal: total };
}

async function readLogTail(path: string, maxLines = 200): Promise<string[]> {
  try {
    const content = await readFile(path, 'utf8');
    const lines = content.split('\n').filter((l) => l.trim());
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}

// 错误日志专用读取：合并多行条目（时间戳/[component] 开头作为新条目）+ 去重同类警告
async function readErrorLogTail(path: string, maxEntries = 100): Promise<string[]> {
  try {
    const content = await readFile(path, 'utf8');
    const rawLines = content.split('\n');
    return readErrorLogTailFromLines(rawLines, maxEntries);
  } catch {
    return [];
  }
}

// 从已读取的行列表中合并多行 + 去重同类警告
async function readErrorLogTailFromLines(rawLines: string[], maxEntries = 100): Promise<string[]> {
  // 合并多行：以时间戳 ISO 或 [component] 开头的行视为新条目起始
  const ISO_RE = /^\d{4}-\d{2}-\d{2}T/;
  const COMP_RE = /^\[[a-zA-Z][a-zA-Z0-9_:]*\]/;
  const entries: string[] = [];
  let current = '';
  for (const line of rawLines) {
    if (!line.trim()) {
      if (current) current += '\n';
      continue;
    }
    if (ISO_RE.test(line) || COMP_RE.test(line)) {
      if (current.trim()) entries.push(current.trim());
      current = line;
    } else {
      // 续行：附加到当前条目（保留换行）
      if (current) current += '\n' + line;
      else current = line;
    }
  }
  if (current.trim()) entries.push(current.trim());

  // 取尾部
  const tail = entries.slice(-maxEntries);

  // 按消息模式去重：把动态部分（路径、ID、PID）替换为占位符后作为 key
  // 已知重复模式：Skipping escaped skill path ... requested=<path>
  const SKILL_RE = /(Skipping escaped skill path outside its configured root: source=\S+ root=\S+ reason=\S+) requested=(\S+) resolved=\S+/;
  // Subagent orphan run pruned ... run=<id> child=<id> reason=<reason>
  const ORPHAN_RE = /(Subagent orphan run pruned source=\S+) run=\S+ child=\S+ reason=\S+/;
  const patternMap = new Map<string, { count: number; firstIdx: number; samples: string[]; firstEntry: string }>();
  const deduped: string[] = [];
  for (const entry of tail) {
    let matched = false;
    // 技能逃逸
    const m1 = SKILL_RE.exec(entry);
    if (m1) {
      const skillName = m1[2].split('/').pop() ?? m1[2];
      const pattern = entry.replace(SKILL_RE, '$1 requested=<*> resolved=<*>');
      const existing = patternMap.get(pattern);
      if (existing) {
        existing.count += 1;
        existing.samples.push(skillName);
      } else {
        patternMap.set(pattern, { count: 1, firstIdx: deduped.length, samples: [skillName], firstEntry: entry });
        deduped.push('__PLACEHOLDER__');
      }
      matched = true;
    }
    // 孤儿子代理运行
    if (!matched) {
      const m2 = ORPHAN_RE.exec(entry);
      if (m2) {
        const pattern = entry.replace(ORPHAN_RE, '$1 run=<*> child=<*> reason=<*>');
        const existing = patternMap.get(pattern);
        if (existing) {
          existing.count += 1;
        } else {
          patternMap.set(pattern, { count: 1, firstIdx: deduped.length, samples: [], firstEntry: entry });
          deduped.push('__PLACEHOLDER__');
        }
        matched = true;
      }
    }
    if (!matched) {
      deduped.push(entry);
    }
  }
  // 替换占位符为聚合后的条目
  for (const [, info] of patternMap) {
    if (info.count > 1) {
      const samples = info.samples.filter(Boolean);
      const sampleStr = samples.length > 0
        ? `（涉及：${samples.slice(0, 10).join('、')}${samples.length > 10 ? ` 等 ${samples.length} 个` : ''}）`
        : '';
      deduped[info.firstIdx] = `⚠️ 相同模式警告 × ${info.count}${sampleStr}\n样本：${info.firstEntry}`;
    } else {
      deduped[info.firstIdx] = info.firstEntry;
    }
  }
  return deduped;
}

// 从日志条目中提取 ISO 时间用于排序（支持单行和多行条目）
// 旧格式：[2026-05-21T06:34:24Z] openclaw restart ...
// 新格式：2026-06-28T11:03:50.260+08:00 [gateway] ...
// 聚合格式：⚠️ 相同模式警告 × N\n样本：2026-05-16T15:00:00.165+08:00 ...
// 多行错误：2026-05-16T10:00:00.151+08:00 [skills] ...\n续行...
function extractRestartTime(line: string): string {
  return extractLogTime(line);
}

function extractLogTime(entry: string): string {
  // 优先匹配开头的 ISO 时间（新格式）
  const m1 = /^(\d{4}-\d{2}-\d{2}T\S+)/.exec(entry);
  if (m1) return m1[1];
  // 旧格式：[ISO] ...
  const m2 = /^\[([^\]]+)\]/.exec(entry);
  if (m2) return m2[1];
  // 聚合格式：⚠️ ... \n样本：ISO ...
  const m3 = /样本：(2026-\d{2}-\d{2}T\S+)/.exec(entry);
  if (m3) return m3[1];
  // 聚合格式：⚠️ ... \n样本：[ISO] ...
  const m4 = /样本：\[([^\]]+)\]/.exec(entry);
  if (m4) return m4[1];
  return '';
}

async function readLogs(): Promise<unknown> {
  // 1. 文件列表（合并 ~/.openclaw/logs 和 ~/Library/Logs/openclaw）
  const files: Array<{ name: string; size: number; modified: string; lines: number; location: string }> = [];
  for (const dir of [LOGS_DIR, SYS_LOGS_DIR]) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const full = join(dir, entry.name);
        const s = await stat(full);
        const content = await readFile(full, 'utf8').catch(() => '');
        const lines = content.split('\n').filter((l) => l.trim()).length;
        files.push({
          name: entry.name,
          size: s.size,
          modified: s.mtime.toISOString(),
          lines,
          location: dir === LOGS_DIR ? 'openclaw' : 'system',
        });
      }
    } catch {}
  }

  // 2. 命令日志（commands.log，JSON Lines）
  const commandLines = await readLogTail(join(LOGS_DIR, 'commands.log'), 200);
  const commands = commandLines
    .map((line) => {
      try {
        const obj = JSON.parse(line) as Record<string, unknown>;
        return {
          timestamp: String(obj.timestamp ?? ''),
          action: String(obj.action ?? ''),
          sessionKey: String(obj.sessionKey ?? ''),
          senderId: String(obj.senderId ?? ''),
          source: String(obj.source ?? ''),
        };
      } catch {
        return null;
      }
    })
    .filter((x): x is Record<string, string> => x !== null)
    .reverse();

  // 3. 网关日志尾部（优先读系统位置，回退到旧位置）— 倒序：最新在前
  const sysGateway = await readLogTail(join(SYS_LOGS_DIR, 'gateway.log'), 400);
  const gateway = (sysGateway.length > 0
    ? sysGateway
    : await readLogTail(join(LOGS_DIR, 'gateway.log'), 150)).reverse();

  // 4. 错误/警告日志 — 合并旧位置的历史 + 系统位置的新记录
  //    旧位置 gateway.err.log：2026-03 ~ 2026-05-16（独立错误日志文件）
  //    系统位置 gateway.log：2026-06-24 起（warn/error 混在网关日志中，用 [warn]/[error] 标记）
  const legacyErrEntries = await readErrorLogTail(join(LOGS_DIR, 'gateway.err.log'), 80);
  const newErrLines = sysGateway.filter((l) =>
    /\[(warn|error)\]/i.test(l) || /\b(warn|error|fail|failed|fatal|crash)\b/i.test(l),
  );
  const newErrEntries = await readErrorLogTailFromLines(newErrLines, 80);
  // 合并后按时间倒序
  const allErrors = [...legacyErrEntries, ...newErrEntries];
  allErrors.sort((a, b) => {
    const ta = extractLogTime(a);
    const tb = extractLogTime(b);
    return tb.localeCompare(ta);
  });
  const errors = allErrors.slice(0, 100);

  // 5. 重启日志 — 合并旧位置的历史记录 + 系统位置的新记录
  //    旧位置 gateway-restart.log：2026-04 ~ 2026-06-02（[ISO] openclaw restart attempt/done ...）
  //    系统位置 gateway.log：2026-06-24 起（[gateway] received SIGTERM; restarting ...）
  const legacyRestarts = await readLogTail(join(LOGS_DIR, 'gateway-restart.log'), 100);
  const newRestartLines = sysGateway.filter((l) =>
    /received SIGTERM;\s*restarting/i.test(l) ||
    /shutdown\] started:\s*gateway restarting/i.test(l) ||
    /restart mode:/i.test(l) ||
    /gateway tool:\s*restart requested/i.test(l) ||
    /waiting for\s+\d+\s+pending reply/i.test(l),
  );
  // 合并后按时间倒序：两种格式都含 ISO 时间，直接字符串排序
  const allRestarts = [...legacyRestarts, ...newRestartLines];
  allRestarts.sort((a, b) => {
    const ta = extractRestartTime(a);
    const tb = extractRestartTime(b);
    return tb.localeCompare(ta);
  });
  const restarts = allRestarts.slice(0, 100);

  // 6. 配置审计尾部（JSON Lines）
  // 字段：{ts, source, event, configPath, pid, argv, previousHash, nextHash, previousBytes, nextBytes, result}
  const auditLines = await readLogTail(join(LOGS_DIR, 'config-audit.jsonl'), 100);
  const audit = auditLines
    .map((line) => {
      try {
        const obj = JSON.parse(line) as Record<string, unknown>;
        const argv = Array.isArray(obj.argv) ? (obj.argv as string[]) : [];
        const cmd = argv.length > 0 ? argv[argv.length - 1] : '';
        const prevBytes = typeof obj.previousBytes === 'number' ? obj.previousBytes : null;
        const nextBytes = typeof obj.nextBytes === 'number' ? obj.nextBytes : null;
        const delta = prevBytes != null && nextBytes != null ? nextBytes - prevBytes : null;
        return {
          timestamp: String(obj.ts ?? obj.timestamp ?? ''),
          event: String(obj.event ?? ''),
          source: String(obj.source ?? ''),
          command: cmd,
          configPath: String(obj.configPath ?? ''),
          result: String(obj.result ?? ''),
          previousBytes: prevBytes,
          nextBytes: nextBytes,
          deltaBytes: delta,
          hashChanged: obj.previousHash !== obj.nextHash,
          detail: line,
        };
      } catch {
        return {
          timestamp: '', event: '', source: '', command: '', configPath: '',
          result: '', previousBytes: null, nextBytes: null, deltaBytes: null,
          hashChanged: false, detail: line.slice(0, 300),
        };
      }
    })
    .reverse();

  // 7. 稳定性事件（stability 目录，JSON 文件）
  // 字段：{version, generatedAt, reason, process, host, error, snapshot}
  const stability: Array<{
    timestamp: string;
    reason: string;
    errorMessage: string;
    errorName: string;
    pid: number;
    node: string;
    uptimeMs: number;
    detail: string;
  }> = [];
  try {
    const stabDir = join(LOGS_DIR, 'stability');
    const stabEntries = await readdir(stabDir, { withFileTypes: true });
    for (const entry of stabEntries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const obj = await readJsonFile<Record<string, unknown>>(join(stabDir, entry.name));
      if (!obj) continue;
      const process = (obj.process ?? {}) as Record<string, unknown>;
      const error = (obj.error ?? {}) as Record<string, unknown>;
      stability.push({
        timestamp: String(obj.generatedAt ?? ''),
        reason: String(obj.reason ?? 'unknown'),
        errorMessage: String(error.message ?? ''),
        errorName: String(error.name ?? ''),
        pid: Number(process.pid ?? 0),
        node: String(process.node ?? ''),
        uptimeMs: Number(process.uptimeMs ?? 0),
        detail: JSON.stringify(obj).slice(0, 500),
      });
    }
    stability.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  } catch {}

  // 8. 配置健康
  const health = await readJsonFile<Record<string, unknown>>(join(LOGS_DIR, 'config-health.json'));

  // 统计
  const totalSize = files.reduce((s, f) => s + f.size, 0);
  const errorCount = errors.filter((l) => /\[error\]|\[ERROR\]|error|fail/i.test(l)).length;
  // 文件列表按修改时间倒序（最新修改的在前）
  files.sort((a, b) => b.modified.localeCompare(a.modified));

  return {
    files,
    stats: {
      fileCount: files.length,
      totalSize,
      commandCount: commands.length,
      errorCount,
      stabilityCount: stability.length,
      latestCommand: commands[0]?.timestamp ?? '',
      latestGateway: gateway[0]?.match(/^(\S+)/)?.[1] ?? '',
    },
    commands,
    gateway,
    errors,
    restarts,
    audit,
    stability,
    health,
  };
}

// 加载 ~/.openclaw/.env 文件为 key-value 字典
let cachedEnvFile: Record<string, string> | null = null;
const ENV_FILE_CACHE_TTL_MS = 5_000;
let envFileCacheExpires = 0;

async function loadEnvFile(): Promise<Record<string, string>> {
  if (cachedEnvFile && Date.now() < envFileCacheExpires) return cachedEnvFile;
  const out: Record<string, string> = {};
  const content = await readFile(join(OC_HOME, '.env'), 'utf8').catch(() => '');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    const k = trimmed.slice(0, eqIdx).trim();
    const v = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (k) out[k] = v;
  }
  cachedEnvFile = out;
  envFileCacheExpires = Date.now() + ENV_FILE_CACHE_TTL_MS;
  return out;
}

// 解析 $VAR 或 ${VAR} 引用，返回真实值；非引用原样返回
async function resolveEnvRefs(value: unknown): Promise<unknown> {
  if (typeof value !== 'string') return value;
  // 完全匹配 $VAR 或 ${VAR}
  const m = /^\$\{?([A-Z_][A-Z0-9_]*)\}?$/.exec(value);
  if (m) {
    const envVars = await loadEnvFile();
    const real = envVars[m[1]];
    return real ?? value; // 找不到则原样返回引用
  }
  return value;
}

async function readConfig(): Promise<unknown> {
  const raw = await readJsonFile<Record<string, unknown>>(join(OC_HOME, 'openclaw.json'));
  if (!raw) return { sections: [] };
  // 解析 $VAR 引用为真实值（从 ~/.openclaw/.env 读取），脱敏由前端 LeafValue 负责
  async function resolveDeep(obj: unknown): Promise<unknown> {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return Promise.all(obj.map(resolveDeep));
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = await resolveEnvRefs(v);
      else if (typeof v === 'object' && v !== null) out[k] = await resolveDeep(v);
      else out[k] = v;
    }
    return out;
  }
  return resolveDeep(raw);
}

async function readPlugins(): Promise<{ plugins: Record<string, unknown>[] }> {
  // Known enabled plugins (from CLI output - stored in SQLite state DB which Vite can't access)
  const knownEnabled: Record<string, unknown>[] = [
    { name: 'Active Memory', enabled: true, description: '活跃记忆：在对话回复前运行记忆子代理，注入相关记忆到上下文', slot: 'memory-core' },
    { name: '@openclaw/memory-core', enabled: true, description: '记忆核心：向量数据库存储与检索引擎', slot: 'memory-core' },
    { name: '@openclaw/xiaomi-provider', enabled: true, description: '小米模型提供者：接入小米大模型 API', slot: 'provider' },
    { name: 'DingTalk Channel', enabled: true, description: '钉钉渠道：OpenClaw 钉钉官方连接插件', slot: 'channel' },
    { name: '@larksuite/openclaw-lark', enabled: true, description: '飞书渠道：OpenClaw 飞书/Lark 连接插件', slot: 'channel' },
  ];

  // Also scan agent plugins dir for additional info
  const agentPluginsDir = join(AGENTS_DIR, 'main/agent/plugins');
  try {
    const entries = await readdir(agentPluginsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      if (!knownEnabled.some(p => String(p.name).toLowerCase().includes(entry.name.toLowerCase()))) {
        knownEnabled.push({ name: entry.name, enabled: true, description: '', slot: 'plugin' });
      }
    }
  } catch {}

  return { plugins: knownEnabled };
}

async function readSkills(): Promise<{ skills: unknown[] }> {
  const skills: unknown[] = [];

  // Read bundled skills from skills dir
  try {
    const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const skillPath = join(SKILLS_DIR, entry.name);
      const skillMd = await readFileSafe(join(skillPath, 'SKILL.md'), 500);
      const meta = skillMd.exists ? parseSkillMeta(skillMd.preview) : {};
      skills.push({
        name: entry.name,
        description: meta.description ?? '',
        emoji: meta.emoji ?? '',
        eligible: skillMd.exists,
        disabled: !skillMd.exists,
        source: 'openclaw-managed',
        bundled: entry.name.startsWith('sn-'),
        homepage: meta.homepage ?? '',
        missing: { bins: [], env: [], config: [], os: [] },
      });
    }
  } catch {}

  // Read workspace skills
  try {
    const wsSkillsDir = join(await getWorkspace(), 'skills');
    const entries = await readdir(wsSkillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const skillPath = join(wsSkillsDir, entry.name);
      const skillMd = await readFileSafe(join(skillPath, 'SKILL.md'), 500);
      const meta = skillMd.exists ? parseSkillMeta(skillMd.preview) : {};
      if (skills.some((s: Record<string, unknown>) => s.name === entry.name)) continue;
      skills.push({
        name: entry.name,
        description: meta.description ?? '',
        emoji: meta.emoji ?? '',
        eligible: skillMd.exists,
        disabled: !skillMd.exists,
        source: 'openclaw-workspace',
        bundled: false,
        homepage: meta.homepage ?? '',
        missing: { bins: [], env: [], config: [], os: [] },
      });
    }
  } catch {}

  // Read personal skills (symlinks in skills dir)
  try {
    const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink() && !entry.name.startsWith('.')) {
        const target = join(SKILLS_DIR, entry.name);
        const skillMd = await readFileSafe(join(target, 'SKILL.md'), 500);
        const meta = skillMd.exists ? parseSkillMeta(skillMd.preview) : {};
        if (skills.some((s: Record<string, unknown>) => s.name === entry.name)) continue;
        skills.push({
          name: entry.name,
          description: meta.description ?? '',
          emoji: meta.emoji ?? '',
          eligible: skillMd.exists,
          disabled: !skillMd.exists,
          source: 'agents-skills-personal',
          bundled: false,
          homepage: meta.homepage ?? '',
          missing: { bins: [], env: [], config: [], os: [] },
        });
      }
    }
  } catch {}

  return { skills };
}

function parseSkillMeta(content: string): { description?: string; emoji?: string; homepage?: string } {
  const descMatch = /description:\s*(.+)/i.exec(content);
  const emojiMatch = /emoji:\s*(.+)/i.exec(content);
  const homeMatch = /homepage:\s*(.+)/i.exec(content);
  // Also try to extract from first non-header line
  const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('---'));
  const desc = descMatch?.[1]?.trim() || lines[0]?.trim() || '';
  return {
    description: desc.slice(0, 300),
    emoji: emojiMatch?.[1]?.trim(),
    homepage: homeMatch?.[1]?.trim(),
  };
}

async function readStatus(): Promise<unknown> {
  const [sessions, cronJobs, taskStats] = await Promise.all([
    readSessions(),
    readCronJobs(),
    readTaskStats(),
  ]);

  const recent = (sessions.recent as Array<{ updatedAt?: number; model?: string }>) ?? [];
  const latestUpdatedAt = recent.reduce((m, s) => Math.max(m, Number(s.updatedAt ?? 0)), 0);
  const fallbackModel = recent.find((s) => s.model)?.model ?? 'unknown';

  return {
    runtimeVersion: '2026.6.10',
    gateway: {
      mode: 'local',
      url: 'ws://127.0.0.1:18789',
      reachable: true,
      connectLatencyMs: 0,
      self: {
        host: 'localhost',
        ip: '127.0.0.1',
        version: '2026.6.10',
        platform: `${process.platform} ${process.arch}`,
        instanceId: '',
      },
    },
    agents: {
      defaultId: 'main',
      agents: [{
        id: 'main',
        name: 'Main Agent',
        sessionsCount: sessions.count,
        lastActiveAgeMs: latestUpdatedAt > 0 ? Math.max(0, Date.now() - latestUpdatedAt) : 0,
      }],
      totalSessions: sessions.count,
    },
    sessions: { ...sessions, defaults: { model: fallbackModel, contextTokens: 1048576 } },
    tasks: { total: taskStats.total, active: taskStats.active, terminal: taskStats.terminal, failures: taskStats.failures, byStatus: {}, byRuntime: {} },
    cronJobs,
    plugins: [],
    memoryFiles: [],
    memoryFileCount: 0,
    vectorDbCount: 0,
  };
}

// ─── Usage Cost (token/cost analytics from session logs) ───

const USAGE_DAY_MS = 24 * 60 * 60 * 1000;
const USAGE_LOOKBACK_DAYS = 62;
const USAGE_CACHE_TTL_MS = 10_000;
const USAGE_SCAN_CONCURRENCY = 8;

// 官方定价表（人民币 ¥/百万 tokens）
// 对有定价的模型自己计算 cost（人民币）；无定价的回退到 OpenClaw 记录的美元 cost
interface ModelPrice {
  inputCached: number;   // 命中缓存的输入
  inputUncached: number; // 未命中缓存的输入
  output: number;
}
const MODEL_PRICES: Record<string, ModelPrice> = {
  'mimo-v2.5': { inputCached: 0.02, inputUncached: 1.00, output: 2.00 },
  'mimo-v2.5-pro': { inputCached: 0.025, inputUncached: 3.00, output: 6.00 },
  // MiniMax-M3 上下文 ≤512K 档（实测全部请求均在此档）
  'MiniMax-M3': { inputCached: 0.42, inputUncached: 2.10, output: 8.40 },
};

// 按官方定价计算人民币成本（元）；无定价返回 null（调用方回退到 OpenClaw 记录值）
function computeCostCny(model: string, usage: Record<string, unknown>): number | null {
  const price = MODEL_PRICES[model];
  if (!price) return null;
  const input = Number(usage.input ?? 0);
  const output = Number(usage.output ?? 0);
  const cacheRead = Number(usage.cacheRead ?? 0);
  const inputUncached = Math.max(0, input - cacheRead);
  // 单位：¥/M tokens，所以除以 1_000_000
  const cost =
    (inputUncached * price.inputUncached + cacheRead * price.inputCached + output * price.output) / 1_000_000;
  return cost;
}

interface UsageEvent {
  timestamp: string;
  day: string;
  sessionId: string;
  sessionKey?: string;
  agentId: string;
  model?: string;
  provider: string;
  tokens: number;
  cost: number;
  currency: 'CNY' | 'USD'; // CNY=官方定价计算，USD=回退 OpenClaw 记录值
}

interface UsageBreakdownRow {
  key: string;
  label: string;
  tokens: number;
  estimatedCost: number;
  requests: number;
  sessions: number;
}

interface UsagePeriod {
  key: 'today' | 'yesterday' | '3d' | '7d' | '30d';
  label: string;
  tokens: number;
  estimatedCost: number;
  requests: number;
  pace: { label: string; state: 'rising' | 'steady' | 'cooling' | 'unknown' };
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

let usageCache: { value: UsageCostData; expiresAt: number } | undefined;

// 加载所有 agent 的 sessions.json，建立 sessionId → {sessionKey, agentId, model} 索引
async function loadSessionsIndex(): Promise<Map<string, { sessionKey: string; agentId: string; model?: string }>> {
  const out = new Map<string, { sessionKey: string; agentId: string; model?: string }>();
  try {
    const entries = await readdir(AGENTS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const agentId = entry.name;
      const sessionsJson = await readJsonFile<Record<string, unknown>>(
        join(AGENTS_DIR, agentId, 'sessions/sessions.json'),
      );
      if (!sessionsJson) continue;
      for (const [sessionKey, val] of Object.entries(sessionsJson)) {
        const r = val as Record<string, unknown>;
        const sessionId = String(r.sessionId ?? '');
        if (sessionId) out.set(sessionId, { sessionKey, agentId, model: r.model ? String(r.model) : undefined });
      }
    }
  } catch {}
  return out;
}

function inferProvider(model?: string): string {
  if (!model) return 'Unknown';
  const n = model.toLowerCase();
  if (n.includes('gpt') || n.includes('o1') || n.includes('o3') || n.includes('o4')) return 'OpenAI';
  if (n.includes('claude')) return 'Anthropic';
  if (n.includes('gemini')) return 'Google';
  if (n.includes('deepseek')) return 'DeepSeek';
  if (n.includes('minimax')) return 'MiniMax';
  if (n.includes('sensenova')) return 'SenseNova';
  if (n.includes('mimo')) return 'Xiaomi';
  if (n.includes('qwen') || n.includes('llama') || n.includes('mistral')) return 'OSS/Other';
  return 'Unknown';
}

function classifySessionType(sessionKey?: string): 'Cron' | 'Discord' | 'Telegram' | 'Main' {
  const k = (sessionKey ?? '').toLowerCase();
  if (k.includes(':cron:') || k.startsWith('cron:')) return 'Cron';
  if (k.includes(':discord:') || k.startsWith('discord:')) return 'Discord';
  if (k.includes(':telegram:') || k.startsWith('telegram:')) return 'Telegram';
  return 'Main';
}

function parseCronJobIdFromSessionKey(sessionKey?: string): string | undefined {
  const parts = (sessionKey ?? '').split(':').map((s) => s.trim()).filter(Boolean);
  const i = parts.findIndex((p) => p.toLowerCase() === 'cron');
  const id = parts[i + 1];
  return id && id.trim() ? id.trim() : undefined;
}

// 扫描所有 agent 的 sessions/*.jsonl，解析 assistant message 的 usage 字段
async function scanUsageEvents(): Promise<UsageEvent[]> {
  const sessionIndex = await loadSessionsIndex();
  const lowerBoundMs = Date.now() - (USAGE_LOOKBACK_DAYS - 1) * USAGE_DAY_MS;

  const agentDirs: Array<{ agentId: string; sessionsDir: string }> = [];
  try {
    const entries = await readdir(AGENTS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) agentDirs.push({ agentId: entry.name, sessionsDir: join(AGENTS_DIR, entry.name, 'sessions') });
    }
  } catch {
    return [];
  }

  // 收集候选文件（按 mtime 过滤）
  const files: Array<{ path: string; agentId: string; sessionId: string }> = [];
  for (const { sessionsDir, agentId } of agentDirs) {
    try {
      const entries = await readdir(sessionsDir);
      for (const name of entries) {
        if (!name.endsWith('.jsonl') || name.endsWith('.trajectory.jsonl')) continue;
        const full = join(sessionsDir, name);
        const s = await stat(full);
        if (s.mtimeMs < lowerBoundMs) continue;
        files.push({ path: full, agentId, sessionId: name.slice(0, -'.jsonl'.length) });
      }
    } catch {}
  }

  // 并发扫描
  const events: UsageEvent[] = [];
  let nextIdx = 0;
  async function worker() {
    while (nextIdx < files.length) {
      const f = files[nextIdx++];
      try {
        const raw = await readFile(f.path, 'utf8');
        const lines = raw.replace(/\r/g, '').split('\n');
        for (const line of lines) {
          const t = line.trim();
          if (!t) continue;
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(t) as Record<string, unknown>;
          } catch {
            continue;
          }
          if (parsed.type !== 'message') continue;
          const msg = parsed.message as Record<string, unknown> | undefined;
          if (!msg || msg.role !== 'assistant') continue;
          const usage = msg.usage as Record<string, unknown> | undefined;
          if (!usage) continue;
          const ts = String(parsed.timestamp ?? msg.timestamp ?? '');
          const tsMs = ts ? Date.parse(ts) : NaN;
          if (!Number.isFinite(tsMs) || tsMs < lowerBoundMs) continue;
          const ctx = sessionIndex.get(f.sessionId);
          const model = String(msg.model ?? ctx?.model ?? '');
          const provider = inferProvider(model);
          const tokens = Number(
            usage.totalTokens ??
              Number(usage.input) + Number(usage.output) + Number(usage.cacheRead) + Number(usage.cacheWrite),
          );
          const costObj = usage.cost as Record<string, unknown> | undefined;
          const ocCost = Number(costObj?.total ?? 0);
          // 优先用官方定价算人民币成本；无定价回退 OpenClaw 记录的美元成本
          const cnyCost = model ? computeCostCny(model, usage) : null;
          const useOfficial = cnyCost !== null;
          events.push({
            timestamp: new Date(tsMs).toISOString(),
            day: new Date(tsMs).toISOString().slice(0, 10),
            sessionId: f.sessionId,
            sessionKey: ctx?.sessionKey,
            agentId: ctx?.agentId ?? f.agentId,
            model: model || undefined,
            provider,
            tokens: Math.max(0, tokens),
            cost: Math.max(0, useOfficial ? cnyCost! : ocCost),
            currency: useOfficial ? 'CNY' : 'USD',
          });
        }
      } catch {}
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(USAGE_SCAN_CONCURRENCY, Math.max(1, files.length)) }, worker),
  );
  return events;
}

function classifyUsagePace(current: number, baseline?: number): UsagePeriod['pace'] {
  if (baseline === undefined || baseline <= 0) return { label: '无基线', state: 'unknown' };
  const r = current / baseline;
  if (r >= 1.2) return { label: '上升', state: 'rising' };
  if (r <= 0.8) return { label: '下降', state: 'cooling' };
  return { label: '平稳', state: 'steady' };
}

async function readUsageCost(): Promise<UsageCostData> {
  if (usageCache && usageCache.expiresAt > Date.now()) return usageCache.value;

  const events = await scanUsageEvents();
  const todayIso = new Date().toISOString().slice(0, 10);
  const todayMs = Date.parse(`${todayIso}T00:00:00.000Z`);

  function windowEvents(days: number): UsageEvent[] {
    const lb = todayMs - (days - 1) * USAGE_DAY_MS;
    return events.filter((e) => {
      const m = Date.parse(e.day);
      return Number.isFinite(m) && m >= lb && m <= todayMs;
    });
  }
  // 统一换算为人民币（USD 按 7.2 估算）
  const USD_TO_CNY = 7.2;
  function toCny(e: UsageEvent): number {
    return e.currency === 'USD' ? e.cost * USD_TO_CNY : e.cost;
  }
  function agg(evs: UsageEvent[]) {
    let tokens = 0;
    let cost = 0;
    const sessions = new Set<string>();
    for (const e of evs) {
      tokens += e.tokens;
      cost += toCny(e);
      sessions.add(e.sessionKey ?? e.sessionId);
    }
    return { tokens, cost, requests: evs.length, sessions: sessions.size };
  }
  function prevDailyAvgCost(days: number): number | undefined {
    const curLower = todayMs - (days - 1) * USAGE_DAY_MS;
    const prevUpper = curLower - USAGE_DAY_MS;
    const prevLower = prevUpper - (days - 1) * USAGE_DAY_MS;
    const prev = events.filter((e) => {
      const m = Date.parse(e.day);
      return m >= prevLower && m <= prevUpper;
    });
    if (prev.length === 0) return undefined;
    return agg(prev).cost / Math.max(1, days);
  }

  const windows = [
    { key: 'today' as const, days: 1, label: '今日' },
    { key: 'yesterday' as const, days: 1, label: '昨日', offset: 1 },
    { key: '3d' as const, days: 3, label: '近 3 日' },
    { key: '7d' as const, days: 7, label: '近 7 日' },
    { key: '30d' as const, days: 30, label: '近 30 日' },
  ];
  const periods: UsagePeriod[] = windows.map((w) => {
    // 支持 offset（如昨日 = 从今天往前 offset 天的那一天）
    let evs: UsageEvent[];
    if ('offset' in w && typeof w.offset === 'number') {
      const targetUpper = todayMs - w.offset * USAGE_DAY_MS;
      const targetLower = targetUpper - (w.days - 1) * USAGE_DAY_MS;
      evs = events.filter((e) => {
        const m = Date.parse(e.day);
        return Number.isFinite(m) && m >= targetLower && m <= targetUpper;
      });
    } else {
      evs = windowEvents(w.days);
    }
    const a = agg(evs);
    const curAvg = a.cost / Math.max(1, w.days);
    return {
      key: w.key,
      label: w.label,
      tokens: a.tokens,
      estimatedCost: a.cost,
      requests: a.requests,
      pace: classifyUsagePace(curAvg, prevDailyAvgCost(w.days)),
    };
  });

  function breakdown(
    evs: UsageEvent[],
    keyFn: (e: UsageEvent) => string,
    limit = 12,
  ): UsageBreakdownRow[] {
    const m = new Map<string, UsageBreakdownRow>();
    const sess = new Map<string, Set<string>>();
    for (const e of evs) {
      const k = (keyFn(e) || 'Unknown').trim();
      const r =
        m.get(k) ?? { key: k, label: k, tokens: 0, estimatedCost: 0, requests: 0, sessions: 0 };
      r.tokens += e.tokens;
      r.estimatedCost += e.cost;
      r.requests += 1;
      const s = sess.get(k) ?? new Set<string>();
      s.add(e.sessionKey ?? e.sessionId);
      sess.set(k, s);
      r.sessions = s.size;
      m.set(k, r);
    }
    return [...m.values()].sort((a, b) => b.tokens - a.tokens).slice(0, limit);
  }

  const ev30 = windowEvents(30);
  const byAgent = breakdown(ev30, (e) => e.agentId);
  const byModel = breakdown(ev30, (e) => e.model ?? '未报告');
  const byProvider = breakdown(ev30, (e) => e.provider);
  const bySessionType = breakdown(ev30, (e) => classifySessionType(e.sessionKey));

  // cron 任务名映射
  const cronNameMap = new Map<string, string>();
  try {
    const jobs = (await readCronJobs()) as Array<{ id: string; name: string }>;
    for (const j of jobs) cronNameMap.set(j.id, j.name);
  } catch {}
  const byCronJob = breakdown(
    ev30.filter((e) => classifySessionType(e.sessionKey) === 'Cron'),
    (e) => {
      const id = parseCronJobIdFromSessionKey(e.sessionKey);
      return id ? cronNameMap.get(id) ?? id : '未识别 Cron';
    },
    24,
  );

  const result: UsageCostData = {
    generatedAt: new Date().toISOString(),
    periods,
    breakdown: { byAgent, byModel, byProvider, bySessionType, byCronJob },
    totalEvents: events.length,
    sourceConnected: events.length > 0,
  };
  usageCache = { value: result, expiresAt: Date.now() + USAGE_CACHE_TTL_MS };
  return result;
}

// ─── Connector Status (数据源连接健康度) ───

interface ConnectorItem {
  key: string;
  label: string;
  status: 'connected' | 'partial' | 'not_connected';
  path: string;
  detail: string;
  hint?: string;
}

async function checkFileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function checkDirHasFiles(path: string): Promise<{ exists: boolean; count: number }> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    const count = entries.filter((e) => !e.name.startsWith('.')).length;
    return { exists: true, count };
  } catch {
    return { exists: false, count: 0 };
  }
}

async function checkSqliteTable(db: string, table: string): Promise<{ exists: boolean; rows: number }> {
  try {
    const rows = await sqlite3Json(db, `SELECT COUNT(*) as c FROM ${table};`);
    const count = Number((rows[0] as Record<string, unknown>)?.c ?? 0);
    return { exists: true, rows: count };
  } catch {
    return { exists: false, rows: 0 };
  }
}

async function readConnectors(): Promise<{ connectors: ConnectorItem[]; generatedAt: string }> {
  const workspace = await getWorkspace();
  const memoryDir = await getMemoryDir();

  const items: ConnectorItem[] = [];

  // 1. 会话索引
  const sessionsPath = join(AGENTS_DIR, 'main/sessions/sessions.json');
  const sessionsExists = await checkFileExists(sessionsPath);
  items.push({
    key: 'sessions',
    label: '会话索引',
    status: sessionsExists ? 'connected' : 'not_connected',
    path: sessionsPath,
    detail: sessionsExists ? '已连接' : 'sessions.json 不存在',
    hint: sessionsExists ? undefined : 'OpenClaw 需运行至少一次以生成会话数据',
  });

  // 2. Cron 任务表
  const cronCheck = await checkSqliteTable(OC_STATE_DB, 'cron_jobs');
  items.push({
    key: 'cron_jobs',
    label: 'Cron 任务',
    status: cronCheck.exists ? (cronCheck.rows > 0 ? 'connected' : 'partial') : 'not_connected',
    path: OC_STATE_DB,
    detail: cronCheck.exists ? `${cronCheck.rows} 个任务` : 'cron_jobs 表不存在',
    hint: cronCheck.exists ? undefined : 'state/openclaw.sqlite 缺失或表未创建',
  });

  // 3. 执行记录表
  const runsCheck = await checkSqliteTable(OC_STATE_DB, 'cron_run_logs');
  items.push({
    key: 'cron_runs',
    label: '执行记录',
    status: runsCheck.exists ? (runsCheck.rows > 0 ? 'connected' : 'partial') : 'not_connected',
    path: OC_STATE_DB,
    detail: runsCheck.exists ? `${runsCheck.rows} 条记录` : 'cron_run_logs 表不存在',
    hint: runsCheck.exists ? undefined : 'OpenClaw 运行 Cron 后才会生成执行记录',
  });

  // 4. 记忆文件
  const memCheck = await checkDirHasFiles(memoryDir);
  items.push({
    key: 'memory_files',
    label: '记忆文件',
    status: memCheck.exists ? (memCheck.count > 0 ? 'connected' : 'partial') : 'not_connected',
    path: memoryDir,
    detail: memCheck.exists ? `${memCheck.count} 个文件` : 'memory 目录不存在',
    hint: memCheck.exists ? undefined : 'workspace 路径可能配置错误',
  });

  // 5. 向量库
  const chromaExists = await checkFileExists(CHROMA_DB);
  items.push({
    key: 'vector_db',
    label: '向量库',
    status: chromaExists ? 'connected' : 'not_connected',
    path: CHROMA_DB,
    detail: chromaExists ? '已连接' : 'chroma.sqlite3 不存在',
    hint: chromaExists ? undefined : 'memory-core 插件未运行或未初始化',
  });

  // 6. 技能
  const skillsCheck = await checkDirHasFiles(SKILLS_DIR);
  items.push({
    key: 'skills',
    label: '技能',
    status: skillsCheck.exists ? (skillsCheck.count > 0 ? 'connected' : 'partial') : 'not_connected',
    path: SKILLS_DIR,
    detail: skillsCheck.exists ? `${skillsCheck.count} 个技能` : 'skills 目录不存在',
  });

  // 7. 扩展
  const extCheck = await checkDirHasFiles(EXT_DIR);
  items.push({
    key: 'extensions',
    label: '扩展',
    status: extCheck.exists ? (extCheck.count > 0 ? 'connected' : 'partial') : 'not_connected',
    path: EXT_DIR,
    detail: extCheck.exists ? `${extCheck.count} 个扩展` : 'extensions 目录不存在',
  });

  // 8. 系统配置
  const configPath = join(OC_HOME, 'openclaw.json');
  const configExists = await checkFileExists(configPath);
  items.push({
    key: 'config',
    label: '系统配置',
    status: configExists ? 'connected' : 'not_connected',
    path: configPath,
    detail: configExists ? '已连接' : 'openclaw.json 不存在',
    hint: configExists ? undefined : 'OPENCLAW_HOME 可能配置错误',
  });

  // 9. 内部日志
  const logsCheck = await checkDirHasFiles(LOGS_DIR);
  items.push({
    key: 'logs_internal',
    label: '内部日志',
    status: logsCheck.exists ? (logsCheck.count > 0 ? 'connected' : 'partial') : 'not_connected',
    path: LOGS_DIR,
    detail: logsCheck.exists ? `${logsCheck.count} 个文件` : 'logs 目录不存在',
  });

  // 10. 网关日志
  const gatewayLogPath = join(SYS_LOGS_DIR, 'gateway.log');
  const gatewayExists = await checkFileExists(gatewayLogPath);
  items.push({
    key: 'logs_gateway',
    label: '网关日志',
    status: gatewayExists ? 'connected' : 'not_connected',
    path: gatewayLogPath,
    detail: gatewayExists ? '已连接' : 'gateway.log 不存在',
    hint: gatewayExists ? undefined : (process.platform === 'darwin'
      ? 'OpenClaw 网关未运行或 launchd 未配置重定向'
      : process.platform === 'win32'
        ? 'OpenClaw 网关未运行或未配置日志重定向（检查 %OPENCLAW_SYS_LOGS_DIR%）'
        : 'OpenClaw 网关未运行或 systemd 未配置重定向（检查 $OPENCLAW_SYS_LOGS_DIR）'),
  });

  // 11. 用量数据（直接检查 sessions/*.jsonl 是否存在且有 usage 字段）
  let usageCount = 0;
  let usageSampleFound = false;
  const sampledFiles = new Set<string>();
  try {
    const agentEntries = await readdir(AGENTS_DIR, { withFileTypes: true });
    for (const entry of agentEntries) {
      if (!entry.isDirectory()) continue;
      const sessionsDir = join(AGENTS_DIR, entry.name, 'sessions');
      try {
        const files = await readdir(sessionsDir);
        for (const name of files) {
          if (!name.endsWith('.jsonl') || name.endsWith('.trajectory.jsonl')) continue;
          usageCount++;
          // 只对前 3 个文件采样检查 usage 字段，找到即停止
          if (!usageSampleFound && sampledFiles.size < 3) {
            const full = join(sessionsDir, name);
            sampledFiles.add(full);
            const content = await readFile(full, 'utf8').catch(() => '');
            if (content.slice(0, 8000).includes('"usage"')) usageSampleFound = true;
          }
        }
      } catch {}
    }
  } catch {}
  items.push({
    key: 'usage_events',
    label: '用量数据',
    status: usageSampleFound ? 'connected' : usageCount > 0 ? 'partial' : 'not_connected',
    path: join(AGENTS_DIR, '*/sessions/*.jsonl'),
    detail: usageSampleFound ? `${usageCount} 个 session 文件` : usageCount > 0 ? `${usageCount} 文件但无 usage 字段` : '未找到 session 文件',
    hint: usageSampleFound ? undefined : 'agents/*/sessions/*.jsonl 无 assistant message usage 字段',
  });

  return { connectors: items, generatedAt: new Date().toISOString() };
}

// ─── API Plugin ───

export default function openclawApiPlugin(): Plugin {
  return {
    name: 'openclaw-api',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
        const path = url.pathname;

        try {
          let data: unknown;

          if (path === '/status') {
            data = await readStatus();
          } else if (path === '/sessions') {
            data = await readSessions();
          } else if (path === '/cron') {
            data = { jobs: await readCronJobs() };
          } else if (path === '/cron/runs') {
            data = { runs: await readCronRuns() };
          } else if (path === '/plugins') {
            data = await readPlugins();
          } else if (path === '/config') {
            data = await readConfig();
          } else if (path === '/logs') {
            data = await readLogs();
          } else if (path === '/skills') {
            data = await readSkills();
          } else if (path === '/usage-cost') {
            data = await readUsageCost();
          } else if (path === '/connectors') {
            data = await readConnectors();

          // ─── Extensions (filesystem scan) ───
          } else if (path === '/extensions') {
            const extensions: Array<{ name: string; description: string; type: string; path: string }> = [];
            try {
              const extEntries = await readdir(EXT_DIR, { withFileTypes: true });
              for (const entry of extEntries) {
                if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
                const extPath = join(EXT_DIR, entry.name);
                const skillMd = await readFileSafe(join(extPath, 'SKILL.md'), 3000);
                let description = '';
                if (skillMd.exists) {
                  const lines = skillMd.preview.split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('---'));
                  description = lines[0]?.trim().slice(0, 200) || '';
                }
                extensions.push({ name: entry.name, description, type: 'extension', path: extPath });
              }
            } catch {}
            data = { extensions };

          // ─── Memory endpoints ───
          } else if (path === '/memory/files') {
            try {
              const memDir = await getMemoryDir();
              const entries = await readdir(memDir);
              const mdFiles = entries.filter((f) => f.endsWith('.md'));
              const files = await Promise.all(
                mdFiles.map(async (name) => {
                  const s = await stat(join(memDir, name));
                  return { name, size: s.size, modified: s.mtime.toISOString() };
                }),
              );
              data = { files, count: files.length };
            } catch {
              data = { files: [], count: 0 };
            }
          } else if (path === '/memory/vector-count') {
            const result = await sqlite3('SELECT COUNT(*) FROM embeddings;');
            data = { count: parseInt(result, 10) || 0 };
          } else if (path === '/memory/architecture') {
            const memDir = await getMemoryDir();
            const [
              rootFiles, rootCount, archiveCount, dreamingCount,
              dreamingDeepCount, dreamingRemCount, dreamingLightCount,
              snapshotCount, archiveTotalSize, dreamingTotalSize,
              memoryDirTotalSize, dbSize,
            ] = await Promise.all([
              readdir(memDir).then((e) => e.filter((f) => f.endsWith('.md'))).catch(() => []),
              fileCount(memDir, '.md').catch(() => 0),
              fileCount(join(memDir, 'archive'), '.md').catch(() => 0),
              fileCount(join(memDir, 'dreaming'), '.md').catch(() => 0),
              fileCount(join(memDir, 'dreaming/deep'), '.md').catch(() => 0),
              fileCount(join(memDir, 'dreaming/rem'), '.md').catch(() => 0),
              fileCount(join(memDir, 'dreaming/light'), '.md').catch(() => 0),
              fileCount(join(memDir, 'snapshots'), '.md').catch(() => 0),
              dirSize(join(memDir, 'archive')).catch(() => 0),
              dirSize(join(memDir, 'dreaming')).catch(() => 0),
              dirSize(memDir).catch(() => 0),
              stat(CHROMA_DB).then((s) => s.size).catch(() => 0),
            ]);
            let archiveMonths: string[] = [];
            try {
              const ae = await readdir(join(memDir, 'archive'), { withFileTypes: true });
              archiveMonths = ae.filter((e) => e.isDirectory() && /^\d{4}-\d{2}$/.test(e.name)).map((e) => e.name);
            } catch {}
            let dreamingDirs: string[] = [];
            try {
              const de = await readdir(join(memDir, 'dreaming'), { withFileTypes: true });
              dreamingDirs = de.filter((e) => e.isDirectory()).map((e) => e.name);
            } catch {}
            data = {
              totalFiles: rootCount, rootFileCount: rootFiles.length,
              archiveFileCount: archiveCount, archiveMonths, archiveTotalSize,
              dreamingFileCount: dreamingCount, dreamingDeepCount, dreamingRemCount,
              dreamingLightCount, dreamingDirs, dreamingTotalSize,
              snapshotFileCount: snapshotCount, memoryDirTotalSize, chromaDbSize: dbSize,
            };
          } else if (path === '/memory/vector-breakdown') {
            let categories: Array<{ category: string; count: number }> = [];
            let sources: Array<{ source: string; count: number }> = [];
            let totalEmbeddings = 0;
            totalEmbeddings = parseInt(await sqlite3('SELECT COUNT(*) FROM embeddings;'), 10) || 0;
            const catRows = await sqlite3("SELECT string_value, COUNT(*) FROM embedding_metadata WHERE key='category' GROUP BY string_value ORDER BY COUNT(*) DESC;");
            categories = catRows.split('\n').filter(Boolean).map((row) => {
              const [cat, cnt] = row.split('|');
              return { category: cat || '(未分类)', count: parseInt(cnt, 10) || 0 };
            });
            const srcRows = await sqlite3("SELECT string_value, COUNT(*) FROM embedding_metadata WHERE key='source' GROUP BY string_value ORDER BY COUNT(*) DESC LIMIT 20;");
            sources = srcRows.split('\n').filter(Boolean).map((row) => {
              const [src, cnt] = row.split('|');
              return { source: src || '(未知)', count: parseInt(cnt, 10) || 0 };
            });
            data = { totalEmbeddings, categories, sources };
          } else if (path === '/memory/workspace') {
            const wsDir = await getWorkspace();
            const learnDir = await getLearningsDir();
            const [memoryMd, soulMd, sessionState] = await Promise.all([
              readFileSafe(join(wsDir, 'MEMORY.md')),
              readFileSafe(join(wsDir, 'SOUL.md')),
              readFileSafe(join(wsDir, 'SESSION-STATE.md')),
            ]);
            let learningsFiles: Array<{ name: string; size: number; modified: string }> = [];
            try {
              const entries = await readdir(learnDir);
              const mdFiles = entries.filter((f) => f.endsWith('.md'));
              learningsFiles = await Promise.all(
                mdFiles.map(async (name) => {
                  const s = await stat(join(learnDir, name));
                  return { name, size: s.size, modified: s.mtime.toISOString() };
                }),
              );
            } catch {}
            let learningsTotalSize = 0;
            try { learningsTotalSize = await dirSize(learnDir); } catch {}
            data = {
              files: { MEMORY: memoryMd, SOUL: soulMd, 'SESSION-STATE': sessionState },
              learnings: { files: learningsFiles, totalCount: learningsFiles.length, totalSize: learningsTotalSize },
            };
          } else {
            res.writeHead(404);
            res.end('Not Found');
            return;
          }

          res.writeHead(200, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(JSON.stringify(data));
        } catch (err) {
          console.error(`[openclaw-api] ${path}:`, err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }));
        }
      });
    },
  };
}
