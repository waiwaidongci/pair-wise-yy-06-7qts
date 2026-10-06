import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  StopOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { Button, Empty, Tag, Tooltip } from 'antd';
import { useMemo, useState } from 'react';
import type { QueryJob, QueryJobStatus } from '../types/sql';

interface QueryQueueProps {
  jobs: QueryJob[];
  onCancel: (jobId: string) => void;
  onRetry: (jobId: string) => void;
  onDismiss: (jobId: string) => void;
  onClearFinished: () => void;
}

const STATUS_META: Record<
  QueryJobStatus,
  { color: string; text: string; icon: React.ReactNode }
> = {
  queued: { color: 'default', text: '排队中', icon: <ClockCircleOutlined /> },
  running: { color: 'processing', text: '运行中', icon: <LoadingOutlined /> },
  succeeded: { color: 'success', text: '已完成', icon: <CheckCircleOutlined /> },
  failed: { color: 'error', text: '失败', icon: <CloseCircleOutlined /> },
  cancelled: { color: 'warning', text: '已取消', icon: <StopOutlined /> },
};

function formatTime(timestamp?: number): string {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false });
}

export function QueryQueue({ jobs, onCancel, onRetry, onDismiss, onClearFinished }: QueryQueueProps) {
  const [open, setOpen] = useState(false);
  const visibleJobs = useMemo(() => [...jobs].reverse().slice(0, 20), [jobs]);
  const activeCount = jobs.filter((job) => job.status === 'queued' || job.status === 'running').length;
  const finishedCount = jobs.length - activeCount;

  return (
    <div className="query-queue">
      <div className="query-queue__bar" onClick={() => setOpen((value) => !value)}>
        <span className="query-queue__title">
          <ClockCircleOutlined /> 执行队列
        </span>
        <span className="query-queue__counts">
          {activeCount > 0 ? (
            <Tag color="processing">{activeCount} 条进行中</Tag>
          ) : (
            <Tag>空闲</Tag>
          )}
          {finishedCount > 0 && <Tag>{finishedCount} 条已结束</Tag>}
        </span>
        <Button type="text" size="small" className="query-queue__toggle">
          {open ? '收起' : '展开'}
        </Button>
      </div>
      {open && (
        <div className="query-queue__panel">
          {visibleJobs.length === 0 ? (
            <Empty
              className="query-queue__empty"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无执行任务"
            />
          ) : (
            <>
              <ul className="query-queue__list">
                {visibleJobs.map((job) => {
                  const meta = STATUS_META[job.status];
                  const shared = job.tabIds.length > 1;
                  return (
                    <li key={job.id} className={`query-queue__item query-queue__item--${job.status}`}>
                      <span className="query-queue__status">
                        <Tag color={meta.color} icon={meta.icon}>
                          {meta.text}
                        </Tag>
                      </span>
                      <Tooltip title={job.sql} placement="topLeft">
                        <span className="query-queue__sql">{job.sql}</span>
                      </Tooltip>
                      <span className="query-queue__meta">
                        {shared && <Tag color="geekblue">合并 {job.tabIds.length} 个标签</Tag>}
                        {job.attempts > 1 && <Tag>第 {job.attempts} 次</Tag>}
                        {job.error && (
                          <Tooltip title={job.error}>
                            <span className="query-queue__error" title={job.error}>
                              {job.error}
                            </span>
                          </Tooltip>
                        )}
                        <span className="query-queue__time">
                          {formatTime(job.startedAt ?? job.submittedAt)}
                        </span>
                      </span>
                      <span className="query-queue__actions">
                        {(job.status === 'queued' || job.status === 'running') && (
                          <Button size="small" danger onClick={() => onCancel(job.id)}>
                            取消
                          </Button>
                        )}
                        {(job.status === 'failed' || job.status === 'cancelled') && (
                          <Button
                            size="small"
                            type="primary"
                            ghost
                            icon={<UndoOutlined />}
                            onClick={() => onRetry(job.id)}
                          >
                            重试
                          </Button>
                        )}
                        {job.status !== 'queued' && job.status !== 'running' && (
                          <Button size="small" type="text" onClick={() => onDismiss(job.id)}>
                            移除
                          </Button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {finishedCount > 0 && (
                <div className="query-queue__footer">
                  <Button size="small" type="text" onClick={onClearFinished}>
                    清除已结束
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
