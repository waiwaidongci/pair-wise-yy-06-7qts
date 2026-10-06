# Nebula SQL 查询工作台

基于 React、TypeScript、Vite、Ant Design、Monaco Editor、Zustand、TanStack Query
和 React Router 构建的浏览器 SQL 工作台。执行引擎完全运行在前端内存中，不依赖后端。

## 功能

- 数据库 / 表 / 字段结构树与模糊检索
- 多标签 SQL 编辑器、语法高亮、自动补全、格式化与错误行标记
- `Ctrl/Cmd + Enter` 执行，长查询可取消
- 自研简单 `SELECT / WHERE / ORDER BY / LIMIT` 解析与过滤
- 虚拟滚动结果表、列宽调整、双击复制、CSV 导出和分页
- 查询历史、收藏语句、错误信息中文映射
- 使用 localStorage 持久化标签页、历史和收藏

## 运行

```bash
export PATH="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin:$PATH"
corepack pnpm install
corepack pnpm dev
corepack pnpm build
```

支持示例：

```sql
SELECT order_no, customer_name, amount, status
FROM orders
WHERE amount > 5000 AND status = '已完成'
ORDER BY amount DESC
LIMIT 200;
```
