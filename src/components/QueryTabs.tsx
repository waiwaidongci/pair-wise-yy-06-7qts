import { CloseOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Tabs } from 'antd';
import type { QueryJobStatus, QuerySession } from '../types/sql';

interface QueryTabsProps {
  tabs: QuerySession[];
  activeTabId: string;
  tabStatuses?: Record<string, QueryJobStatus | 'stale'>;
  onActivate: (id: string) => void;
  onAdd: () => void;
  onClose: (id: string) => void;
}

export function QueryTabs({
  tabs,
  activeTabId,
  tabStatuses,
  onActivate,
  onAdd,
  onClose,
}: QueryTabsProps) {
  return (
    <div className="query-tabs">
      <Tabs
        activeKey={activeTabId}
        onChange={onActivate}
        onEdit={(key, action) => {
          if (action === 'add') onAdd();
          if (action === 'remove') onClose(String(key));
        }}
        type="editable-card"
        hideAdd
        items={tabs.map((tab) => {
          const status = tabStatuses?.[tab.id];
          return {
            key: tab.id,
            label: (
              <span className="tab-label">
                <span className={`tab-status${status ? ` tab-status--${status}` : ''}`} />
                {tab.title}
              </span>
            ),
            closable: true,
          };
        })}
      />
      <Button
        type="text"
        className="add-query-tab"
        icon={<PlusOutlined />}
        title="新建查询标签"
        onClick={onAdd}
      />
      <span className="query-tabs__spacer" />
      <Button
        type="text"
        icon={<CloseOutlined />}
        title="关闭当前标签"
        onClick={() => onClose(activeTabId)}
      />
    </div>
  );
}
