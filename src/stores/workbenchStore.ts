import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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
  addHistory: (entry: Omit<QueryHistoryEntry, 'id'>) => void;
  clearHistory: () => void;
  addFavorite: (name: string, sql: string) => void;
  removeFavorite: (id: string) => void;
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
      partialize: (state) => ({
        tabs: state.tabs,
        activeTabId: state.activeTabId,
        history: state.history,
        favorites: state.favorites,
      }),
    },
  ),
);
