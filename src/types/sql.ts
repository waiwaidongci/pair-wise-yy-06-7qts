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

/** 执行队列中一条任务的状态 */
export type QueryJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

/** 标签结果相对当前数据版本的状态 */
export type ResultStatus = 'fresh' | 'stale' | 'locked';

/** 标签上一次执行的结果，附带执行时的数据版本 */
export interface TabResult {
  /** 执行时的数据版本 */
  dataVersion: number;
  data: QueryResult;
  status: ResultStatus;
  executedAt: number;
}

/** 一条执行任务，按提交顺序排队，同一句 SQL 在并发期内只执行一次 */
export interface QueryJob {
  id: string;
  /** 归一化后的 SQL（trim） */
  sql: string;
  status: QueryJobStatus;
  /** 共享这条任务的标签 id（去重时多个标签共用一次执行） */
  tabIds: string[];
  submittedAt: number;
  startedAt?: number;
  finishedAt?: number;
  /** 第几次入队（重试会累加） */
  attempts: number;
  error?: string;
  errorDetail?: QueryErrorDetail;
  /** 实际执行时的数据版本 */
  dataVersion?: number;
}

export interface QuerySession {
  id: string;
  title: string;
  sql: string;
  updatedAt: number;
  /** 该标签最近一次执行结果（按标签各自保存，切换标签看到的是本标签的结果） */
  result?: TabResult | null;
}

export interface QueryHistoryEntry {
  id: string;
  sql: string;
  executedAt: number;
  elapsedMs: number;
  rowCount: number;
  success: boolean;
  error?: string;
  /** 执行时的数据版本，旧数据升级时补统一基准版本 */
  dataVersion: number;
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
