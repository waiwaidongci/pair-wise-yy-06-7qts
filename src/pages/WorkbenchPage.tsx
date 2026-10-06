import {
  BookOutlined,
  CaretRightOutlined,
  FormatPainterOutlined,
  HistoryOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, App as AntdApp, Button, Input, Modal, Space, Tooltip } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ExecutionQueuePanel } from '../components/ExecutionQueuePanel';
import { QueryTabs } from '../components/QueryTabs';
import { ResultGrid } from '../components/ResultGrid';
import { SchemaTree } from '../components/SchemaTree';
import { SqlEditor } from '../components/SqlEditor';
import { getSchema } from '../data/mockDatabase';
import { useExecutionStore } from '../stores/executionStore';
import { useWorkbenchStore } from '../stores/workbenchStore';
import type { QueryJobStatus } from '../types/sql';
import { formatSql } from '../utils/sqlFormatter';
import { ERROR_MAPPINGS } from '../utils/queryErrors';

export function WorkbenchPage() {
  const { message } = AntdApp.useApp();
  const tabs = useWorkbenchStore((state) => state.tabs);
  const activeTabId = useWorkbenchStore((state) => state.activeTabId);
  const addTab = useWorkbenchStore((state) => state.addTab);
  const closeTab = useWorkbenchStore((state) => state.closeTab);
  const activateTab = useWorkbenchStore((state) => state.activateTab);
  const updateTab = useWorkbenchStore((state) => state.updateTab);
  const addFavorite = useWorkbenchStore((state) => state.addFavorite);
  const jobs = useExecutionStore((state) => state.jobs);
  const tabJobs = useExecutionStore((state) => state.tabJobs);
  const dataVersion = useExecutionStore((state) => state.dataVersion);
  const submit = useExecutionStore((state) => state.submit);
  const cancelJob = useExecutionStore((state) => state.cancelJob);
  const retryJob = useExecutionStore((state) => state.retryJob);
  const toggleLock = useExecutionStore((state) => state.toggleLock);
  const simulateDataChange = useExecutionStore((state) => state.simulateDataChange);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const schemaQuery = useQuery({ queryKey: ['database-schema'], queryFn: getSchema });
  const [favoriteOpen, setFavoriteOpen] = useState(false);
  const [favoriteName, setFavoriteName] = useState('');
  const [errorDismissedFor, setErrorDismissedFor] = useState<string | null>(null);
  const truncatedNotifiedRef = useRef<string | null>(null);

  const activeJob = jobs.find((job) => job.id === tabJobs[activeTab?.id ?? '']);
  const running = activeJob?.status === 'running';
  const queued = activeJob?.status === 'queued';
  const result = activeJob?.result ?? null;
  const error = activeJob?.error ?? null;
  const errorTitle = error ? ERROR_MAPPINGS[error.code]?.title ?? '执行失败' : '';

  const queuePosition = useMemo(() => {
    if (!activeJob || activeJob.status !== 'queued') return 0;
    return jobs.filter(
      (job) => job.status === 'queued' && job.submittedAt < activeJob.submittedAt,
    ).length;
  }, [jobs, activeJob]);

  const tabStatuses = useMemo(() => {
    const map: Record<string, QueryJobStatus | 'stale'> = {};
    tabs.forEach((tab) => {
      const job = jobs.find((item) => item.id === tabJobs[tab.id]);
      if (!job) return;
      map[tab.id] = job.status === 'succeeded' && job.stale ? 'stale' : job.status;
    });
    return map;
  }, [tabs, jobs, tabJobs]);

  // 结果对应的是上次执行的语句，编辑器内容之后又改过时给出提示
  const sqlOutdated = Boolean(
    activeJob?.result && activeTab && activeJob.sql !== activeTab.sql.trim(),
  );

  useEffect(() => {
    if (
      activeJob?.status === 'succeeded' &&
      activeJob.result?.truncated &&
      truncatedNotifiedRef.current !== activeJob.id
    ) {
      truncatedNotifiedRef.current = activeJob.id;
      void message.warning(`结果超过 LIMIT，已返回前 ${activeJob.result.rowCount} 行`);
    }
  }, [activeJob, message]);

  if (!activeTab) return null;

  const execute = () => {
    submit(activeTab.id, activeTab.sql);
  };

  const cancel = () => {
    if (activeJob && (activeJob.status === 'queued' || activeJob.status === 'running')) {
      cancelJob(activeJob.id);
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

  const handleSimulateDataChange = () => {
    simulateDataChange();
    void message.warning(`数据源已变更（v${dataVersion + 1}），未锁定的结果将标为过期并重算`);
  };

  return (
    <div className="workbench">
      <SchemaTree
        schema={schemaQuery.data}
        loading={schemaQuery.isLoading}
        onUseTable={useTable}
      />
      <main className={`query-main${jobs.length > 0 ? ' query-main--with-queue' : ''}`}>
        <section className="editor-panel">
          <QueryTabs
            tabs={tabs}
            activeTabId={activeTab.id}
            tabStatuses={tabStatuses}
            onActivate={activateTab}
            onAdd={() => addTab()}
            onClose={closeTab}
          />
          <div className="editor-toolbar">
            <Space size={6}>
              <Button
                type="primary"
                icon={<CaretRightOutlined />}
                loading={running || queued}
                onClick={execute}
              >
                执行
              </Button>
              <Tooltip title="只取消当前标签的查询，不影响队列中其他任务">
                <Button
                  danger
                  icon={<StopOutlined />}
                  disabled={!running && !queued}
                  onClick={cancel}
                >
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
                <HistoryOutlined /> {activeTab.sql.split('\n').length} 行 / {activeTab.sql.length}{' '}
                字符
              </span>
              <span className={/\blimit\b/i.test(activeTab.sql) ? 'meta-ok' : 'meta-warn'}>
                {/\blimit\b/i.test(activeTab.sql) ? '已设置 LIMIT' : '建议设置 LIMIT'}
              </span>
              <kbd>⌘ Enter</kbd>
            </Space>
          </div>
          {error && activeJob && errorDismissedFor !== activeJob.id && (
            <Alert
              closable
              showIcon
              type="error"
              message={`${errorTitle} [${error.code}] 第 ${error.line} 行，第 ${error.column} 列`}
              description={`${error.message} ${error.hint}`}
              onClose={() => setErrorDismissedFor(activeJob.id)}
            />
          )}
          <div className="editor-wrap">
            <SqlEditor
              key={activeTab.id}
              value={activeTab.sql}
              schema={schemaQuery.data}
              error={error}
              onChange={(sql) => updateTab(activeTab.id, sql)}
              onExecute={execute}
              onFormat={runFormat}
            />
          </div>
        </section>
        {jobs.length > 0 && (
          <ExecutionQueuePanel
            jobs={jobs}
            tabs={tabs}
            dataVersion={dataVersion}
            onCancel={cancelJob}
            onRetry={retryJob}
            onToggleLock={toggleLock}
            onSimulateDataChange={handleSimulateDataChange}
          />
        )}
        <ResultGrid
          result={result}
          status={activeJob?.status}
          queuePosition={queuePosition}
          error={error?.message ?? null}
          dataVersion={activeJob?.dataVersion ?? null}
          stale={activeJob?.stale ?? false}
          locked={activeJob?.locked ?? false}
          sqlOutdated={sqlOutdated}
          onToggleLock={
            activeJob?.status === 'succeeded' ? () => toggleLock(activeJob.id) : undefined
          }
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
      {activeJob && (
        <div className="execution-footprint" aria-hidden="true">
          {activeJob.sql.slice(0, 80)}
        </div>
      )}
    </div>
  );
}
