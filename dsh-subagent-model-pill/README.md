# dsh-subagent-model-pill — 子代理会话的模型胶囊

在**子代理会话**的输入框右侧加一枚模型胶囊：显示该子代理当前用的 provider/model/推理强度，点开列出**白名单里授权的模型**并尝试切换。

基线：DSH NEXT `2.0.19-next`（`runtime.json`）。

## 为什么需要这个插件

官方模型胶囊（composer 里那个 `deepseek-v4.1-flash ⌄`）在子代理会话里**不渲染**，而且跟白名单开关无关：

```js
// @deepseek-ai/dsh-client-ui-model-selection/lib/client.js:1914
const available = sessions.subagentAddress(sessionId) === void 0;   // 子代理 → false
// :1320
if (!available) return null;                                        // 直接不渲染
```

同时 host 侧 `selectModel` 对子代理会话会拒绝（`origin === "subagent"`）：

```js
// @deepseek-ai/dsh-api-session-controller/lib/index.js:128-133, 365-369
function hasApiSessionSubagentOwner(ctx, session, agent) {
  if (session.header.origin === "subagent") return true;            // ← 关键
  ...
}
// liveAgent() 命中这个函数就返回 { error: apiSessionSubagentOwnershipError(id) }
// → RemoteError("session/agent-busy", `session "..." is owned by subagent routing`)
```

所以**官方路线是：子代理会话里没有模型 UI，也不允许改模型。** 本插件补上这个能力：
给子代理会话加一枚模型胶囊，可以换成本机白名单里授权的模型，**待命时也能换**，
下次跑任务就用新模型。

## 功能

| 能力 | 状态 |
|---|---|
| 胶囊显示当前模型 | ✅ 只显示模型名，不显示档位 |
| 点开列出白名单模型、标记「当前」 | ✅ `modelCatalog()` + 白名单过滤 |
| 切换**活着的**子代理 | ✅ 立即生效（走 `selectForNextRequest`） |
| 切换**待命的**子代理 | ✅ 记下选择，下次唤醒时自动应用（`agent/created` 钩子） |
| 切换后的界面反馈 | ✅ 胶囊立刻变、菜单关闭、无文字提示 |
| 只在子代理会话出现 | ✅ 用 `summary.origin === "subagent"` 判定 |

## 切换的两条路径

官方 `remote.session.selectModel` 对子代理会话必然被拒（`session/agent-busy`），因为它走
`resolveAgent` → `hasApiSessionSubagentOwner`，后者对 `origin === "subagent"` 直接 `return true`。
本插件不再走这条路，改为 host 侧 RPC `subagentModelPill/selectChildModel`，分两种情形：

**A. 子代理还活着（有 live agent）**

```js
agents.get(sessionId)                       // 绕开 resolveAgent 的归属检查
sessionController.agents.selectForNextRequest(agent, selection)
```

`selectForNextRequest` 内部做两件事：`session.append("model/selection")` 和
`this.selectionFor(agent).current = selection`。后者才是关键——`dsh-agent` 的
`installModelSelection` 在 `agent/request` waterfall 里用 `selection.assembled`
覆盖请求的 provider/model，所以下一个 step 就走新模型。

**B. 子代理待命中（没有 live agent）**

```js
this.pendingSelections.set(sessionId, selection)   // 先记下
// 等它被唤醒时：
readyCtx.on("agent/created", (payload) => {
  const pending = this.pendingSelections.get(payload.agent.session.id);
  if (pending !== undefined) this.applySelection(payload.agent, pending);
});
```

`agent/created` 在 agent 建好但**尚未发布、尚未发出第一次请求**时触发，
所以在这里调用 `selectForNextRequest` 正好赶在首次请求之前。

> 注意：不能靠往日志写 `model/selection` 事件来实现——`coldResume` 用 descriptor 的
> `agentModel` 建 agent，不读那个事件（见下节）。

## 数据来源（全部是官方既有契约）

- **当前模型**：`useSessions(state => state.projectionsBySession[id].values.modelSelection)`
  → `{ lastUsed, next }`，取 `next ?? lastUsed`。与官方胶囊同一份数据。
- **可选模型**：`ctx.get("remote.session").modelCatalog()` → `{ groups: [{ id, name, models }] }`，全局调用。
- **白名单**：`ctx.configForms.get("subagent-model-selection-settings")` 的
  `{ enabled, allowedModels }`，即设置页「插件 → 子智能体 → 模型选择」。
  `configForms` 必须在 fiber `inject` 里声明；命名空间**带 `-settings` 后缀**。

## 挂载点

`conversation.input.right`（`kind: "list"`，官方声明但无注册者）。

**不碰** `conversation.input.model`：`single` 槽且官方已占用，同优先级注册会抛错。

## 实测结论

## 实测结论（CDP 真机跑通）

用 CDP 连 DSH 页面，在页面内 `fetch` 调 RPC（天然带认证），全程免人工点击。
测试会话：主会话 `session-98d96303`，子代理 `e77d1c7e`。

通过官方 `subagents/prompt` 唤醒子代理后切换：

```json
{"ok":true,"value":{"selected":{"provider":"wk","model":"minimax-m3.1-flash"}}}
```

**子代理自己的请求头前后对比（决定性证据）：**

```
seq=15  wk/deepseek-v4.1-flash     ← 切换前
seq=39  wk/deepseek-v4.1-flash     ← 切换前
seq=53  wk/minimax-m3.1-flash      ← 切换后，真实生效
```

seq=53 之后紧跟 `request/context` → `assistant/message` → `tool/call` → `tool/result`，
说明请求真的发出去了并拿到了回复，不是只写了个标记。

| 场景 | 结果 |
|---|---|
| 子代理会话渲染胶囊 | ✅ 只显示模型名（不显示档位） |
| 白名单过滤 | ✅ 只列 `allowedModels` 里勾选的模型 |
| 待命子代理切换 | ✅ 记下选择，下次唤醒时自动应用 |
| 运行中子代理切换 | ✅ 立即生效，请求头变新模型 |
| 切换后的界面 | ✅ 胶囊立刻变、菜单关闭、无任何文字提示 |
| 普通会话 | ✅ 不渲染，不干扰官方胶囊 |

**待命也能切，这是本插件存在的意义。** 子代理跑完会从 `agents` registry 消失，
`agents.get()` 返回 undefined，所以不能在它身上直接改。做法是：把选择存进
`pendingSelections`，监听 `agent/created`，等它被唤醒时赶在第一次请求前应用。

## 智能体团队面板设置

在会话页头「智能体团队」面板里注入一块设置区（`MutationObserver` 注入，官方没有对应 slot）：

| 控件 | 行为 |
|---|---|
| ☑️ 跟随主会话模型 | 把所有成员设为**当前 Lead 会话**正在用的模型 |
| ☑️ 统一设置子代理模型 | 把所有成员设为下方下拉里选的模型 |
| 💊 模型下拉 | 只列白名单里勾选的模型 |

两个勾选框互斥（勾一个自动取消另一个）。范围严格限制在**面板上实际显示的那些成员**，
靠 `TeamMemberRow` 的 React props 取 `member.id`，不会误伤历史子代理。

实测（4 个成员的团队）：

```
跟随  → applyToChildren parent=session-98d96303 → wk/deepseek-v4.1-flash ok=4 fail=0
统一  → applyToChildren parent=session-98d96303 → wk/minimax-m3.1-flash  ok=4 fail=0
```

落到日志里 4 个子代理都有 `model/selection` 事件。

## 推理档位

固定用 `max`，不暴露选择。胶囊上也不显示档位，只显示模型名。
若目标模型不支持 `max`，`resolveCallConfig` 抛错并原样显示原因。

## 已废弃的方案（勿重试）

曾经尝试「冷子代理写 `model/selection` 事件、下次恢复生效」——**这是错的**。
`coldResume` 恢复子代理时用 descriptor 里的 `agentModel` 组装 `agentOptions`：

```js
agentOptions: {
  ...descriptor.agentModel !== void 0 ? { model: descriptor.agentModel } : {},
}
```

它不读 `model/selection` 事件，所以写了也不生效。已改用 `agent/created` 钩子。

## 装法

1. profile `package.json` 的 `dependencies` 加 `"dsh-subagent-model-pill": "link:E:/AI编程技能/DSH自用插件/dsh-subagent-model-pill"`
2. 同文件 `dsh.profile.bundles` 加 `"dsh-subagent-model-pill"`
3. `node_modules` 下建联接：`mklink /J node_modules\dsh-subagent-model-pill E:\AI编程技能\DSH自用插件\dsh-subagent-model-pill`
4. 重启 DSH

## 维护

- client：改 `client.js` 后 `node --check client.js`（单文件 bundle，无合并步骤）
- host：改 `index.js` 后重启 DSH；RPC 命名空间 `subagentModelPill`
- **服务必须在 `ctx.inject` 回调里才拿得到**：`Service` 构造函数执行时 DSH 服务尚未就绪，
  直接 `this.ctx.get("agents")` 会是 undefined（实测只有 `llm` 可用）。必须
  `ctx.inject(["typert","agents","llm","sessionController"], cb)` 后再注册/取服务
- **RPC 参数个数要与客户端一致**：`wireCall` 只传 `{sessionId, provider, model}`，
  invocation 描述符里多一个必填参数会导致校验失败、调用静默落空
- **`selectForNextRequest` 在 `sessionController.agents` 上**，不在 `sessionController`
  本身（官方 `selectModel` 也是 `this.agents.selectForNextRequest`）
- **写句柄的 `append` 是异步且吃数组**：必须 `await handle.append([{seq,type,data}])`，
  seq 取自 `handle.state.cursor` 且要严格连续。漏了 `await` 会让 fetch/flush 抢跑导致事件丢失
- **`persistence.list()` 返回 `{header, formatStatus, revision, sizeBytes}`**：
  身份在 `entry.header.id` / `entry.header.origin`，不是扁平的 `entry.id`
- **投影键名**：`modelSelection` 由 `installModelSelectionProjection` 注册；官方改名则胶囊显示「未知模型」
- **白名单命名空间**：必须是 `subagent-model-selection-settings`（**带 `-settings` 后缀**）。少了后缀读不到，会静默退回「不过滤」，把 DeepSeek Account 等非白名单模型也列出来——**排查时先看菜单里有没有白名单外的模型**
- **`configForms` 必须声明在 inject 里**：才能用 `ctx.configForms`；用 `ctx.get("configForms")` 拿不到
- **`cordis.patch.yml` 只能用 `#` 注释**：写成 `//` 会让整份 YAML 解析失败（`YAMLException`），插件被整条跳过。改完用真 YAML 解析器验一遍，别只跑 `node --check`
- **加载自检办法**：临时把 `DEBUG_ALWAYS = true`，任何会话都会渲染一个红虚线小标签（`PILL:<id前8位>:sub|main`）。看到=已加载且槽位正常；看不到=根本没加载
- **不要改成挂 `conversation.input.model`**：single 槽，会和官方注册直接冲突抛错

## 已知边界

- **冷会话只能"下次生效"**：没有 live agent 就没有"下一次请求"这回事，事件写进日志后
  要等子代理被唤醒或恢复才起作用。想立刻换只能先让它跑起来
- **`subagent_fork` 仍然不能选模型**：官方有意让它继承父级，好让 fork 的对话前缀复用
  KV Cache；本插件没动这条路
- **依赖 `sessionController` 内部结构**：`agents` 字段、`selectionFor`、`selectForNextRequest`
  都是内部实现（非 `@Remote`）。DSH 升级若改动，切换会失效并抛明确错误
