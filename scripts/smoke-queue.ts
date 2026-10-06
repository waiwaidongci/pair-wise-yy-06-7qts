// 队列行为冒烟测试（node 运行，非交付代码）
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

const { useExecutionStore } = await import('../src/stores/executionStore');
const { useWorkbenchStore } = await import('../src/stores/workbenchStore');
const { getDataVersion } = await import('../src/data/mockDatabase');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let failures = 0;
function check(name: string, cond: boolean, extra = '') {
  if (cond) console.log(`  ok  ${name}`);
  else {
    failures += 1;
    console.error(`FAIL  ${name} ${extra}`);
  }
}
const jobs = () => useExecutionStore.getState().jobs;
const byStatus = (s: string) => jobs().filter((j) => j.status === s);
const wb = () => useWorkbenchStore.getState();

async function waitFor(desc: string, pred: () => boolean, timeout = 15000) {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeout) throw new Error(`timeout waiting: ${desc}`);
    await sleep(30);
  }
}

// --- 1. 并发 2 + FIFO ---
const t1 = wb().tabs[0].id;
wb().addTab('SELECT * FROM customers LIMIT 10;');
wb().addTab('SELECT * FROM products LIMIT 10;');
wb().addTab('SELECT * FROM employees LIMIT 10;');
const [tab1, tab2, tab3, tab4] = wb().tabs.map((t) => t.id);
void t1;

const sql1 = wb().tabs[0].sql;
useExecutionStore.getState().submit(tab1, sql1);
useExecutionStore.getState().submit(tab2, 'SELECT * FROM customers LIMIT 10;');
useExecutionStore.getState().submit(tab3, 'SELECT * FROM products LIMIT 10;');
useExecutionStore.getState().submit(tab4, 'SELECT * FROM employees LIMIT 10;');
await sleep(80);
check('最多同时跑两条', byStatus('running').length === 2, `running=${byStatus('running').length}`);
check('其余排队', byStatus('queued').length === 2, `queued=${byStatus('queued').length}`);

// --- 2. 同句去重：tab2 提交与 tab3 排队中相同的 SQL ---
const before = jobs().length;
useExecutionStore.getState().submit(tab2, 'SELECT * FROM products LIMIT 10;');
check('同句查询只算一次', jobs().length === before);
const shared = jobs().find((j) => j.sql.includes('products'));
check('两个标签共享同一任务', shared?.tabIds.includes(tab2) && shared?.tabIds.includes(tab3));
// tab2 重新提交后，它原来的 customers 任务被取代（无其他标签等待）
const supersededId = jobs().find((j) => j.sql.includes('customers LIMIT 10'))!.id;
await waitFor('取代任务被取消', () =>
  jobs().find((j) => j.id === supersededId)?.status === 'cancelled');
check('被取代的任务自动取消', true);

await waitFor('全部完成', () =>
  jobs().every((j) => j.status === 'succeeded' || j.status === 'cancelled'));
check('3 条成功 1 条被取代', byStatus('succeeded').length === 3 && byStatus('cancelled').length === 1,
  `succeeded=${byStatus('succeeded').length} cancelled=${byStatus('cancelled').length}`);
check('共享任务两个标签都指到它', useExecutionStore.getState().tabJobs[tab2] === shared?.id
  && useExecutionStore.getState().tabJobs[tab3] === shared?.id);
check('历史记录带数据版本', wb().history.every((h) => h.dataVersion === 1), JSON.stringify(wb().history.map(h=>h.dataVersion)));
check('历史只记一次（去重）', wb().history.filter((h) => h.sql.includes('products')).length === 1);
check('标签数据版本已更新', wb().tabs.every((t) => t.dataVersion === 1));

// --- 3. 取消只影响当前那条 ---
useExecutionStore.getState().submit(tab1, 'SELECT * FROM orders LIMIT 5;');
useExecutionStore.getState().submit(tab2, 'SELECT * FROM customers LIMIT 20;');
useExecutionStore.getState().submit(tab3, 'SELECT * FROM employees LIMIT 30;');
await sleep(60);
const cancelTarget = jobs().find((j) => j.status === 'queued' && j.sql.includes('employees'));
useExecutionStore.getState().cancelJob(cancelTarget!.id);
check('排队任务被取消', jobs().find((j) => j.id === cancelTarget!.id)?.status === 'cancelled');
await waitFor('其余完成', () =>
  jobs().filter((j) => j.sql.includes('orders LIMIT 5') || j.sql.includes('customers LIMIT 20'))
    .every((j) => j.status === 'succeeded'));
check('其他任务不受影响', byStatus('succeeded').length === 5);

// --- 4. 失败保留可重试，重试只重跑该条 ---
useExecutionStore.getState().submit(tab4, 'SELECT nope FROM nowhere;');
await waitFor('失败', () => jobs().some((j) => j.status === 'failed'));
const failed = jobs().find((j) => j.status === 'failed')!;
const succeededBefore = byStatus('succeeded').length;
useExecutionStore.getState().retryJob(failed.id);
await waitFor('重试后仍失败', () => jobs().find((j) => j.id === failed.id)?.status === 'failed');
check('重试后仍失败（语句未改）', jobs().find((j) => j.id === failed.id)?.attempts === 2);
check('已完成的不重做', byStatus('succeeded').length === succeededBefore);

// 取消的任务也可重试并成功
useExecutionStore.getState().retryJob(cancelTarget!.id);
await waitFor('取消任务重试成功', () => jobs().find((j) => j.id === cancelTarget!.id)?.status === 'succeeded');
check('取消的任务重试成功', true);

// --- 5. 数据版本更新：标过期 + 重算；锁定保留 ---
const lockTarget = jobs().find((j) => j.status === 'succeeded' && j.sql.includes('orders LIMIT 5'))!;
useExecutionStore.getState().toggleLock(lockTarget.id);
const versionBefore = getDataVersion();
const unlockedSucceeded = () => byStatus('succeeded').filter((j) => !j.locked && !j.recomputesJobId);
const expectedStale = unlockedSucceeded().length;
useExecutionStore.getState().simulateDataChange();
check('数据版本 +1', getDataVersion() === versionBefore + 1);
check('未锁定成功结果全部标过期', jobs().filter((j) => j.stale).length === expectedStale,
  `stale=${jobs().filter((j) => j.stale).length} expected=${expectedStale}`);
check('锁定结果未标过期', !jobs().find((j) => j.id === lockTarget.id)?.stale);
check('过期任务触发重算', jobs().some((j) => j.recomputesJobId));
await waitFor('重算完成', () =>
  jobs().filter((j) => j.recomputesJobId).every((j) => j.status === 'succeeded'));
const recomputed = jobs().filter((j) => j.recomputesJobId);
check('重算结果基于新版本', recomputed.every((j) => j.dataVersion === versionBefore + 1));
// 仍停留在过期结果上的标签被切到新结果；已指向锁定/失败任务的标签不动
check('重算后标签指向新结果',
  useExecutionStore.getState().tabJobs[tab2] === recomputed.find((j) => j.sql.includes('customers LIMIT 20'))?.id
  && useExecutionStore.getState().tabJobs[tab3] === recomputed.find((j) => j.sql.includes('employees LIMIT 30'))?.id);
check('锁定结果所在的标签保持不动', useExecutionStore.getState().tabJobs[tab1] === lockTarget.id);
check('锁定结果仍基于旧版本', jobs().find((j) => j.id === lockTarget.id)?.dataVersion === 1
  && jobs().find((j) => j.id === lockTarget.id)?.status === 'succeeded');

// --- 6. 锁定结果在后续版本更新中不再重算 ---
useExecutionStore.getState().simulateDataChange();
await waitFor('第二轮重算完成', () =>
  jobs().filter((j) => j.status === 'queued' || j.status === 'running').length === 0);
check('锁定任务没有产生重算', !jobs().some((j) => j.recomputesJobId === lockTarget.id));
check('锁定结果保持 v1', jobs().find((j) => j.id === lockTarget.id)?.dataVersion === 1);
const recomputeSources = jobs().filter((j) => j.recomputesJobId).map((j) => j.recomputesJobId);
check('每条过期任务只重算一次', new Set(recomputeSources).size === recomputeSources.length,
  JSON.stringify(recomputeSources));
check('两轮重算分别基于 v2 / v3',
  jobs().filter((j) => j.recomputesJobId && j.dataVersion === 2).length === 5
  && jobs().filter((j) => j.recomputesJobId && j.dataVersion === 3).length === 5,
  JSON.stringify(jobs().filter((j) => j.recomputesJobId).map((j) => j.dataVersion)));

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECKS FAILED`);
process.exit(failures === 0 ? 0 : 1);
