# dsh-session-tools — DSH 独立插件：会话批量管理 + 删除

从 `dsh-ziyong` 集合拆出的独立插件（原 youjian 的「侧栏批量面板」与「删除会话 + 删除⏎」两部分；归档列表/设置页那套留在集合版，未随之迁移）。

## 功能

| 功能 | 说明 |
|---|---|
| 侧栏「批量」按钮 | DOM 注入到官方侧栏顶部按钮行，**排在「添加工作区」后面**（幂等）；点开/收起批量面板 |
| 会话右键菜单（跟随鼠标） | 在会话行上拦截 `contextmenu`，用官方 `Menu` 的 `getAnchorRect` 把菜单放到鼠标坐标（官方只支持从行尾「操作」按钮弹）。条目与官方菜单对齐：**置顶会话·取消置顶 / 重命名 / 分叉会话 / 归档会话·取消归档 / 删除会话**（空白草稿只给 删除会话）。滚动/改窗口尺寸自动关 |
| 重命名弹窗 | 右键「重命名」→ 输入框（预填当前标题，Enter 保存）→ 官方 RPC `remote.session.rename` + `sessions.refreshProjections` 刷新标题 |
| 批量面板（`shell.overlay`） | 按工作区分组列出**未归档、非空白**的会话，**顺序与官方会话列表一致**（置顶在前、按 `pinnedSessionIds` 顺序；其余按 `updatedAt` 倒序、同值按 id 升序），行样式也照官方：标题 + 相对时间（刚刚/N分钟/N小时/N天/N个月/N年 + 前）+ 置顶图标（`IconPinFillRegular`）。勾选、全选/全不选（**全选默认跳过置顶会话**）、已选计数；**归档所选**（走官方 `workspaces.archiveSession`）、**删除所选**（走本插件 host RPC，删除前弹确认框） |
| 会话右键菜单「删除会话」 | 注册 `sidebar.workspaces.session.menu.item`（id `delete`，order 500；官方菜单只有 置顶/重命名/分叉/归档） |
| 删除确认弹窗 | 确认按钮文案 **「删除⏎」**，弹窗打开期间 **Enter 直接确认**；批量删除复用同一个弹窗（按会话数换文案） |
| 设置区「已归档」 | 注册 `settings.section`（`id: archived-sessions`，`order: 105` → 排在「视觉桥」之上；这个 id 官方导航图标映射里自带归档图标）：按工作区分组列出已归档会话、标题筛选、单条/批量**取消归档**（官方 API）、单条/批量**删除**（本插件 RPC，走同一个确认弹窗）。官方只有侧栏「视图选项 → 显示已归档 / 仅显示已归档」这个筛选，没有管理页 |
| 删除语义 | **先归档再删除**（host 侧串起来）：会话先离开可见树并入归档集，再清投影缓存、级联删子代理会话、清 spill、删转录目录，最后把 id 从工作区记账与归档集收尾 |
| 会话列表默认展开 | 官方每个工作区默认只显示 5 条空闲会话（「展开其余 N 个会话」按钮）。插件自动点开它直到全部显示；用户手动「收起」的组在本次运行内不再自动展开 |
| 置顶钉子改红 | 侧栏置顶标记（`_pinIndicator`）与批量面板内的钉图标改为红色 `#f25a5a` |

host RPC 命名空间 `sessionTools`：`deleteSession`。

## 边界行为（实测）

- **空白草稿（新建但没发过消息的「新会话」）**：官方侧栏不给它渲染任何操作按钮，本插件同样不会删它（批量面板按 `blank` 过滤）。这类草稿没有磁盘数据，会被官方「新建会话」复用，不用管。
- **幽灵会话**（转录目录已消失但记账残留）：不报错，尽力清理记账并广播移除。
- **子代理会话**：只级联删 `origin=subagent` 的子会话；fork 分支是独立会话，不删。

## 安装（profile 方式）

1. profile `package.json` 的 `dependencies` 加 `"dsh-session-tools": "link:E:/AI编程技能/DSH自用插件/dsh-session-tools"`
2. 同文件 `dsh.profile.bundles` 加 `"dsh-session-tools"`
3. profile 的 `node_modules` 下建联接：`mklink /J node_modules\dsh-session-tools E:\AI编程技能\DSH自用插件\dsh-session-tools`
4. 重启 DSH

## 维护

- host：改 `index.js`，重启生效。删除序列依赖官方服务：`workspaceRegistry`（sessionKnown/archiveSession/unarchiveSession/list/readSessionHeader）、`sessions`（flush/detachEntered/enter/announce）、`sessionPersistence`（prepare/locate/list）、`sessionProjectionCache`（whenIdle/delete）、`spillStore`；官方若改名/改签名，表现为删除报错或残留，回来看 `deleteSession` 各步的 warning 日志
- client：改 `client.js` 后 `node --check client.js`（单文件 bundle，无合并步骤）
- 新增 host RPC：描述符数组要过 `addStrictCodecFactories()`（内核 2.0.14 起 strict codec 必须带 `create()`）
- **客户端本地收尾**：删除后除等 host 的移除帧，还会主动调 `ctx.sessions.handleSessionRemoved(id)`（官方 remove 路径，对已删会话幂等）——空白草稿/幽灵行只存在于客户端列表，靠这一步立刻消失
- **侧栏头部按钮行的坑**：官方 `.headerActions` 是 `max-width:60px + overflow:hidden`（刚好两个按钮，搜索展开时用 max-width 动画收起到 0）。加第三个按钮必须放开可见态的 max-width，否则最后一个按钮（原「添加工作区」）被裁掉。插件用标记类 + `:not([class*="headerActionsHidden"])` 只在可见态放开，隐藏态保持官方行为
