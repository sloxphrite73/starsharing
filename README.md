# StarSharing · 收藏分享网站

一个基于 **Supabase** + **GitHub Pages** 的多用户收藏（书签）分享平台。单页应用，无前端框架，全量逻辑写在 `script.js`（约 1290 行），样式写在 `style.css`。

---

## 文件结构

```
starsharing/
├── index.html          # 所有 HTML 结构（单页面，多视图切换）
├── script.js           # 全部 JavaScript 逻辑（含 Supabase 初始化）
├── style.css           # 全部样式
├── favicone_README.md  # Favicone API 文档（供参考，实际已多源回退）
└── README.md           # 本文档
```

**只有这三个文件。** 无需构建工具，浏览器直接打开或被 GitHub Pages 托管即可运行。

---

## Supabase 配置

### 初始化（`script.js` L1-16）

```js
const SUPABASE_CONFIG = {
    url: 'https://mqqkvolvljixdztvrrfw.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1Ni...',
};
const supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
```

### 数据库表

#### `websites`

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | uuid | PK, gen_random_uuid() | |
| `title` | text | NOT NULL | 网站标题 |
| `url` | text | NOT NULL | 完整 URL |
| `description` | text | NULLABLE | 描述 |
| `category` | text | NULLABLE | 标签，**逗号或中文逗号**分隔 |
| `user_id` | uuid | NOT NULL | 发布者 Supabase Auth UID |
| `user_email` | text | | 发布者邮箱（冗余字段，用于前端直接展示） |
| `user_username` | text | | 发布者用户名（冗余字段，卡片展示优先用此项） |
| `created_at` | timestamptz | DEFAULT now() | |

#### `profiles`

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | uuid PK | 关联 `auth.users` |
| `username` | text | |
| `avatar_url` | text NULLABLE | |
| `username_updated_at` | timestamptz NULLABLE | |
| `username_update_count` | int DEFAULT 0 | 当日修改次数 |
| `avatar_updated_at` | timestamptz NULLABLE | |
| `avatar_update_count` | int DEFAULT 0 | 当日修改次数 |
| `updated_at` | timestamptz DEFAULT now() | |

### Storage Bucket

- **`avatars`** — Public bucket，路径 `<user_id>/<timestamp>.<ext>`

---

## 视图架构

```
navbar (sticky, backdrop-filter 模糊)
├── brand (⭐ StarSharing, 点击 → bookmarkSquare)
├── navbar-tabs (绝对居中, 底部下划线动画)
│   ├── 书签广场 (bookmarkSquare) ← 默认激活
│   ├── 导入 (importView)
│   └── 我的网站 (myWebsites)
└── navActions (JS 动态渲染: 登录/注册 or 头像+退出)
```

视图切换函数：`switchMainView(viewName)` — 操作 4 个视图容器的 `display` 属性，同时更新导航标签的 `.active` 类。参数值：`'bookmarkSquare'` | `'importView'` | `'myWebsites'` | `'profileView'`。

---

## 全局变量概览（`script.js` L20-34）

| 变量 | 类型 | 说明 |
|---|---|---|
| `navActions` | DOM | `#navActions` — 导航栏右侧登录/退出区域 |
| `grid` | DOM | `#websiteGrid` — 书签广场的卡片容器 |
| `statsCount` | DOM | `#statsCount` — "共 X 个网站" |
| `navbarTabs` | DOM | `#navbarTabs` — 三个导航标签的父容器 |
| `searchInput` | DOM | `#searchInput` — 书签广场搜索框 |
| `bookmarkSquareView` / `importView` / `myWebsitesView` / `profileView` | DOM | 四个主视图容器 |
| `allWebsitesData` | Array | 书签广场全部数据缓存（用于前端搜索） |
| `currentUser` | Object|null | Supabase Auth 当前用户对象 |
| `profileData` | Object|null | 当前用户 `profiles` 表记录 |

所有 DOM 引用在 `initApp()` 中赋值（L625-660）。

---

## 核心功能模块

### 1. 用户认证

| 函数 | 作用 |
|---|---|
| `loadSession()` | 读取 `supabaseClient.auth.getSession()`，更新 `currentUser` |
| `updateUI()` | 根据登录态渲染导航栏右侧（头像+用户名+退出 / 登录+注册按钮） |
| `handleLogin(e)` | `signInWithPassword`，成功后重置表单 |
| `handleRegister(e)` | `signUp` + `options.data.username` → 成功后自动触发 `profiles` 表初始化 |
| `handleLogout()` | `signOut` |
| `onAuthStateChange` | 监听登录态变化，自动重新加载数据 |

注册时自动插入 `profiles` 记录：`loadProfileData()` 内部 `single()` 返回空时自动 `insert`。

### 2. 书签广场 (`bookmarkSquareView`)

- 顶部嵌入式搜索框，输入即搜，前端过滤 (`filterAndRenderCards`)
- 右下角无 FAB 按钮（已删除，导入功能迁移到独立视图）
- 卡片网格，每张卡片含：
  - favicon（`favicone.com/{domain}?s=32`，onerror 回退域名首字母）
  - 标题（青色链接）
  - 域名
  - 描述
  - 标签分类 + 提交者用户名 + 日期
- **仅所有者可见删除按钮**（`user_id === currentUser.id`）
- 数据来源：`allWebsitesData` — `loadWebsites()` 从 Supabase 全量拉取并缓存
- **实时订阅**：`subscribeWebsites()` 监听 `postgres_changes` → 自动刷新

### 3. 导入视图 (`importView`)

#### 左栏：单个导入
- 表单 `#addFormInline`，字段完全独立（`addTitleInline` / `addUrlInline` / `addDescInline` / `addCategoryInline`）
- `addUrlInline` 失焦时调用 `fetchWebsiteInfoInline()` 自动填充 favicon 和 title
- 标题获取：allorigins → corsproxy → 降级为域名
- 提交走 `addWebsite()` → Supabase insert

#### 右栏：从收藏夹 HTML 导入
- 流程：选择文件 → `parseBookmarkHTML()`（DOMParser 解析 `<a href>`，过滤非 HTTP，去重）→ `renderBookmarkList()`
- 列表：checkbox + favicon（带加载 spinner）+ 标题 + 域名，**默认全选**
- **异步 favicon 加载**：`tryLoadFaviconForIcon()` 按 `favicone.com → icons.duckduckgo.com → vemetric.com` 顺序尝试，每个 URL 超时 3s，成功则替换 spinner 为 img，全部失败则显示首字母
- **批量导入（核心优化）**：`importSelectedBookmarks()` 使用 `200条/批 × 3并发` 策略，将 `Promise.all(chunk.map(...))` 调用 `supabaseClient.from('websites').insert(rows)` 批量写入，按钮实时显示 `导入中 XX%...`
- **性能**：10000条 ≈ 17批次网络往返 < 10s

### 4. 我的网站 (`myWebsitesView`)

列出当前用户所有网站（`WHERE user_id = currentUser.id`）。

#### 工具栏（始终可见）
```
[☑ 全选]  [删除(红)] [添加标签]
```
- **「删除」和「添加标签」按钮仅在选中数量 > 0 时显示**（通过 `updateMyWebsitesToolbar()` 动态切换 `display`）
- 没有独立的"多选模式"按钮，所有功能常驻

#### 列表条目
- 每个 `.mywebsite-item` 含：
  - **checkbox**：自定义样式（`appearance: none`，checked 时紫色实心填充，无白色勾号）
  - favicon：复用 `bookmark-icon` + `bookmark-icon-loader` 加载动画
  - 标题 + 域名（紫色链接，可点击跳转）
  - 标签集合（`.mywebsite-tag`，紫色圆角 pill）

#### 拖拽选择（始终开启）
- `mousedown` / `touchstart` 在任意条目上（非 checkbox 区域）开始拖拽
- 根据**起始条目的当前状态取反**作为目标值，扫过的所有条目统一设为目标值
  - 第一项未选中 → 拖拽全选
  - 第一项已选中 → 拖拽全取消
- `mousemove` / `touchmove` 持续设置扫过项的 checkbox
- `mouseup` / `touchend` 停止拖拽并调用 `updateMyWebsitesToolbar()`

#### 批量删除
- 确认对话框后分批：**200条/批 × 3并发**，使用 `delete().in('id', batch)` 批量删除

#### 添加标签
- 弹出模态框 `#tagModal`，输入标签（逗号/中文逗号分隔）
- 确认后逐条 `update({ category: tagText })` 更新选中的网站

### 5. 个人资料 (`profileView`)

- 头像：点击遮罩覆盖层 → 文件选择 → 裁剪模态框 → canvas 圆形裁剪 → `updateAvatar()`
- 用户名：显示 + 编辑按钮 → 输入框 + 保存/取消，调用 `updateUsername()`
- 每日限制：用户名和头像各 2 次/天，由 `profiles` 表的 `_count` 和 `_updated_at` 字段控制

### 6. 裁剪模态框 (`#cropModal`)

- `openCropModal(file)` — FileReader → Image → canvas 渲染
- 缩放按钮、重置按钮
- 鼠标拖拽和触摸拖拽
- `confirmCrop()` — 取 canvas 中心圆形区域 → `toBlob` → `updateAvatar(file)`

---

## CSS 关键约定

- **CSS 变量**统一定义在 `:root`（`style.css` L10-30），颜色、圆角、阴影、过渡时间全部用变量
- **导航标签**：`.navbar-tab` 用 `::after` 伪元素实现底部下划线动画（`scaleX` transition）
- **卡片**：`.card` 统一卡片样式，网格布局 `auto-fill, minmax(280px, 1fr)`
- **Toast**：`#toastContainer` 固定底部居中，3s 自动消失
- **自定义 checkbox**：`.mywebsite-item-checkbox` 和 `.check-all-label input` 用 `appearance: none` + 自定义 border + `:checked` 紫色实心背景，全选的 checkbox 额外有 `::after` 白色勾号
- **响应式**：`@media (max-width: 640px)` 和 `768px` 两档断点

---

## 重要实现细节

1. **缓存版本控制**：`script.js?v=4` 防止浏览器缓存旧版 JS
2. **URL 规范化**：`fetchWebsiteInfoInline()` 自动补 `https://` 前缀
3. **批量操作隔离**：select/deselect 操作触发 `updateMyWebsitesToolbar()` 更新按钮可见性
4. **Realtime 订阅**：`subscribeWebsites()` 监听全部 `postgres_changes` (INSERT/UPDATE/DELETE)
5. **数据库查询**：`loadWebsites()` 和 `loadMyWebsites()` 各自独立调用 Supabase，`allWebsitesData` 仅被前者更新

---

## 依赖的外部服务

| 服务 | 用途 |
|---|---|
| **Supabase** | Auth + Database + Storage + Realtime |
| **favicone.com** | 网页 favicon（主要） |
| **icons.duckduckgo.com** | 网页 favicon（回退 1） |
| **vemetric.com** | 网页 favicon（回退 2） |
| **api.allorigins.win** | CORS 代理获取网页 title（回退 1） |
| **corsproxy.io** | CORS 代理获取网页 title（回退 2） |

## 如何继续开发

1. 克隆仓库，确认 `script.js` 顶部的 `SUPABASE_CONFIG` 指向正确的 Supabase 项目
2. 确保 Supabase 已有 `websites` 和 `profiles` 表、`avatars` bucket
3. 浏览器直接打开 `index.html` 或部署到 GitHub Pages
4. 所有前端逻辑在 `script.js` 中，样式在 `style.css` 中，无需任何构建工具