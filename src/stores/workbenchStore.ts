import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { BASELINE_DATA_VERSION } from '../data/mockDatabase';
import type { FavoriteQuery, QueryHistoryEntry, QuerySession } from '../types/sql';

const DEFAULT_SQL = `SELECT order_no, customer_name, region, amount, status
FROM orders
WHERE amount > 5000 AND status = '已完成'
ORDER BY amount DESC
LIMIT 500;`;

function createSession(title = '查询 1', sql = DEFAULT_SQL): QuerySession {
  return {
    id: crypto.randomUUID(),
    title,
    sql,
    updatedAt: Date.now(),
    dataVersion: BASELINE_DATA_VERSION,
  };
}

const initialSession = createSession();

interface WorkbenchState {
  tabs: QuerySession[];
  activeTabId: string;
  history: QueryHistoryEntry[];
  favorites: FavoriteQuery[];
  addTab: (sql?: string) => void;
  closeTab: (id: string) => void;
  activateTab: (id: string) => void;
  updateTab: (id: string, sql: string, title?: string) => void;
  setTabDataVersion: (id: string, dataVersion: number) => void;
  addHistory: (entry: Omit<QueryHistoryEntry, 'id'>) => void;
  clearHistory: () => void;
  addFavorite: (name: string, sql: string) => void;
  removeFavorite: (id: string) => void;
}

type PersistedWorkbench = Pick<
  WorkbenchState,
  'tabs' | 'activeTabId' | 'history' | 'favorites'
>;

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
      addTab: (sql) => {
        const tab = createSession(`查询 ${get().tabs.length + 1}`, sql);
        set((state) => ({ tabs: [...state.tabs, tab], activeTabId: tab.id }));
      },
      closeTab: (id) => {
        set((state) => {
          if (state.tabs.length === 1) {
            const replacement = createSession();
            return { tabs: [replacement], activeTabId: replacement.id };
          }
          const index = state.tabs.findIndex((tab) => tab.id === id);
          const tabs = state.tabs.filter((tab) => tab.id !== id);
          const activeTabId =
            state.activeTabId === id
              ? (tabs[Math.max(0, index - 1)]?.id ?? tabs[0].id)
              : state.activeTabId;
          return { tabs, activeTabId };
        });
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
      setTabDataVersion: (id, dataVersion) =>
        set((state) => ({
          tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, dataVersion } : tab)),
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
    }),
    {
      name: 'pair-wise-yy-06-workbench',
      version: 1,
      partialize: (state): PersistedWorkbench => ({
        tabs: state.tabs,
        activeTabId: state.activeTabId,
        history: state.history,
        favorites: state.favorites,
      }),
      migrate: (persistedState, version): PersistedWorkbench => {
        const state = persistedState as Partial<PersistedWorkbench> | undefined;
        if (!version || version < 1) {
          // 旧数据中的标签和历史没有数据版本，统一补基准版本
          return {
            ...state,
            tabs: (state?.tabs ?? []).map((tab) => ({
              ...tab,
              dataVersion: tab.dataVersion ?? BASELINE_DATA_VERSION,
            })),
            history: (state?.history ?? []).map((entry) => ({
              ...entry,
              dataVersion: entry.dataVersion ?? BASELINE_DATA_VERSION,
            })),
          } as PersistedWorkbench;
        }
        return state as PersistedWorkbench;
      },
    },
  ),
);
