import {
  LockOutlined,
  RedoOutlined,
  StopOutlined,
  ThunderboltOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import { Button, Tag, Tooltip } from 'antd';
import { MAX_CONCURRENT_QUERIES } from '../stores/executionStore';
import type { QueryJob, QueryJobStatus, QuerySession } from '../types/sql';

interface ExecutionQueuePanelProps {
  jobs: QueryJob[];
  tabs: QuerySession[];
  dataVersion: number;
  onCancel: (jobId: string) => void;
  onRetry: (jobId: string) => void;
  onToggleLock: (jobId: string) => void;
  onSimulateDataChange: () => void;
}

const STATUS_META: Record<QueryJobStatus, { color: string; label: string }> = {
  queued: { color: 'gold', label: '排队中' },
  running: { color: 'processing', label: '执行中' },
  succeeded: { color: 'success', label: '成功' },
  failed: { color: 'error', label: '失败' },
  cancelled: { color: 'default', label: '已取消' },
};

function firstLine(sql: string): string {
  const line = sql.split('\n').find((item) => item.trim().length > 0) ?? '';
  return line.trim().slice(0, 80);
}

export function ExecutionQueuePanel({
  jobs,
  tabs,
  dataVersion,
  onCancel,
  onRetry,
  onToggleLock,
  onSimulateDataChange,
}: ExecutionQueuePanelProps) {
  const runningCount = jobs.filter((job) => job.status === 'running').length;
  const queuedCount = jobs.filter((job) => job.status === 'queued').length;
  const ordered = [...jobs].sort((a, b) => {
    const aActive = a.status === 'queued' || a.status === 'running';
    const bActive = b.status === 'queued' || b.status === 'running';
    if (aActive !== bActive) return aActive ? -1 : 1;
    return aActive ? a.submittedAt - b.submittedAt : b.submittedAt - a.submittedAt;
  });

  const tabTitle = (tabId: string) => tabs.find((tab) => tab.id === tabId)?.title ?? '已关闭标签';

  return (
    <section className="queue-panel">
      <div className="queue-panel__header">
        <strong>执行队列</strong>
        <span className="queue-panel__summary">
          并发 {MAX_CONCURRENT_QUERIES} · 运行中 {runningCount} · 排队 {queuedCount}
        </span>
        <Tag color="geekblue">数据 v{dataVersion}</Tag>
        <Tooltip title="数据源版本 +1，未锁定的结果将标为过期并自动重算">
          <Button size="small" icon={<ThunderboltOutlined />} onClick={onSimulateDataChange}>
            模拟数据变更
          </Button>
        </Tooltip>
      </div>
      <div className="queue-panel__list">
        {ordered.map((job) => {
          const meta = STATUS_META[job.status];
          return (
            <div className="queue-item" key={job.id}>
              <Tag color={meta.color} className="queue-item__status">
                {meta.label}
              </Tag>
              <span className="queue-item__sql" title={job.sql}>
                {firstLine(job.sql)}
              </span>
              <span className="queue-item__meta">
                {job.tabIds.map(tabTitle).join('、')}
                {job.dataVersion !== null && ` · v${job.dataVersion}`}
                {job.result && ` · ${job.result.rowCount} 行 · ${job.result.elapsedMs} ms`}
                {job.attempts > 1 && ` · 第 ${job.attempts} 次尝试`}
                {job.recomputesJobId && ' · 自动重算'}
                {job.error && ` · ${job.error.message}`}
              </span>
              {job.stale && <Tag color="warning">已过期</Tag>}
              {job.locked && (
                <Tag icon={<LockOutlined />} color="blue">
                  已锁定
                </Tag>
              )}
              {(job.status === 'queued' || job.status === 'running') && (
                <Tooltip title="只取消这一条，不影响其他任务">
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<StopOutlined />}
                    onClick={() => onCancel(job.id)}
                  />
                </Tooltip>
              )}
              {(job.status === 'failed' || job.status === 'cancelled') && (
                <Tooltip title="重新排队执行">
                  <Button
                    type="text"
                    size="small"
                    icon={<RedoOutlined />}
                    onClick={() => onRetry(job.id)}
                  />
                </Tooltip>
              )}
              {job.status === 'succeeded' && (
                <Tooltip title={job.locked ? '解除锁定，数据变更后参与重算' : '锁定结果，数据变更后保留此版本'}>
                  <Button
                    type="text"
                    size="small"
                    icon={job.locked ? <LockOutlined /> : <UnlockOutlined />}
                    onClick={() => onToggleLock(job.id)}
                  />
                </Tooltip>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
