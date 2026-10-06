import { CopyOutlined, DownloadOutlined, LockOutlined, TableOutlined, UnlockOutlined } from '@ant-design/icons';
import { App as AntdApp, Button, Empty, Spin, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { TableProps } from 'antd';
import { useEffect, useMemo, useState, type ThHTMLAttributes } from 'react';
import type { QueryJobStatus, QueryResult, SqlValue } from '../types/sql';

interface ResultGridProps {
  result: QueryResult | null;
  status?: QueryJobStatus;
  queuePosition?: number;
  error: string | null;
  dataVersion?: number | null;
  stale?: boolean;
  locked?: boolean;
  sqlOutdated?: boolean;
  onToggleLock?: () => void;
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

export function ResultGrid({
  result,
  status,
  queuePosition = 0,
  error,
  dataVersion,
  stale = false,
  locked = false,
  sqlOutdated = false,
  onToggleLock,
}: ResultGridProps) {
  const { message } = AntdApp.useApp();
  const [widths, setWidths] = useState<Record<string, number>>({});

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
    const blob = new Blob([`\uFEFF${[header, ...rows].join('\n')}`], {
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

  return (
    <section className="result-pane">
      <div className="result-heading">
        <div className="result-heading__title">
          <TableOutlined />
          <strong>查询结果</strong>
          {result && (
            <>
              <Tag color={result.truncated ? 'orange' : 'green'}>
                {result.rowCount.toLocaleString('zh-CN')} 行
              </Tag>
              <span>匹配 {result.totalMatched.toLocaleString('zh-CN')} 行</span>
              <span>· {result.elapsedMs} ms</span>
            </>
          )}
          {dataVersion != null && <Tag color="geekblue">数据 v{dataVersion}</Tag>}
          {stale && <Tag color="warning">已过期 · 等待重算结果</Tag>}
          {locked && result && (
            <Tag icon={<LockOutlined />} color="blue">
              已锁定 · 基于 v{dataVersion}
            </Tag>
          )}
          {sqlOutdated && <Tag color="gold">语句已修改</Tag>}
        </div>
        <div>
          {onToggleLock && (
            <Tooltip title={locked ? '解除锁定，数据变更后参与重算' : '锁定结果，数据变更后保留此版本'}>
              <Button
                type="text"
                size="small"
                icon={locked ? <LockOutlined /> : <UnlockOutlined />}
                onClick={onToggleLock}
              />
            </Tooltip>
          )}
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
        {status === 'running' ? (
          <div className="result-state">
            <Spin size="large" />
            <span>模拟数据源正在执行查询…</span>
          </div>
        ) : status === 'queued' ? (
          <div className="result-state">
            <Spin size="large" />
            <span>
              排队等待执行{queuePosition > 0 ? ` · 前面还有 ${queuePosition} 条` : ''}…
            </span>
          </div>
        ) : error ? (
          <div className="result-error">
            <strong>查询未能执行</strong>
            <span>{error}</span>
            <small>错误位置已在编辑器中高亮，可在执行队列中重试该条查询。</small>
          </div>
        ) : status === 'cancelled' ? (
          <div className="result-state">
            <span>查询已取消，可在执行队列中重试</span>
          </div>
        ) : result ? (
          <div className={stale ? 'result-table result-table--stale' : 'result-table'}>
            <Table<Record<string, SqlValue | number>>
              {...tableProps}
              columns={columns}
              dataSource={dataSource}
            />
          </div>
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
