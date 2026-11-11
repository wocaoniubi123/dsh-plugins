# dsh-avatar — DSH 独立插件：对话头像 / 昵称

从 `dsh-ziyong` 集合里拆出来的独立插件（集合版不再包含 avatar 子模块）。

## 功能

- **消息流头像行**：给你和 AI 的每条消息注入头像 + 昵称（缺图时用首字圆形占位），DOM 旁路注入（MutationObserver 幂等重挂）
- **设置页「对话头像」区**：注册官方 `settings.section` 槽位（`id: avatar`，`order: 120` → 排在「桌面设置」之后、导航最后一项），与「通用设置/模型」同级——导航高亮、内容切换、滚动都由官方设置壳管理；可改昵称、头像尺寸（24–96）、圆角（0–100）、上传头像
  - 早先的「显示系统提示词 / 显示上下文注入」两个开关已撤掉：2.0.14 起官方把这两行移到了「轨迹」页，对话流里不再渲染，开关没有作用对象（`config.json` 里残留的同名字段不再被读取，留着无害）
  - 导航图标：官方设置壳的图标按 section id 硬编码（`navIcon(id)`，未知 id 给齿轮）且无开放接口，所以这里用一段**只针对自己那行**的 DOM 补丁把 svg 换成官方人像图标（原位改、带 `data-dsh-avatar-nav-icon` 标记、幂等；官方换图标或结构时最多退回齿轮，不影响功能）
- **两个显示开关**：系统提示（`showSystemPrompt`）、上下文注入（`showContextInjection`）
- **全局指令注入系统提示词**：把 `~/.dsh/AGENTS.md` 挂进系统提示词，每轮都带、压缩吃不掉（见下节）

host 侧提供配置与头像文件读写，RPC 命名空间 `avatar`：`getAvatarConfig` / `setAvatarConfig` / `uploadAvatar`（data URL → 落盘，≤5MB，支持 png/jpg/jpeg/gif/webp/svg），外加 `getPersonaInject` / `setPersonaInject`。

## 全局指令注入系统提示词

设置页「对话头像」最后一个开关（在「对话宽度跟随窗口」下面），文案 `全局指令注入系统提示词`。

**解决什么问题**：官方 `agent-instructions` 把 AGENTS.md 当**首轮的一条 user 消息**塞进历史，压缩（compaction）一旦把它摘要掉，模型就开始忘全局指令。系统提示词不参与压缩，所以把同一份文件挂到系统提示词里就永不丢失。

**实现**（`index.js`）：监听 `agent/created`，给每个 agent（含子代理）注册一段自己的 section：

```js
agent.ctx.effect(() => prompt.section({
  name: "dsh-avatar:global-directives",
  order: -500,            // 紧跟开场白，在各类策略之前
  interpolate: false,     // 文件里的 {{...}} 按字面保留，不会因未知变量抛错
  text: () => readDirectives()   // 每次组装重新读文件
}))
```

**不要用 profile patch 改 `system-prompt.personaPrefix`**（试过，无效）：loader 里配置确实写进去了（`personaPrefix: "PLAINTEXT_MARKER_99"`、`state: 2`），但 `deployment:persona-prefix` 这段在 agent 作用域被遮蔽，标记一次都没进过 prompt（system prompt 长度恒定 7711）。agent 自己注册的 section 才会被 `renderPrompt` 收进去。

**实测**（新建会话 `session-59bf6853`，不碰任何既有对话）：

| 项 | 结果 |
|---|---|
| 系统提示词含全局指令 | ✅ 1 次，位于最前（本 profile 关了 `includeHarnessIdentity`） |
| 系统提示词长度 | ✅ 7711 → 12943 |
| 第二回合是否重新生成 | ☑️ 不重新生成：`system/message` 每会话只写一条，之后每轮重放 |
| 首轮与官方基线重复 | ❌ 重复：`agent-instructions` 的首轮 user 消息里还有一份（≈5500 字符） |

**生效边界**：
- 改 `AGENTS.md` 后**新建会话**才带上；同一会话内不会重读（系统消息已落库）
- 开关关闭只影响**之后创建**的 agent；已存在的 agent 上挂着的 section 不会摘掉
- 老会话（开关打开前建的）没有这段，除非重新开始
- 首轮重复那一份属于官方插件行为，本插件不去动它

## 数据文件

| 文件 | 内容 |
|---|---|
| `config.json` | `userName` / `assistantName` / `avatarSize` / `avatarRadius` / 两个显示开关 / `personaInject`（`showHeaderOpenWorkspace` 为历史字段，已无消费者） |
| `assets/{user,assistant}.*` | 头像图片（用户自定义，缺省用首字占位） |

## 安装（profile 方式）

1. profile 的 `package.json`（`~/.dsh/profiles/desktop/package.json`）加依赖：

   ```json
   "dependencies": { "dsh-avatar": "link:E:/AI编程技能/DSH自用插件/dsh-avatar" }
   ```

2. 同文件 `dsh.profile.bundles` 数组里加 `"dsh-avatar"`
3. 在 profile 的 `node_modules` 下建目录联接（无 pnpm CLI 时用 junction）：

   ```
   mklink /J node_modules\dsh-avatar E:\AI编程技能\DSH自用插件\dsh-avatar
   ```

4. 重启 DSH

卸载：从 `dependencies` 与 `bundles` 移除，删掉联接，重启（`config.json` 与 `assets/` 留在插件目录里，重装即恢复）。

## 结构

```
dsh-avatar/
├── package.json        # dsh.bundle.patch + dsh.client（platform: web）
├── cordis.patch.yml    # 插入服务行 id dsh-avatar
├── index.js            # host：配置/头像文件服务 + typert RPC（命名空间 avatar）
├── client.js           # client：头像行注入 + 设置页「对话头像」面板
├── typert-compat.js    # strict codec 兼容层（内核 2.0.14 起要求 codec 带 create()）
├── config.json         # 用户配置（昵称/尺寸/开关）
└── assets/             # 头像图片
```

## 维护

- host 改动：改 `index.js`，重启 DSH 生效（`link:` 实时读取）
- client 改动：改 `client.js` 后跑 `node --check client.js`（本插件是单文件 bundle，无合并步骤）
- 新增 host RPC：描述符数组要过一层 `addStrictCodecFactories()`，否则 2.0.14+ 内核注册时会抛 `strict codec has no create() factory`
- **头像圆角一律用 `clip-path: inset(0 round R px)`，不要用 `border-radius`**：本应用环境下 `border-radius` 会被渲染成「大圆角方形」（实测各方向半径波动 5.8px），`clip-path` 走独立渲染路径才是真正的圆。R = `size/2 × 圆角度/100`（100 时 R = size/2 = 正圆）。设置页预览与消息流注入共用同一公式（`previewBoxStyle` / `avatarEl`），改一处必须同时改另一处
- **活动盒（DSH 2.0.14+ 起）**：「已完成分析 / 思考 / 工具活动」这些块被包在**非 flowItem 的容器**里（`_2FMQHq_root > _2FMQHq_body > _2FMQHq_content`）。`scanContainer` 会把"含有 flowItem 的非 flowItem 直接子元素"识别为活动盒，打 `data-ziyong-avatar-box` 并整体缩进；盒内的块不再重复缩进（否则双倍内边距）。内核若再改这层结构，表现为活动块与正文错位，回来改 `scanContainer` 的这段判定即可
