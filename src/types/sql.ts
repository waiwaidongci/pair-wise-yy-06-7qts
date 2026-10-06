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
}

export interface QueryHistoryEntry {
  id: string;
  sql: string;
  executedAt: number;
  elapsedMs: number;
  rowCount: number;
  success: boolean;
  error?: string;
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
