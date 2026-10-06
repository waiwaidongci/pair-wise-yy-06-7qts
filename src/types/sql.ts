export type SqlValue = string | number | null;

export interface ColumnSchema {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean';
  nullable?: boolean;
  description?: string;
}

export interface TableSchema {
  name: string;
  label: string;
  description: string;
  columns: ColumnSchema[];
  rows: Array<Record<string, SqlValue>>;
}

export interface DatabaseSchema {
  name: string;
  label: string;
  tables: TableSchema[];
}

export interface QueryColumn {
  name: string;
  label: string;
  type: ColumnSchema['type'];
}

export interface QueryResult {
  columns: QueryColumn[];
  rows: Array<Record<string, SqlValue>>;
  rowCount: number;
  totalMatched: number;
  elapsedMs: number;
  sql: string;
  truncated: boolean;
}

export interface QuerySession {
  id: string;
  title: string;
  sql: string;
  updatedAt: number;
  /** 当前标签内结果所基于的数据版本 */
  dataVersion: number;
}

export interface QueryHistoryEntry {
  id: string;
  sql: string;
  executedAt: number;
  elapsedMs: number;
  rowCount: number;
  success: boolean;
  /** 执行时的数据版本 */
  dataVersion: number;
  error?: string;
}

export type QueryJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface QueryJob {
  id: string;
  sql: string;
  /** 订阅该任务结果的标签；同一句查询多个标签只执行一次 */
  tabIds: string[];
  status: QueryJobStatus;
  submittedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  attempts: number;
  /** 开始执行时捕获的数据版本 */
  dataVersion: number | null;
  result: QueryResult | null;
  error: QueryErrorDetail | null;
  /** 锁定的结果在数据版本更新后保留，不参与重算 */
  locked: boolean;
  /** 数据版本已更新，结果已过期 */
  stale: boolean;
  /** 由哪条已过期任务触发的重算 */
  recomputesJobId?: string;
}

export interface FavoriteQuery {
  id: string;
  name: string;
  sql: string;
  createdAt: number;
}

export interface QueryErrorDetail {
  code: string;
  message: string;
  hint: string;
  line: number;
  column: number;
}
