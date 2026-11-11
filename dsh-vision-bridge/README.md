# dsh-vision-bridge — DSH 独立插件：视觉桥（纯文本模型识图）

从 `dsh-ziyong` 集合拆出的独立插件（原 `model-vision` 的识图部分）。

## 视觉判定：id（含前缀剥除）+ 显示名

名单命中的候选（**任一命中**即判定「该模型原生支持视觉」，图片直发、不走桥）：

1. **模型 id 原样**（小写）
2. **id 末段** —— 按 `/` 和 `:` 切分取最后一段（provider 的自定义 id 常带 `cn:` 这类前缀；实测就是这个前缀把 `cn:deepseek-v4.1-flash` 挡在名单外的）
3. **模型显示名** —— 从 `llm-pi-ai` 配置里按 id 取 `name`（按配置 revision 缓存，流式请求不会反复读配置）
4. 上述每一项若含空格，再换成 `-` 重试一次（`GPT 4o` ↔ `gpt-4o` 这类写法差异）

已知边界：剥前缀后的那一段如果正好撞上名单里的通用词（名单里真有一条叫 `custom`），会被判成支持视觉 —— 例如 id 写作 `cn:custom`。名字起得越具体越安全。

自检：`node test-vision-match.mjs`（15 项：前缀剥除 / 显示名 / 空格换连字符 / 不误判 / 候选去重 / 已知碰撞）
## 功能

- **纯文本模型也能发图**：挂 `llm/stream` waterfall，当前主模型按静态名单判定不支持视觉时，把请求里的图片块交给视觉 API 识别成文本再放行——主模型只收到文本，图片不进网关。主模型支持视觉则直发不处理
- **视觉名单**：`vision-models.json`（一次性从 models.dev 目录提取的静态名单，命中即视为支持视觉）
- **识图缓存**：按图片 sha256 缓存到 `vision-cache.json`，重启不重复识别
- **设置区「视觉桥」**：注册官方 `settings.section`（`id: vision-bridge`，`order: 110` → 排在「对话头像」之上），可配：启用 / API 地址 / API Key / 视觉模型；导航图标用一段只改自己那行的 DOM 补丁换成图像图标
- **测试连接**：设置区里「保存」旁边的按钮，用**表单当前值（含未保存）**发一张 64×64 灰色小图走完整识图链路（鉴权 + 模型名 + 多模态取图），成功显示 `✓ 连接正常（N ms）`、失败显示 API 返回的原因。实测一次约 5–10 秒（真实识图调用，不是 ping）

host RPC 命名空间 `visionBridge`：`getConfig` / `updateConfig` / `testConnection`（测试连接）。

## 数据文件

| 文件 | 内容 |
|---|---|
| `config.json` | `enabled` / `baseURL` / `apiKey` / `visionModel` |
| `vision-models.json` | 静态视觉模型名单 |
| `vision-cache.json` | 图片 sha256 → 识图文本 |

## 安装（profile 方式）

1. profile `package.json` 的 `dependencies` 加 `"dsh-vision-bridge": "link:E:/AI编程技能/DSH自用插件/dsh-vision-bridge"`
2. 同文件 `dsh.profile.bundles` 加 `"dsh-vision-bridge"`
3. profile 的 `node_modules` 下建联接：`mklink /J node_modules\dsh-vision-bridge E:\AI编程技能\DSH自用插件\dsh-vision-bridge`
4. 重启 DSH

## 维护

- host：改 `index.js`，重启生效
- client：改 `client.js` 后 `node --check client.js`（单文件 bundle，无合并步骤）
- 新增 host RPC：描述符数组要过 `addStrictCodecFactories()`（内核 2.0.14 起 strict codec 必须带 `create()`）
- 踩坑记录（别踩回去）：
  - `llm/stream` 监听器**必须 `global: true` + `prepend: true`**，否则永远不被分派
  - 请求被官方 `deepFreeze` 冻结，**不能原地改 `options.messages`**：构造浅拷贝走 `llm.adapterStream(newRequest)` 重新分发；失败降级 `next()` 放行
  - 取图用 `attachments.readImage(block.attachment)`，**传完整 ref 对象**（含 `attachmentId`），传字符串会报 `Attachment reference is invalid`
  - host 侧**不要用 fetch**（undici 走系统代理会被拦），用 `http/https.request` 直连
