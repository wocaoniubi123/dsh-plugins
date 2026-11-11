# dsh-skill-mcp-manager — DSH 独立插件：技能 & MCP 管理

自己写的技能文件 / MCP 服务器管理器（市场插件不合意）。入口在侧栏「插件」下面，页面是左右并排的两个分组框：**技能** / **MCP 服务器**。

## 功能

| 分组 | 做什么 |
|---|---|
| **技能** | 列出 4 个官方技能根里的技能（`<工作区>/.dsh/skills`、`<工作区>/.agents/skills`、`~/.dsh/skills`、`~/.agents/skills`；目录式 `SKILL.md` 与单文件 `.md` 都认，名称/描述取 frontmatter 或首行）。可**新建 / 上传 / 编辑 / 删除**，改动即时生效（官方加载器按 digest 重读） |
| **MCP 服务器** | 从 loader 实时列出 `@deepseek-ai/dsh-mcp-client` 条目（serverName / transport / 命令或 URL / 运行状态），可**添加 / 编辑 / 删除**。改动写进 profile 的 `cordis.patch.yml` 标记块，**官方 HMR 监听该文件，写完当场生效（不用重启）** |

### MCP 添加 / 编辑：表单 / JSON 粘贴

「添加服务器」弹窗顶部可选添加方式：

- **表单**：serverName / 传输 / 命令 / 参数 / **环境变量（键值行，可加可删可改）** / cwd / 请求头（http）/ 工具调用超时，逐字段填。编辑已配置的服务器时以上字段全部回显。
- **JSON 粘贴**：整段贴 MCP 配置，一次可导入多个。认这几种形态：
  - `{"mcpServers": {"名字": {…}}}`（Claude Desktop / Cursor 风格）
  - 裸名称映射 `{"名字": {…}}`、单个 `{"serverName": "x", …}`、数组 `[{…}, {…}]`
  - 缺的都自动补：没有 `mcpServers` 外壳按名称映射处理；传输推断（有 `url` 或 `type/transport` 带 http/sse → `streamable-http`，有 `command` → `stdio`）；`timeoutMs` → `toolCallTimeoutMs`；`env` / `headers` / `cwd` 原样带入
  - 按 `serverName` 合并：同名覆盖，其余原样保留；解析失败会在弹窗里给出具体原因

### 保存前探活（真的连一次）

保存 / 导入时先对每个服务器做一次真实 MCP 握手（stdio：拉进程走 `initialize` → `tools/list` 后杀掉；http：POST 同两步，带 session id），**全通过才写入**；有失败就只报错不写，按钮变成「仍然保存」，再点一次才强制写。服务器行上还有独立的「测试」按钮，随时可查连通性（结果含工具数）。

探活自检：`node test-probe-mcp.mjs`（13 项：正常 / 有启动横幅 / tools/list 报错 / 命令不存在 / 不响应超时 / 空 command / http 正常 / 带 headers / 带 session / SSE 帧 / 非法 URL / 连不上）。

解析器自检：`node test-parse-mcp.mjs`（15 项，覆盖 4 种输入形态 + 5 类报错）。

### 技能上传

「上传技能」→ 选**文件夹**或单个 `.md` 文件（可多选），写进所选技能根下的同名目录：

- 文件夹里有 `SKILL.md`（或在唯一一层子目录里）→ 相对路径原样保留（`assets/` 之类附件一起带）
- 整个包在同一层目录里、且只有一个 `.md` → 自动把外层目录当技能根、把那个 `.md` 补成 `SKILL.md`
- 单个 `.md` 文件 → 直接落成 `SKILL.md`
- `SKILL.md` 缺 YAML frontmatter 会自动补（`name` 取技能名、`description` 取正文首行）——官方加载器没 frontmatter 会忽略整个技能
- 文本按 utf8 写，图片等二进制转 base64 原样写；单文件上限 4MB，超了在弹窗里标"跳过"，不会静默丢
- 路径全部校验：`..`、绝对路径、跨出目标技能根的一律拒绝

自检：`node test-upload-skill.mjs`（25 项：路径归一化/越界拒绝/自动补 SKILL.md/frontmatter 规则）。

### 速度与防呆

- 写盘 RPC **写完即返回**（实测 4~9ms）：热加载状态由前端后台追（每 0.6s 看一次，最多 8 秒），命中期望状态就把提示改成「已热加载生效」。之前是 RPC 里干等 —— 删条目官方要等 MCP 子进程退出（超时 5s）、加条目要等握手，用户就得干等几秒。
- 防呆闸：配置块里明显有内容、却一条都没解析出来时**拒绝写盘**（宁可报错也不拿空列表覆盖）。

### 增删改都在 host 侧、以配置文件为准

前端**不拼全量列表**： /  /  三个 RPC 在 host 上先解析  标记块（`parseMcpBlock`，与 `renderMcpBlock` 往返一致，有单测），改完再写回。原因：`listMcp` 读的是 **loader 运行时**条目，刚启动或 HMR 进行中会是空的 —— 拿它当"当前配置"回写会把已有条目全抹掉（实测丢过两次 web-search）。

删除确认也不用 `window.confirm`（原生框同步阻塞渲染进程，万一没被正常关掉，整个页面点什么都没反应、只能重启），改成应用内 Modal。

### MCP 改动是热加载的（不用重启）

写盘之后**官方 HMR 自己接手**：`dsh-hmr` 精确监听 profile 的 `cordis.patch.yml`，文件一变就 `reconcileProfilePatches()` 重新协调 loader 条目（`dsh-app-boot`），MCP 服务器当场上下线。插件只做「写文件 → 等几秒 → 核实条目真的上了/下了」，**不自己调 loader.create/update/remove** —— 自己建一份会和 HMR 建出来的撞 `serverName already in use`（实测踩过）。核实结果决定提示写「已热加载生效」还是「重启 DSH 生效」。

自检：`node test-mcp-block.mjs`（12 项：归一化、YAML 块渲染、受管 id 解析 —— 写盘和运行时用同一份数据，解析只认自己写的标记块）。

host RPC 命名空间 `skillMcp`：`listSkills` / `readSkill` / `saveSkill` / `createSkill` / `uploadSkill` / `deleteSkill` / `listMcp` / `saveMcp` / `testMcp`。

## 入口与页面（照官方「插件」面板那套）

- 侧栏按钮：`sidebar.panellist`，`id: skill-mcp`，**`order: 1`**（官方「插件」是 order 0 → 本插件紧跟在它下面）
- 页面：`main` 槽位，`key: skill-mcp`（与 panellist 的 id 相同，点按钮即切页）；图标用官方 `IconSkillOutlineRegular`

## 安全边界

- 所有技能读写都先过 `assertInsideRoot`：路径必须落在 4 个技能根内，否则拒绝（实测 `C:\Windows\Temp\evil.md` 被拒）
- MCP 的 `serverName` 校验 `[A-Za-z0-9._-]+`；写 patch 只替换自己的标记块（`# >>> dsh-skill-mcp-manager:mcp:begin` … `end`），其余内容原样保留

## 安装（profile 方式）

1. profile `package.json` 的 `dependencies` 加 `"dsh-skill-mcp-manager": "link:E:/AI编程技能/DSH自用插件/dsh-skill-mcp-manager"`
2. 同文件 `dsh.profile.bundles` 加 `"dsh-skill-mcp-manager"`
3. profile 的 `node_modules` 下建联接：`mklink /J node_modules\dsh-skill-mcp-manager E:\AI编程技能\DSH自用插件\dsh-skill-mcp-manager`
4. 重启 DSH

## 维护

- host：改 `index.js`，重启生效。profile 目录靠 loader 的根 include 配置（`file:///<profile>/cordis.yml`）反推，失败退回 `~/.dsh/profiles/desktop`（可用插件 config 的 `profileDir` 覆盖）
- 交互约定：**不给全局按钮上锁**（锁住期间点击会被静默吞掉，用户就是"假死"观感）；改动前先 `listMcp` 取最新列表，保存期间只显示"正在写入并核实…"，host 侧 `saveMcp` 串行排队；RPC 有 45s 超时兜底，host 不应答会报错而不是永远转圈
- client：改 `client.js` 后 `node --check client.js`（单文件 bundle，无合并步骤）；改 MCP JSON 解析逻辑后跑 `node test-parse-mcp.mjs`，改上传/路径逻辑后跑 `node test-upload-skill.mjs`，改探活逻辑后跑 `node test-probe-mcp.mjs`
- 新增 host RPC：描述符数组要过 `addStrictCodecFactories()`（内核 2.0.14 起 strict codec 必须带 `create()`）
- 技能根若官方改名（现在是 `.dsh/skills` / `.agents/skills` + `~/.agents` 家目录），改 host 里 `skillRoots()` 一处即可

## 已知边界

- MCP 的增删改靠官方 HMR 热加载（写完 `cordis.patch.yml` 即生效，插件只负责核实并提示）；技能是文件级，改完即时生效
- 技能**运行中会话**已加载的那份指令不会变（官方加载器按版本 reconcile，新会话/下轮生效）
