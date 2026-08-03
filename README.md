# StarSharing · 收藏分享网站

一个基于 Supabase + GitHub Pages 的多用户收藏（书签）分享平台。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | HTML5 + CSS3 + Vanilla JS (无框架) |
| 后端 BaaS | Supabase (Auth + Database + Storage) |
| 部署 | GitHub Pages |

## 文件结构

```
starsharing/
├── index.html      # 所有 HTML 结构（单页面，多视图切换）
├── script.js       # 全部 JavaScript 逻辑
├── style.css       # 全部样式
└── favicone_README.md  # Favicone API 文档（供参考）
```

## Supabase 配置

在 `script.js` 顶部：

```js
const SUPABASE_CONFIG = {
    url: 'https://mqqkvolvljixdztvrrfw.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1Ni...',
};
```

### 数据库表

#### `websites`（网站/书签）

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | uuid (主键) | 自动生成 |
| `title` | text | 网站标题 |
| `url` | text | 网站 URL |
| `description` | text (可空) | 描述 |
| `category` | text (可空) | 标签，逗号/中文逗号分隔 |
| `user_id` | uuid | 发布者 Supabase Auth UID |
| `user_email` | text | 发布者邮箱（冗余字段） |
| `user_username` | text | 发布者用户名（冗余字段，用于卡片展示） |
| `created_at` | timestamptz | 自动生成 |

#### `profiles`（用户资料）

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | uuid (主键) | 关联 auth.users |
| `username` | text | 用户名 |
| `avatar_url` | text (可空) | 头像 URL |
| `username_updated_at` | timestamptz (可空) | 上次修改用户名时间 |
| `username_update_count` | int | 当日修改次数 |
| `avatar_updated_at` | timestamptz (可空) | 上次修改头像时间 |
| `avatar_update_count` | int | 当日修改次数 |
| `updated_at` | timestamptz | 最后更新时间 |

### Storage Bucket

- `avatars` — 用户头像存储，路径格式 `{user_id}/{timestamp}.{ext}`，Public

## 导航与视图结构

```
navbar
├── logo (点击 → bookmarkSquare)
├── navbar-tabs
│   ├── 书签广场 (bookmarkSquare) ← 默认激活
│   ├── 导入 (importView)
│   └── 我的网站 (myWebsites)
└── navActions (用户头像+退出 / 登录+注册按钮)
```

三个视图通过 `switchMainView(viewName)` 切换，对应 `display: block/none`。

## 核心功能模块

### 1. 用户认证 (`script.js` ~L159-272)

- 使用 Supabase Auth
- 注册：`signUp` + `options.data.username`，同时插入 `profiles` 表
- 登录：`signInWithPassword`
- 会话监听：`onAuthStateChange`
- UI 渲染：`updateUI()` — 登录态显示头像/用户名/退出按钮，未登录显示登录/注册按钮

### 2. 书签广场 (`bookmarkSquareView`)

- 搜索框 + 卡片网格 (`#websiteGrid`)
- 数据从 `allWebsitesData` 全局数组读取
- 搜索：`filterAndRenderCards()` — 前端按标题过滤
- 卡片渲染：`renderCards(websites)` — 每张卡片含 favicon 图标（Favicone API）、标题（链接）、域名、描述、标签、提交者、删除按钮（仅本人）
- 实时订阅：`subscribeWebsites()` — Supabase Realtime 监听 `websites` 表变更

### 3. 导入视图 (`importView`)

两栏布局：

**左栏 — 单个导入**
- 表单 `#addFormInline`，提交调用 `addWebsite()`
- 自动获取 URL 的 favicon 和标题：`fetchWebsiteInfoInline()`
  - favicon: `favicone.com/{domain}?s=64`
  - 标题: 多代理尝试（allorigins → corsproxy）→ 降级为域名

**右栏 — 从收藏夹导入**
- 选择浏览器导出的 `.html` 文件
- `parseBookmarkHTML()` — DOMParser 解析所有 `<a href>`，过滤非 HTTP，去重
- `renderBookmarkList()` — 渲染列表（含 favicon + 勾选框 + 标题/域名），默认全选
- `importSelectedBookmarks()` — 逐条插入 `websites` 表
- Favicon 懒加载：`tryLoadFaviconForIcon()` — 多 API 尝试（favicone → duckduckgo → vemetric），超时3s回退首字母；显示加载动画 `.bookmark-icon-loader`

### 4. 我的网站 (`myWebsitesView`)

- 列出当前用户所有网站：`loadMyWebsites()` — `SELECT * WHERE user_id = currentUser.id`
- 每个条目含 checkbox + favicon（带加载动画）+ 标题/域名 + 标签列表
- 全选：`#myWebsitesCheckAll` — toggle 所有 checkbox
- 拖拽选择：`mousedown`/`touchstart` 开始拖拽，`mousemove`/`touchmove` 扫过项切换（根据起始项状态决定全选/全取消），`mouseup`/`touchend` 停止
- 删除：`#myWebsitesDeleteBtn` — 仅在选中项 > 0 时显示，批量删除
- 添加标签：`#myWebsitesAddTagBtn` — 仅在选中项 > 0 时显示，弹出模态框 `#tagModal`，输入标签后批量更新 `category` 字段

### 5. 个人资料 (`profileView`)

- 头像：点击遮罩 → 文件选择 → 裁剪模态框 → canvas 裁剪 → 上传 Storage
- 用户名：可编辑，每日限2次修改
- 数据表：`profiles`，调用 `loadProfileData()` / `updateUsername()` / `updateAvatar()`

### 6. 裁剪模态框 (`#cropModal`)

- `openCropModal(file)` — FileReader 读取 → canvas 渲染
- 缩放按钮 + 重置、支持鼠标和触摸拖拽
- `confirmCrop()` — canvas 圆形裁剪 → toBlob → `updateAvatar()`

## 关键全局变量

| 变量 | 说明 |
|---|---|
| `currentUser` | Supabase Auth 当前用户对象 |
| `profileData` | 当前用户 profile 记录 |
| `allWebsitesData` | 书签广场的完整网站数据 |
| `grid` | `#websiteGrid` DOM 引用 |

## Toast 通知

`showToast(message, type)` — type: `'info'` | `'success'` | `'error'`，追加到 `#toastContainer`，3秒后自动消失。

## Favicon 获取方式

| 场景 | 方法 |
|---|---|
| 书签广场卡片 | `<img src="https://favicone.com/{domain}?s=32" onerror="回退首字母">` |
| 导入预览 favicon | `fetchWebsiteInfoInline()` 使用 `favicone.com` |
| 书签导入列表 | 先渲染 spinner，异步尝试 favicone → duckduckgo → vemetric，超时回退首字母 |

## 依赖的外部服务

- **Supabase** — 认证、数据库、Storage、Realtime
- **Favicone** (`favicone.com`) — favicon 获取（主要）
- **DuckDuckGo Favicons** (`icons.duckduckgo.com`) — favicon 获取（书签导入备用1）
- **Vemetric** (`vemetric.com`) — favicon 获取（书签导入备用2）
- **AllOrigins** (`api.allorigins.win`) — CORS 代理获取网页标题（备用1）
- **CORSProxy** (`corsproxy.io`) — CORS 代理获取网页标题（备用2）