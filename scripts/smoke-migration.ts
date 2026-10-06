// 旧数据迁移冒烟测试（node 运行，非交付代码）
const storage = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = globalThis;
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
  clear: () => storage.clear(),
  key: (i: number) => [...storage.keys()][i] ?? null,
  get length() {
    return storage.size;
  },
};

// 旧版本（v0）持久化数据：标签和历史都没有 dataVersion
storage.set(
  'pair-wise-yy-06-workbench',
  JSON.stringify({
    state: {
      tabs: [{ id: 't1', title: '查询 1', sql: 'SELECT * FROM orders;', updatedAt: 1700000000000 }],
      activeTabId: 't1',
      history: [
        { id: 'h1', sql: 'SELECT * FROM orders;', executedAt: 1700000000000, elapsedMs: 42, rowCount: 10, success: true },
        { id: 'h2', sql: 'SELECT nope;', executedAt: 1700000001000, elapsedMs: 0, rowCount: 0, success: false, error: 'x' },
      ],
      favorites: [],
    },
    version: 0,
  }),
);

const { useWorkbenchStore } = await import('../src/stores/workbenchStore');
const state = useWorkbenchStore.getState();

let failures = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures += 1;
    console.error(`FAIL  ${name} ${extra}`);
  }
}

check('旧标签恢复', state.tabs.length === 1 && state.tabs[0].id === 't1');
check('标签补基准版本', state.tabs[0].dataVersion === 1, `got ${state.tabs[0].dataVersion}`);
check('旧历史恢复', state.history.length === 2);
check('历史补统一基准版本', state.history.every((h) => h.dataVersion === 1),
  JSON.stringify(state.history.map((h) => h.dataVersion)));
check('激活标签保留', state.activeTabId === 't1');

console.log(failures === 0 ? '\nMIGRATION CHECKS PASSED' : `\n${failures} CHECKS FAILED`);
process.exit(failures === 0 ? 0 : 1);
