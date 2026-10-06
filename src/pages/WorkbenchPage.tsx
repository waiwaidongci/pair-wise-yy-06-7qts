import {
  BookOutlined,
  CaretRightOutlined,
  FormatPainterOutlined,
  HistoryOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, App as AntdApp, Button, Input, Modal, Space, Tooltip } from 'antd';
import { useMemo, useState } from 'react';
import { QueryQueue } from '../components/QueryQueue';
import { QueryTabs } from '../components/QueryTabs';
import { ResultGrid } from '../components/ResultGrid';
import { SchemaTree } from '../components/SchemaTree';
import { SqlEditor } from '../components/SqlEditor';
import { getSchema } from '../data/mockDatabase';
import { useWorkbenchStore } from '../stores/workbenchStore';
import { formatSql } from '../utils/sqlFormatter';
import { ERROR_MAPPINGS } from '../utils/queryErrors';

export function WorkbenchPage() {
  const { message } = AntdApp.useApp();
  const tabs = useWorkbenchStore((state) => state.tabs);
  const activeTabId = useWorkbenchStore((state) => state.activeTabId);
  const dataVersion = useWorkbenchStore((state) => state.dataVersion);
  const jobs = useWorkbenchStore((state) => state.jobs);
  const addTab = useWorkbenchStore((state) => state.addTab);
  const closeTab = useWorkbenchStore((state) => state.closeTab);
  const activateTab = useWorkbenchStore((state) => state.activateTab);
  const updateTab = useWorkbenchStore((state) => state.updateTab);
  const submitQuery = useWorkbenchStore((state) => state.submitQuery);
  const cancelJob = useWorkbenchStore((state) => state.cancelJob);
  const retryJob = useWorkbenchStore((state) => state.retryJob);
  const dismissJob = useWorkbenchStore((state) => state.dismissJob);
  const clearFinishedJobs = useWorkbenchStore((state) => state.clearFinishedJobs);
  const lockResult = useWorkbenchStore((state) => state.lockResult);
  const unlockResult = useWorkbenchStore((state) => state.unlockResult);
  const recomputeTab = useWorkbenchStore((state) => state.recomputeTab);
  const bumpDataVersion = useWorkbenchStore((state) => state.bumpDataVersion);
  const addFavorite = useWorkbenchStore((state) => state.addFavorite);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const schemaQuery = useQuery({ queryKey: ['database-schema'], queryFn: getSchema });
  const [favoriteOpen, setFavoriteOpen] = useState(false);
  const [favoriteName, setFavoriteName] = useState('');

  // 当前标签关联的任务
  const activeJobs = useMemo(
    () => jobs.filter((job) => job.tabIds.includes(activeTab?.id ?? '')),
    [jobs, activeTab?.id],
  );
  const activeRunningJob = activeJobs.find(
    (job) => job.status === 'queued' || job.status === 'running',
  );
  const activeErrorJob = [...activeJobs]
    .reverse()
    .find((job) => job.status === 'failed' && job.errorDetail);

  const running = Boolean(activeRunningJob);
  const errorDetail = activeErrorJob?.errorDetail ?? null;
  const errorTitle = errorDetail ? ERROR_MAPPINGS[errorDetail.code]?.title ?? '执行失败' : '';

  const complexity = useMemo(() => {
    const sql = activeTab?.sql ?? '';
    return {
      lines: sql.split('\n').length,
      chars: sql.length,
      hasLimit: /\blimit\b/i.test(sql),
    };
  }, [activeTab?.sql]);

  if (!activeTab) return null;

  const execute = () => {
    submitQuery(activeTab.id, activeTab.sql);
  };

  const cancel = () => {
    if (activeRunningJob) {
      cancelJob(activeRunningJob.id);
      void message.info('已发送取消请求');
    }
  };

  const runFormat = () => {
    updateTab(activeTab.id, formatSql(activeTab.sql));
  };

  const useTable = (tableName: string) => {
    const table = schemaQuery.data?.tables.find((item) => item.name === tableName);
    if (!table) return;
    const sql = `SELECT *\nFROM ${table.name}\nLIMIT 500;`;
    updateTab(activeTab.id, sql, table.name);
  };

  const sqlChanged = Boolean(
    activeTab.result && activeTab.result.data.sql.trim() !== activeTab.sql.trim(),
  );

  return (
    <div className="workbench">
      <SchemaTree
        schema={schemaQuery.data}
        loading={schemaQuery.isLoading}
        onUseTable={useTable}
        onRefreshData={bumpDataVersion}
      />
      <main className="query-main">
        <section className="editor-panel">
          <QueryTabs
            tabs={tabs}
            activeTabId={activeTab.id}
            onActivate={activateTab}
            onAdd={() => addTab()}
            onClose={closeTab}
          />
          <div className="editor-toolbar">
            <Space size={6}>
              <Tooltip title="最多同时执行 2 条，其余排队；同一句 SQL 多标签同时提交只算一次">
                <Button
                  type="primary"
                  icon={<CaretRightOutlined />}
                  loading={running}
                  onClick={execute}
                >
                  执行
                </Button>
              </Tooltip>
              <Tooltip title="取消当前标签的执行任务，不影响队列中其他任务">
                <Button danger icon={<StopOutlined />} disabled={!running} onClick={cancel}>
                  取消
                </Button>
              </Tooltip>
              <Button icon={<FormatPainterOutlined />} onClick={runFormat}>
                格式化
              </Button>
              <Button
                icon={<BookOutlined />}
                onClick={() => {
                  setFavoriteName(`收藏 ${useWorkbenchStore.getState().favorites.length + 1}`);
                  setFavoriteOpen(true);
                }}
              >
                收藏
              </Button>
            </Space>
            <Space size={16} className="editor-meta">
              <span>
                <HistoryOutlined /> {complexity.lines} 行 / {complexity.chars} 字符
              </span>
              <span className={complexity.hasLimit ? 'meta-ok' : 'meta-warn'}>
                {complexity.hasLimit ? '已设置 LIMIT' : '建议设置 LIMIT'}
              </span>
              <kbd>⌘ Enter</kbd>
            </Space>
          </div>
          {errorDetail && (
            <Alert
              closable
              showIcon
              type="error"
              message={`${errorTitle} [${errorDetail.code}] 第 ${errorDetail.line} 行，第 ${errorDetail.column} 列`}
              description={`${errorDetail.message} ${errorDetail.hint}`}
              onClose={() => {
                if (activeErrorJob) dismissJob(activeErrorJob.id);
              }}
            />
          )}
          <div className="editor-wrap">
            <SqlEditor
              key={activeTab.id}
              value={activeTab.sql}
              schema={schemaQuery.data}
              error={errorDetail}
              onChange={(sql) => updateTab(activeTab.id, sql)}
              onExecute={execute}
              onFormat={runFormat}
            />
          </div>
        </section>
        <ResultGrid
          tabResult={activeTab.result ?? null}
          currentVersion={dataVersion}
          loading={running}
          error={errorDetail?.message ?? null}
          sqlChanged={sqlChanged}
          onToggleLock={() =>
            activeTab.result?.status === 'locked'
              ? unlockResult(activeTab.id)
              : lockResult(activeTab.id)
          }
          onRecompute={() => recomputeTab(activeTab.id)}
        />
        <QueryQueue
          jobs={jobs}
          onCancel={cancelJob}
          onRetry={retryJob}
          onDismiss={dismissJob}
          onClearFinished={clearFinishedJobs}
        />
      </main>
      <Modal
        open={favoriteOpen}
        title="收藏当前查询"
        okText="保存收藏"
        cancelText="取消"
        onCancel={() => setFavoriteOpen(false)}
        onOk={() => {
          if (!favoriteName.trim()) {
            void message.warning('请输入收藏名称');
            return;
          }
          addFavorite(favoriteName, activeTab.sql);
          setFavoriteOpen(false);
          void message.success('查询已收藏');
        }}
      >
        <Input
          autoFocus
          value={favoriteName}
          placeholder="例如：华东区高金额订单"
          onChange={(event) => setFavoriteName(event.target.value)}
          onPressEnter={() => {
            addFavorite(favoriteName, activeTab.sql);
            setFavoriteOpen(false);
          }}
        />
      </Modal>
    </div>
  );
}
