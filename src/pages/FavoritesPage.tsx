import { DeleteOutlined, PlayCircleOutlined, StarFilled } from '@ant-design/icons';
import { App as AntdApp, Button, Card, Empty, Popconfirm, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useWorkbenchStore } from '../stores/workbenchStore';

export function FavoritesPage() {
  const { message } = AntdApp.useApp();
  const favorites = useWorkbenchStore((state) => state.favorites);
  const removeFavorite = useWorkbenchStore((state) => state.removeFavorite);
  const addTab = useWorkbenchStore((state) => state.addTab);
  const navigate = useNavigate();

  return (
    <div className="content-page">
      <div className="content-page__heading">
        <div>
          <Typography.Title level={2}>收藏查询</Typography.Title>
          <Typography.Text type="secondary">
            常用的分析语句可以一键恢复，编辑后不会影响原始收藏。
          </Typography.Text>
        </div>
      </div>
      {favorites.length ? (
        <div className="favorite-grid">
          {favorites.map((favorite) => (
            <Card
              key={favorite.id}
              className="favorite-card"
              title={
                <span>
                  <StarFilled className="favorite-star" /> {favorite.name}
                </span>
              }
              extra={
                <Popconfirm
                  title="删除这条收藏？"
                  onConfirm={() => {
                    removeFavorite(favorite.id);
                    void message.success('收藏已删除');
                  }}
                >
                  <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                </Popconfirm>
              }
            >
              <pre className="sql-preview">{favorite.sql}</pre>
              <Button
                type="primary"
                ghost
                block
                icon={<PlayCircleOutlined />}
                onClick={() => {
                  addTab(favorite.sql);
                  navigate('/workbench');
                }}
              >
                在新标签中打开
              </Button>
            </Card>
          ))}
        </div>
      ) : (
        <div className="content-card">
          <Empty description="还没有收藏查询，可在编辑器中点击收藏按钮添加" />
        </div>
      )}
    </div>
  );
}
