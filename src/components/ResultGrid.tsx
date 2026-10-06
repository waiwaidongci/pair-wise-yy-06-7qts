import {
  CopyOutlined,
  DownloadOutlined,
  LockOutlined,
  ReloadOutlined,
  TableOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import { App as AntdApp, Alert, Button, Empty, Spin, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { TableProps } from 'antd';
import { useEffect, useMemo, useState, type ThHTMLAttributes } from 'react';
import type { ResultStatus, SqlValue, TabResult } from '../types/sql';

interface ResultGridProps {
  tabResult: TabResult | null;
  currentVersion: number;
  loading: boolean;
  error: string | null;
  /** 当前编辑器 SQL 与结果所用 SQL 不一致（改了语句未重跑） */
  sqlChanged: boolean;
  onToggleLock: () => void;
  onRecompute: () => void;
}

interface ResizableTitleProps extends ThHTMLAttributes<HTMLTableCellElement> {
  width?: number;
  onResize?: (width: number) => void;
}

function ResizableTitle({ width, onResize, children, ...restProps }: ResizableTitleProps) {
  if (!width || !onResize) {
    return <th {...restProps}>{children}</th>;
  }
  return (
    <th {...restProps}>
      <div className="resizable-title">
        <span>{children}</span>
        <span
          className="column-resizer"
          onMouseDown={(event) => {
            event.preventDefault();
            const startX = event.clientX;
            const startWidth = width;
            const onMouseMove = (moveEvent: MouseEvent) => {
              onResize(Math.max(90, startWidth + moveEvent.clientX - startX));
            };
            const onMouseUp = () => {
              document.removeEventListener('mousemove', onMouseMove);
              document.removeEventListener('mouseup', onMouseUp);
            };
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
          }}
        />
      </div>
    </th>
  );
}

function normalizeRow(row: Record<string, SqlValue>): Record<string, SqlValue> {
  return row;
}

const STATUS_META: Record<ResultStatus, { color: string; text: string }> = {
  fresh: { color: 'green', text: '最新' },
  stale: { color: 'orange', text: '已过期' },
  locked: { color: 'blue', text: '已锁定' },
};

export function ResultGrid({
  tabResult,
  currentVersion,
  loading,
  error,
  sqlChanged,
  onToggleLock,
  onRecompute,
}: ResultGridProps) {
  const { message } = AntdApp.useApp();
  const [widths, setWidths] = useState<Record<string, number>>({});

  const result = tabResult?.data ?? null;
  const status = tabResult?.status ?? null;
  const dataVersion = tabResult?.dataVersion ?? null;

  useEffect(() => {
    if (!result) return;
    setWidths(
      Object.fromEntries(
        result.columns.map((column) => [
          column.name,
          Math.max(130, Math.min(260, column.name.length * 14 + 60)),
        ]),
      ),
    );
  }, [result]);

  const copyValue = async (value: SqlValue) => {
    await navigator.clipboard.writeText(value === null ? 'NULL' : String(value));
    void message.success('单元格内容已复制');
  };

  const dataSource = useMemo(
    () =>
      (result?.rows ?? []).map((row, index) => ({
        ...normalizeRow(row),
        __rowKey: index,
      })),
    [result],
  );
  const resultWidth = useMemo(
    () =>
      result?.columns.reduce(
        (sum, column) => sum + (widths[column.name] ?? 160),
        0,
      ) ?? 0,
    [result, widths],
  );

  const columns = useMemo<ColumnsType<Record<string, SqlValue | number>>>(() => {
    if (!result) return [];
    return result.columns.map((column) => ({
      title: column.name,
      dataIndex: column.name,
      key: column.name,
      width: widths[column.name] ?? 160,
      ellipsis: true,
      render: (value: SqlValue) => (
        <span
          className={value === null ? 'null-value' : 'result-cell'}
          title="右键复制单元格"
          onContextMenu={(event) => {
            event.preventDefault();
            void copyValue(value);
          }}
        >
          {value === null ? 'NULL' : String(value)}
        </span>
      ),
      onHeaderCell: () => ({
        width: widths[column.name] ?? 160,
        onResize: (width: number) =>
          setWidths((current) => ({ ...current, [column.name]: width })),
      }),
    }));
  }, [result, widths]);

  const exportCsv = () => {
    if (!result) return;
    const header = result.columns.map((column) => column.name).join(',');
    const rows = result.rows.map((row) =>
      result.columns
        .map((column) => `"${String(row[column.name] ?? '').replaceAll('"', '""')}"`)
        .join(','),
    );
    const blob = new Blob([`﻿${[header, ...rows].join('\n')}`], {
      type: 'text/csv;charset=utf-8',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `query-result-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const tableProps: TableProps<Record<string, SqlValue | number>> = {
    virtual: true,
    size: 'small',
    bordered: true,
    rowKey: '__rowKey',
    scroll: { x: Math.max(640, resultWidth), y: 330 },
    components: {
      header: {
        cell: ResizableTitle,
      },
    },
    pagination: {
      defaultPageSize: 100,
      pageSizeOptions: [50, 100, 200, 500],
      showSizeChanger: true,
      showQuickJumper: true,
      showTotal: (total) => `共 ${total} 行`,
      size: 'small',
    },
  };

  const stale = status === 'stale';
  const locked = status === 'locked';

  return (
    <section className="result-pane">
      <div className="result-heading">
        <div className="result-heading__title">
          <TableOutlined />
          <strong>查询结果</strong>
          {result && status && (
            <Tag color={STATUS_META[status].color}>{STATUS_META[status].text}</Tag>
          )}
          {result && dataVersion !== null && (
            <Tooltip title={locked ? '结果已锁定，不会随数据版本更新重算' : '结果执行时的数据版本'}>
              <Tag color={dataVersion >= currentVersion ? 'default' : 'warning'}>
                基于 v{dataVersion}
              </Tag>
            </Tooltip>
          )}
          {result && (
            <>
              <Tag color={result.truncated ? 'orange' : 'green'}>
                {result.rowCount.toLocaleString('zh-CN')} 行
              </Tag>
              <span>匹配 {result.totalMatched.toLocaleString('zh-CN')} 行</span>
              <span>· {result.elapsedMs} ms</span>
            </>
          )}
        </div>
        <div>
          <Tooltip title={locked ? '解锁后，数据版本更新将自动重算' : '锁定当前结果，版本更新后保留不重算'}>
            <Button
              type="text"
              size="small"
              icon={locked ? <LockOutlined /> : <UnlockOutlined />}
              disabled={!result}
              onClick={onToggleLock}
            >
              {locked ? '已锁定' : '锁定'}
            </Button>
          </Tooltip>
          <Button
            type="text"
            size="small"
            icon={<ReloadOutlined />}
            disabled={!result || loading || locked}
            title={locked ? '结果已锁定，请先解锁再重算' : '按当前 SQL 重新执行'}
            onClick={onRecompute}
          >
            重算
          </Button>
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            disabled={!result}
            onClick={() => {
              if (!result) return;
              void navigator.clipboard
                .writeText(
                  [
                    result.columns.map((column) => column.name).join('\t'),
                    ...result.rows.map((row) =>
                      result.columns.map((column) => row[column.name] ?? '').join('\t'),
                    ),
                  ].join('\n'),
                )
                .then(() => message.success('结果已复制为制表符文本'));
            }}
          >
            复制
          </Button>
          <Button
            type="text"
            size="small"
            icon={<DownloadOutlined />}
            disabled={!result}
            onClick={exportCsv}
          >
            CSV
          </Button>
        </div>
      </div>
      <div className="result-body">
        {loading && !result ? (
          <div className="result-state">
            <Spin size="large" />
            <span>模拟数据源正在执行查询…</span>
          </div>
        ) : error ? (
          <div className="result-error">
            <strong>查询未能执行</strong>
            <span>{error}</span>
            <small>错误位置已在编辑器中高亮，可按 Esc 关闭提示后修改 SQL。</small>
          </div>
        ) : result ? (
          <>
            {stale && (
              <Alert
                className="result-stale-alert"
                showIcon
                type="warning"
                message={`结果已过期：基于数据版本 v${dataVersion}，当前为 v${currentVersion}，正在自动重算…`}
              />
            )}
            {sqlChanged && !stale && (
              <Alert
                className="result-stale-alert"
                showIcon
                type="info"
                message="SQL 已修改，当前结果基于上次执行的语句"
                action={
                  <Button size="small" type="link" onClick={onRecompute}>
                    重新执行
                  </Button>
                }
              />
            )}
            <div className={stale || loading ? 'result-table--dimmed' : undefined}>
              <Table<Record<string, SqlValue | number>>
                {...tableProps}
                columns={columns}
                dataSource={dataSource}
              />
            </div>
          </>
        ) : (
          <Empty
            className="result-empty"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="执行查询后，结果将在这里显示"
          />
        )}
      </div>
    </section>
  );
}
