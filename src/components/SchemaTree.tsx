import { DatabaseOutlined, FieldBinaryOutlined, ReloadOutlined, SearchOutlined, TableOutlined } from '@ant-design/icons';
import { Button, Empty, Input, Spin, Tooltip, Tree, Typography, type TreeDataNode } from 'antd';
import { useMemo, useState } from 'react';
import type { DatabaseSchema } from '../types/sql';

interface SchemaTreeProps {
  schema?: DatabaseSchema;
  loading: boolean;
  onUseTable: (tableName: string) => void;
  onRefreshData: () => void;
}

export function SchemaTree({ schema, loading, onUseTable, onRefreshData }: SchemaTreeProps) {
  const [search, setSearch] = useState('');
  const treeData = useMemo<TreeDataNode[]>(() => {
    if (!schema) return [];
    const needle = search.trim().toLowerCase();
    return [
      {
        key: `database:${schema.name}`,
        title: schema.label,
        icon: <DatabaseOutlined />,
        selectable: false,
        children: schema.tables
          .filter((table) => {
            if (!needle) return true;
            return (
              table.name.toLowerCase().includes(needle) ||
              table.columns.some((column) => column.name.toLowerCase().includes(needle))
            );
          })
          .map((table) => ({
            key: `table:${table.name}`,
            title: table.label,
            icon: <TableOutlined />,
            children: table.columns.map((column) => ({
              key: `column:${table.name}.${column.name}`,
              title: `${column.name}  ${column.type}`,
              icon: <FieldBinaryOutlined />,
              selectable: false,
            })),
          })),
      },
    ];
  }, [schema, search]);

  return (
    <aside className="schema-pane">
      <div className="pane-heading">
        <div>
          <Typography.Text strong>数据资源</Typography.Text>
          <Typography.Text type="secondary"> commerce_dw</Typography.Text>
        </div>
        <span className="pane-heading__actions">
          <Tooltip title="刷新数据版本，未锁定的过期结果将自动重算">
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined />}
              onClick={onRefreshData}
            />
          </Tooltip>
          <span className="online-dot" title="模拟数据源在线" />
        </span>
      </div>
      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder="搜索表或字段"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="schema-tree">
        {loading ? (
          <div className="schema-loading"><Spin size="small" /></div>
        ) : treeData.length ? (
          <Tree
            showIcon
            blockNode
            defaultExpandedKeys={['database:commerce_dw', 'table:orders']}
            treeData={treeData}
            onSelect={(keys) => {
              const key = String(keys[0] ?? '');
              if (key.startsWith('table:')) {
                onUseTable(key.slice('table:'.length));
              }
            }}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的数据表或字段" />
        )}
      </div>
      <div className="schema-note">
        <strong>查询提示</strong>
        <span>单击表名可生成基础查询，双击结果单元格即可复制。</span>
      </div>
    </aside>
  );
}
