import type { QueryErrorDetail } from '../types/sql';

export class SqlQueryError extends Error {
  readonly code: string;
  readonly hint: string;
  readonly position: number;

  constructor(code: string, message: string, hint: string, position = 0) {
    super(message);
    this.name = 'SqlQueryError';
    this.code = code;
    this.hint = hint;
    this.position = position;
  }
}

export function toQueryErrorDetail(error: unknown, sql: string): QueryErrorDetail {
  const position = error instanceof SqlQueryError ? error.position : 0;
  const before = sql.slice(0, Math.max(0, position));
  const lines = before.split('\n');
  return {
    code: error instanceof SqlQueryError ? error.code : 'QUERY_001',
    message: error instanceof Error ? error.message : '查询执行失败',
    hint: error instanceof SqlQueryError ? error.hint : '检查 SQL 语句后重试，必要时拆分查询。',
    line: lines.length,
    column: (lines.at(-1)?.length ?? 0) + 1,
  };
}

export const ERROR_MAPPINGS: Record<string, { title: string; hint: string }> = {
  QUERY_001: { title: '执行失败', hint: '检查语法、字段名和表名。' },
  SQL_PARSE: { title: 'SQL 语法错误', hint: '工作台当前支持单条 SELECT 查询。' },
  TABLE_NOT_FOUND: { title: '数据表不存在', hint: '从左侧结构树选择已有表名。' },
  COLUMN_NOT_FOUND: { title: '字段不存在', hint: '使用补全提示选择表中存在的字段。' },
  EMPTY_SQL: { title: '未输入 SQL', hint: '请输入一条 SELECT 查询。' },
  QUERY_ABORTED: { title: '查询已取消', hint: '可修改条件后重新执行。' },
};
