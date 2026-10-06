import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntdApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom';
import { App } from './App';
import { FavoritesPage } from './pages/FavoritesPage';
import { HistoryPage } from './pages/HistoryPage';
import { WorkbenchPage } from './pages/WorkbenchPage';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/workbench" replace /> },
      { path: 'workbench', element: <WorkbenchPage /> },
      { path: 'history', element: <HistoryPage /> },
      { path: 'favorites', element: <FavoritesPage /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1769ff',
          borderRadius: 7,
          fontFamily:
            '"PingFang SC", "Microsoft YaHei", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <AntdApp>
          <RouterProvider router={router} />
        </AntdApp>
      </QueryClientProvider>
    </ConfigProvider>
  </React.StrictMode>,
);
