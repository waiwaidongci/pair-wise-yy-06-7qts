import { message } from 'antd';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { executeMockQuery } from '../data/mockDatabase';
import type {
  FavoriteQuery,
  QueryHistoryEntry,
  QueryJob,
  QuerySession,
  TabResult,
} from '../types/sql';
import { toQueryErrorDetail } from '../utils/queryErrors';

const DEFAULT_SQL = `SELECT order_no, customer_name, region, amount, status
FROM orders
WHERE amount > 5000 AND status = '已完成'
ORDER BY amount DESC
LIMIT 500;`;

/** 同时执行的任务上限 */
const MAX_CONCURRENT = 2;
/** 旧数据升级时补齐的统一基准版本 */
const BASELINE_VERSION = 1;

function createSession(title = '查询 1', sql = DEFAULT_SQL): QuerySession {
  return {
    id: crypto.randomUUID(),
    title,
    sql,
    updatedAt: Date.now(),
    result: null,
  };
}

const initialSession = createSession();

/** 运行中任务的 AbortController，不持久化 */
const abortControllers = new Map<string, AbortController>();

interface WorkbenchState {
  tabs: QuerySession[];
  activeTabId: string;
  history: QueryHistoryEntry[];
  favorites: FavoriteQuery[];
  /** 执行队列（含运行中与已结束的任务） */
  jobs: QueryJob[];
  /** 当前数据版本，结果记录执行时的版本，版本更新后过期 */
  dataVersion: number;
  addTab: (sql?: string) => void;
  closeTab: (id: string) => void;
  activateTab: (id: string) => void;
  updateTab: (id: string, sql: string, title?: string) => void;
  addHistory: (entry: Omit<QueryHistoryEntry, 'id'>) => void;
  clearHistory: () => void;
  addFavorite: (name: string, sql: string) => void;
  removeFavorite: (id: string) => void;
  /** 提交一条查询到队列；并发期内同一句 SQL 只执行一次，结果共享给所有相关标签 */
  submitQuery: (tabId: string, sql: string) => void;
  /** 取消某一条任务，只影响该任务本身 */
  cancelJob: (jobId: string) => void;
  /** 重试一条失败/已取消的任务 */
  retryJob: (jobId: string) => void;
  dismissJob: (jobId: string) => void;
  clearFinishedJobs: () => void;
  /** 锁定标签结果：版本更新后保留，不重算，仅标注基于哪个版本 */
  lockResult: (tabId: string) => void;
  unlockResult: (tabId: string) => void;
  /** 按标签当前 SQL 重算一次 */
  recomputeTab: (tabId: string) => void;
  /** 数据版本更新：未锁定的结果立即标过期并入队重算，已完成的不重做 */
  bumpDataVersion: () => void;
}

export const useWorkbenchStore = create<WorkbenchState>()(
  persist(
    (set, get) => ({
      tabs: [initialSession],
      activeTabId: initialSession.id,
      history: [],
      favorites: [
        {
          id: 'favorite-example',
          name: '高金额已完成订单',
          sql: DEFAULT_SQL,
          createdAt: Date.now(),
        },
      ],
      jobs: [],
      dataVersion: BASELINE_VERSION,

      addTab: (sql) => {
        const tab = createSession(`查询 ${get().tabs.length + 1}`, sql);
        set((state) => ({ tabs: [...state.tabs, tab], activeTabId: tab.id }));
      },

      closeTab: (id) => {
        const orphanedJobIds = get()
          .jobs.filter(
            (job) =>
              job.tabIds.includes(id) &&
              job.tabIds.length === 1 &&
              (job.status === 'queued' || job.status === 'running'),
          )
          .map((job) => job.id);
        orphanedJobIds.forEach((jobId) => {
          abortControllers.get(jobId)?.abort();
          abortControllers.delete(jobId);
        });
        set((state) => {
          const jobs = state.jobs.map((job) => {
            if (!job.tabIds.includes(id)) return job;
            const tabIds = job.tabIds.filter((tabId) => tabId !== id);
            if (tabIds.length === 0 && (job.status === 'queued' || job.status === 'running')) {
              return { ...job, status: 'cancelled' as const, finishedAt: Date.now(), tabIds };
            }
            return { ...job, tabIds };
          });
          if (state.tabs.length === 1) {
            const replacement = createSession();
            return { tabs: [replacement], activeTabId: replacement.id, jobs };
          }
          const index = state.tabs.findIndex((tab) => tab.id === id);
          const tabs = state.tabs.filter((tab) => tab.id !== id);
          const activeTabId =
            state.activeTabId === id
              ? (tabs[Math.max(0, index - 1)]?.id ?? tabs[0].id)
              : state.activeTabId;
          return { tabs, activeTabId, jobs };
        });
        processQueue();
      },

      activateTab: (id) => set({ activeTabId: id }),

      updateTab: (id, sql, title) =>
        set((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.id === id
              ? {
                  ...tab,
                  sql,
                  title: title ?? tab.title,
                  updatedAt: Date.now(),
                }
              : tab,
          ),
        })),

      addHistory: (entry) =>
        set((state) => ({
          history: [{ ...entry, id: crypto.randomUUID() }, ...state.history].slice(0, 100),
        })),

      clearHistory: () => set({ history: [] }),

      addFavorite: (name, sql) =>
        set((state) => ({
          favorites: [
            {
              id: crypto.randomUUID(),
              name: name.trim(),
              sql,
              createdAt: Date.now(),
            },
            ...state.favorites.filter((favorite) => favorite.name !== name.trim()),
          ],
        })),

      removeFavorite: (id) =>
        set((state) => ({ favorites: state.favorites.filter((favorite) => favorite.id !== id) })),

      submitQuery: (tabId, sql) => {
        const normalized = sql.trim();
        if (!normalized) return;
        set((state) => {
          const existing = state.jobs.find(
            (job) =>
              (job.status === 'queued' || job.status === 'running') && job.sql === normalized,
          );
          let jobs: QueryJob[];
          if (existing) {
            jobs = state.jobs.map((job) =>
              job.id === existing.id && !job.tabIds.includes(tabId)
                ? { ...job, tabIds: [...job.tabIds, tabId] }
                : job,
            );
          } else {
            jobs = [
              ...state.jobs,
              {
                id: crypto.randomUUID(),
                sql: normalized,
                status: 'queued',
                tabIds: [tabId],
                submittedAt: Date.now(),
                attempts: 0,
              },
            ];
          }
          return { jobs };
        });
        processQueue();
      },

      cancelJob: (jobId) => {
        abortControllers.get(jobId)?.abort();
        abortControllers.delete(jobId);
        set((state) => ({
          jobs: state.jobs.map((job) =>
            job.id === jobId && (job.status === 'queued' || job.status === 'running')
              ? { ...job, status: 'cancelled' as const, finishedAt: Date.now() }
              : job,
          ),
        }));
        processQueue();
      },

      retryJob: (jobId) => {
        set((state) => ({
          jobs: state.jobs.map((job) =>
            job.id === jobId && (job.status === 'failed' || job.status === 'cancelled')
              ? {
                  ...job,
                  status: 'queued' as const,
                  attempts: job.attempts + 1,
                  submittedAt: Date.now(),
                  startedAt: undefined,
                  finishedAt: undefined,
                  error: undefined,
                  errorDetail: undefined,
                }
              : job,
          ),
        }));
        processQueue();
      },

      dismissJob: (jobId) =>
        set((state) => ({ jobs: state.jobs.filter((job) => job.id !== jobId) })),

      clearFinishedJobs: () =>
        set((state) => ({
          jobs: state.jobs.filter((job) => job.status === 'queued' || job.status === 'running'),
        })),

      lockResult: (tabId) =>
        set((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.id === tabId && tab.result
              ? { ...tab, result: { ...tab.result, status: 'locked' as const } }
              : tab,
          ),
        })),

      unlockResult: (tabId) =>
        set((state) => ({
          tabs: state.tabs.map((tab) => {
            if (tab.id !== tabId || !tab.result) return tab;
            const status =
              tab.result.dataVersion >= get().dataVersion ? ('fresh' as const) : ('stale' as const);
            return { ...tab, result: { ...tab.result, status } };
          }),
        })),

      recomputeTab: (tabId) => {
        const tab = get().tabs.find((item) => item.id === tabId);
        if (tab) get().submitQuery(tabId, tab.sql);
      },

      bumpDataVersion: () => {
        const nextVersion = get().dataVersion + 1;
        set((state) => {
          const tabs = state.tabs.map((tab) => {
            if (!tab.result) return tab;
            if (tab.result.status === 'locked') return tab;
            if (tab.result.dataVersion >= nextVersion) return tab;
            return { ...tab, result: { ...tab.result, status: 'stale' as const } };
          });
          return { dataVersion: nextVersion, tabs };
        });
        // 过期结果立即入队重算（同 SQL 会与进行中的任务合并）
        get().tabs.forEach((tab) => {
          if (tab.result?.status === 'stale') {
            get().submitQuery(tab.id, tab.sql);
          }
        });
        void message.info(`数据版本已更新至 v${nextVersion}，过期结果将自动重算`);
      },
    }),
    {
      name: 'pair-wise-yy-06-workbench',
      version: 1,
      partialize: (state) => ({
        tabs: state.tabs,
        activeTabId: state.activeTabId,
        history: state.history,
        favorites: state.favorites,
        jobs: state.jobs,
        dataVersion: state.dataVersion,
      }),
      migrate: (persistedState) => {
        const state = (persistedState ?? {}) as Partial<WorkbenchState>;
        // 旧标签补 result 字段；旧历史补统一基准版本；中断的运行中任务回到排队
        const tabs = (state.tabs ?? []).map((tab) => ({ ...tab, result: tab.result ?? null }));
        const history = (state.history ?? []).map((entry) => ({
          ...entry,
          dataVersion: entry.dataVersion ?? BASELINE_VERSION,
        }));
        const jobs = (state.jobs ?? []).map((job) =>
          job.status === 'running' ? { ...job, status: 'queued' as const } : job,
        );
        return {
          tabs,
          activeTabId: state.activeTabId ?? tabs[0]?.id ?? initialSession.id,
          history,
          favorites: state.favorites ?? [],
          jobs,
          dataVersion: state.dataVersion ?? BASELINE_VERSION,
        };
      },
      onRehydrateStorage: () => (_state, error) => {
        if (!error) {
          // 恢复后续作队列
          processQueue();
        }
      },
    },
  ),
);

/** 尽量把空位填满，最多同时跑 MAX_CONCURRENT 条 */
function processQueue() {
  for (;;) {
    const state = useWorkbenchStore.getState();
    const running = state.jobs.filter((job) => job.status === 'running').length;
    if (running >= MAX_CONCURRENT) return;
    const next = state.jobs
      .filter((job) => job.status === 'queued')
      .sort((a, b) => a.submittedAt - b.submittedAt)[0];
    if (!next) return;
    useWorkbenchStore.setState((s) => ({
      jobs: s.jobs.map((job) =>
        job.id === next.id
          ? { ...job, status: 'running' as const, startedAt: Date.now(), attempts: job.attempts + 1 }
          : job,
      ),
    }));
    launchJob(next.id);
  }
}

function launchJob(jobId: string) {
  const job = useWorkbenchStore.getState().jobs.find((item) => item.id === jobId);
  if (!job) return;
  const controller = new AbortController();
  abortControllers.set(jobId, controller);
  const versionAtStart = useWorkbenchStore.getState().dataVersion;
  const sql = job.sql;

  executeMockQuery(sql, controller.signal)
    .then((result) => {
      const currentVersion = useWorkbenchStore.getState().dataVersion;
      const isStale = versionAtStart < currentVersion;
      useWorkbenchStore.setState((state) => ({
        jobs: state.jobs.map((item) =>
          item.id === jobId
            ? {
                ...item,
                status: 'succeeded' as const,
                finishedAt: Date.now(),
                dataVersion: versionAtStart,
                error: undefined,
                errorDetail: undefined,
              }
            : item,
        ),
        tabs: state.tabs.map((tab) => {
          if (!job.tabIds.includes(tab.id)) return tab;
          if (tab.result?.status === 'locked') return tab;
          const tabResult: TabResult = {
            dataVersion: versionAtStart,
            data: result,
            status: isStale ? 'stale' : 'fresh',
            executedAt: Date.now(),
          };
          return { ...tab, result: tabResult };
        }),
      }));
      useWorkbenchStore.getState().addHistory({
        sql,
        executedAt: Date.now(),
        elapsedMs: result.elapsedMs,
        rowCount: result.rowCount,
        success: true,
        dataVersion: versionAtStart,
      });
      if (result.truncated) {
        void message.warning(`结果超过 LIMIT，已返回前 ${result.rowCount} 行`);
      }
      if (isStale) {
        // 执行期间数据版本更新：过期标签立即重算
        job.tabIds.forEach((tabId) => {
          const tab = useWorkbenchStore.getState().tabs.find((item) => item.id === tabId);
          if (tab && tab.result?.status === 'stale') {
            useWorkbenchStore.getState().submitQuery(tabId, tab.sql);
          }
        });
      }
    })
    .catch((queryError: unknown) => {
      const aborted = controller.signal.aborted;
      const detail = toQueryErrorDetail(queryError, sql);
      useWorkbenchStore.setState((state) => ({
        jobs: state.jobs.map((item) =>
          item.id === jobId
            ? {
                ...item,
                status: aborted ? ('cancelled' as const) : ('failed' as const),
                finishedAt: Date.now(),
                error: aborted ? undefined : detail.message,
                errorDetail: aborted ? undefined : detail,
              }
            : item,
        ),
      }));
      if (!aborted) {
        useWorkbenchStore.getState().addHistory({
          sql,
          executedAt: Date.now(),
          elapsedMs: 0,
          rowCount: 0,
          success: false,
          error: detail.message,
          dataVersion: versionAtStart,
        });
      }
    })
    .finally(() => {
      abortControllers.delete(jobId);
      processQueue();
    });
}
