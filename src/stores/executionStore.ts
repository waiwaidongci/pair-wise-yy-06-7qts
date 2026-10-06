import { create } from 'zustand';
import {
  advanceDataVersion,
  executeMockQuery,
  getDataVersion,
} from '../data/mockDatabase';
import type { QueryJob } from '../types/sql';
import { toQueryErrorDetail } from '../utils/queryErrors';
import { useWorkbenchStore } from './workbenchStore';

/** 同时最多执行的查询条数，其余按提交先后排队 */
export const MAX_CONCURRENT_QUERIES = 2;
/** 队列面板中保留的已结束任务条数上限 */
const MAX_FINISHED_JOBS = 30;

const abortControllers = new Map<string, AbortController>();

/** 用于同句去重的归一化：去首尾空白、去结尾分号、压缩连续空白 */
export function normalizeSqlKey(sql: string): string {
  return sql.trim().replace(/;+\s*$/, '').replace(/\s+/g, ' ');
}

interface ExecutionState {
  dataVersion: number;
  jobs: QueryJob[];
  /** 标签 -> 当前展示结果所属的任务 */
  tabJobs: Record<string, string>;
  submit: (tabId: string, sql: string) => void;
  cancelJob: (jobId: string) => void;
  retryJob: (jobId: string) => void;
  toggleLock: (jobId: string) => void;
  simulateDataChange: () => void;
}

function createJob(sql: string, tabIds: string[], extra?: Partial<QueryJob>): QueryJob {
  return {
    id: crypto.randomUUID(),
    sql,
    tabIds,
    status: 'queued',
    submittedAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    attempts: 1,
    dataVersion: null,
    result: null,
    error: null,
    locked: false,
    stale: false,
    ...extra,
  };
}

function isActive(job: QueryJob): boolean {
  return job.status === 'queued' || job.status === 'running';
}

/** 已结束任务只保留最近若干条，正在展示结果的任务始终保留 */
function trimJobs(jobs: QueryJob[], tabJobs: Record<string, string>): QueryJob[] {
  const referenced = new Set(Object.values(tabJobs));
  const finished = jobs
    .filter((job) => !isActive(job) && !referenced.has(job.id))
    .sort((a, b) => b.submittedAt - a.submittedAt)
    .slice(0, MAX_FINISHED_JOBS);
  const keep = new Set(finished.map((job) => job.id));
  return jobs.filter((job) => isActive(job) || referenced.has(job.id) || keep.has(job.id));
}

export const useExecutionStore = create<ExecutionState>()((set, get) => ({
  dataVersion: getDataVersion(),
  jobs: [],
  tabJobs: {},

  submit: (tabId, sql) => {
    const trimmed = sql.trim();
    let toAbort: string[] = [];
    set((state) => {
      // 同一标签重新提交时，先把它从进行中的任务上摘下来
      let jobs = state.jobs
        .map((job) =>
          isActive(job) && job.tabIds.includes(tabId)
            ? { ...job, tabIds: job.tabIds.filter((id) => id !== tabId) }
            : job,
        )
        .filter((job) => !(job.status === 'queued' && job.tabIds.length === 0));

      const key = normalizeSqlKey(trimmed);
      const existing = jobs.find((job) => isActive(job) && normalizeSqlKey(job.sql) === key);
      const tabJobs = { ...state.tabJobs };
      if (existing) {
        // 多个标签同时提交同一句查询，只算一次
        jobs = jobs.map((job) =>
          job.id === existing.id ? { ...job, tabIds: [...job.tabIds, tabId] } : job,
        );
        tabJobs[tabId] = existing.id;
      } else {
        const job = createJob(trimmed, [tabId]);
        jobs = [...jobs, job];
        tabJobs[tabId] = job.id;
      }
      // 没有任何标签等待的运行中任务直接中断，让出并发位
      toAbort = jobs
        .filter((job) => job.status === 'running' && job.tabIds.length === 0)
        .map((job) => job.id);
      return { jobs: trimJobs(jobs, tabJobs), tabJobs };
    });
    toAbort.forEach((jobId) => abortControllers.get(jobId)?.abort());
    pump();
  },

  cancelJob: (jobId) => {
    const job = get().jobs.find((item) => item.id === jobId);
    if (!job) return;
    if (job.status === 'queued') {
      set((state) => ({
        jobs: state.jobs.map((item) =>
          item.id === jobId ? { ...item, status: 'cancelled', finishedAt: Date.now() } : item,
        ),
      }));
    } else if (job.status === 'running') {
      abortControllers.get(jobId)?.abort();
    }
  },

  retryJob: (jobId) => {
    // 只有失败 / 已取消的任务可以重试，已完成的保持原样
    set((state) => ({
      jobs: state.jobs.map((job) =>
        job.id === jobId && (job.status === 'failed' || job.status === 'cancelled')
          ? {
              ...job,
              status: 'queued',
              error: null,
              startedAt: null,
              finishedAt: null,
              submittedAt: Date.now(),
              attempts: job.attempts + 1,
            }
          : job,
      ),
    }));
    pump();
  },

  toggleLock: (jobId) => {
    const target = get().jobs.find((job) => job.id === jobId);
    if (!target || target.status !== 'succeeded') return;
    const locking = !target.locked;
    set((state) => ({
      jobs: state.jobs.map((job) => {
        if (job.id === jobId) return { ...job, locked: locking };
        // 锁定已过期结果时，取消它尚未开始的重算
        if (locking && job.recomputesJobId === jobId && job.status === 'queued') {
          return { ...job, status: 'cancelled', finishedAt: Date.now() };
        }
        return job;
      }),
    }));
    if (locking) {
      get()
        .jobs.filter((job) => job.recomputesJobId === jobId && job.status === 'running')
        .forEach((job) => abortControllers.get(job.id)?.abort());
    }
  },

  simulateDataChange: () => {
    set({ dataVersion: advanceDataVersion() });
    recomputeStaleJobs();
  },
}));

/** 数据版本更新后：未锁定的结果马上标过期，并排入队列重算 */
function recomputeStaleJobs() {
  const state = useExecutionStore.getState();
  const recomputes: QueryJob[] = [];
  let changed = false;
  const jobs = state.jobs.map((job) => {
    if (job.status !== 'succeeded' || !job.result || job.locked) return job;
    const outdated = job.dataVersion !== null && job.dataVersion < state.dataVersion;
    if (!outdated && !job.stale) return job;
    // 已有重算任务（无论进行中还是已结束）时，由最新那条结果继续跟进版本
    const hasRecompute = [...state.jobs, ...recomputes].some(
      (item) => item.recomputesJobId === job.id,
    );
    if (!hasRecompute) {
      recomputes.push(createJob(job.sql, [...job.tabIds], { recomputesJobId: job.id }));
    }
    changed = true;
    return job.stale ? job : { ...job, stale: true };
  });
  if (!changed && recomputes.length === 0) return;
  useExecutionStore.setState({ jobs: trimJobs([...jobs, ...recomputes], state.tabJobs) });
  pump();
}

/** 按提交先后启动排队中的任务，最多同时跑 MAX_CONCURRENT_QUERIES 条 */
function pump() {
  const { jobs } = useExecutionStore.getState();
  const running = jobs.filter((job) => job.status === 'running').length;
  const slots = MAX_CONCURRENT_QUERIES - running;
  if (slots <= 0) return;
  jobs
    .filter((job) => job.status === 'queued')
    .sort((a, b) => a.submittedAt - b.submittedAt)
    .slice(0, slots)
    .forEach((job) => void runJob(job.id));
}

async function runJob(jobId: string) {
  const job = useExecutionStore.getState().jobs.find((item) => item.id === jobId);
  if (!job || job.status !== 'queued') return;

  const controller = new AbortController();
  abortControllers.set(jobId, controller);
  const dataVersion = getDataVersion();
  useExecutionStore.setState((state) => ({
    jobs: state.jobs.map((item) =>
      item.id === jobId ? { ...item, status: 'running', startedAt: Date.now(), dataVersion } : item,
    ),
  }));

  try {
    const result = await executeMockQuery(job.sql, controller.signal);
    const finishedAt = Date.now();
    // 执行期间可能有标签追加订阅，取最新的订阅列表
    const tabIds =
      useExecutionStore.getState().jobs.find((item) => item.id === jobId)?.tabIds ?? job.tabIds;
    useExecutionStore.setState((state) => {
      const tabJobs = { ...state.tabJobs };
      tabIds.forEach((tabId) => {
        const bound = state.jobs.find((item) => item.id === tabJobs[tabId]);
        // 重算完成后，仍停留在过期结果上的标签切换到新结果
        if (bound && bound.stale && normalizeSqlKey(bound.sql) === normalizeSqlKey(job.sql)) {
          tabJobs[tabId] = jobId;
        }
      });
      return {
        jobs: trimJobs(
          state.jobs.map((item) =>
            item.id === jobId
              ? { ...item, status: 'succeeded', result, finishedAt, stale: false }
              : item,
          ),
          tabJobs,
        ),
        tabJobs,
      };
    });
    const workbench = useWorkbenchStore.getState();
    workbench.addHistory({
      sql: job.sql,
      executedAt: finishedAt,
      elapsedMs: result.elapsedMs,
      rowCount: result.rowCount,
      success: true,
      dataVersion,
    });
    tabIds.forEach((tabId) => workbench.setTabDataVersion(tabId, dataVersion));
    // 执行期间数据版本又更新过，结果一完成就已过期
    if (dataVersion < getDataVersion()) recomputeStaleJobs();
  } catch (error) {
    const detail = toQueryErrorDetail(error, job.sql);
    const cancelled = detail.code === 'QUERY_ABORTED';
    const finishedAt = Date.now();
    useExecutionStore.setState((state) => ({
      jobs: state.jobs.map((item) =>
        item.id === jobId
          ? {
              ...item,
              status: cancelled ? 'cancelled' : 'failed',
              error: cancelled ? null : detail,
              finishedAt,
            }
          : item,
      ),
    }));
    if (!cancelled) {
      useWorkbenchStore.getState().addHistory({
        sql: job.sql,
        executedAt: finishedAt,
        elapsedMs: 0,
        rowCount: 0,
        success: false,
        error: detail.message,
        dataVersion,
      });
    }
  } finally {
    abortControllers.delete(jobId);
    pump();
  }
}
