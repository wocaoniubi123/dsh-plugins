# dsh-model-effort — DSH 独立插件：模型思考档位

从 `dsh-ziyong` 集合拆出的独立插件（原 `model-vision` 的思考部分；视觉部分已拆到 `dsh-vision-bridge`）。

## 功能

| 功能 | 说明 |
|---|---|
| 设置页「推理等级」自动开启（2.0.19+） | 官方新版模型编辑卡自带「推理等级」开关（= `reasoningEfforts` 有无），插件不再注入思考勾选框、也不显示档位文字。两路自动开启：①**已保存模型**缺 `reasoningEfforts` 时由 `autoConfigure` 自动补三档（low/high/max）；②**手动添加 / 获取可用模型批量拉取的新行（草稿）**由 `injectorAutoReasoning` 直接点开官方开关——定位 `[role="group"][aria-label^="推理等级"]` 内的 `button[role="switch"]`，按 `aria-checked` 判状态，认不出状态不点。用户手动关掉后该卡片永久沉默，绝不回弹。行内另注入**待保存**标识与**测试**按钮（22px 高，与官方「文本/图片」勾选框对齐；host 发最小请求测连通性） |
| 设置页模型行注入器 | DOM 旁路：MutationObserver + 幂等 reconcile，锚定「模型选项」展开按钮（`CAP_LABELS`）与「模型 ID」输入框（`ID_LABELS`），注入条挂进 `modelInputChoices`；锚点找不到就自动停注入，不影响官方页面 |
| 输入栏「模型胶囊」（含档位） | 输入框只留这一枚（独立思考胶囊已删）：按钮显示 `模型名 + 档位`，档位文字按当前档颜色着色（**Max 档是紫蓝相间渐变字**）；点开的菜单**保持原样**（提供商一级 / 模型二级 hover 展开），只在菜单**底部**追加一块「当前模型 + 思考强度滑块」。滑块是**吸附式**（3 个停靠点，按下跳最近档、拖动实时预览、松手提交），轨道 16px、旋钮 22px，填充从蓝到紫渐变；**满档 Max 时是静态紫蓝渐变底 + 32 颗错峰星尘粒子**（不做扫光/位移，避免渐变循环出硬边），其余档为「蓝 → 当前档颜色」的渐变。松手时用「乐观值」顶上，等投影追上再交接，不会回弹 |
| 档位记忆 | `effort-memory.json`（`"厂商:模型ID" → 档位`）：选模型时先读记忆，没有记录才顶格（max）；手动改档位也回写 |
| 影子模型选择器 | 以 `priority: -1` 遮蔽官方模型选择器（否则官方那套「模型 / 推理等级」二级行会和本胶囊重复）；未启用的供应商整组不显示 |
| 三档制 | 档位固定 `low / high / max`，显示 `Low / High / Max`；新增模型自动补的是这三档（旧的四档映射带 off 会被判过期并重写） |
| 供应商启用 | `provider-enabled.json` 记录 `供应商 → false`（缺省=启用） |
| 自动配置 | scope 快照变化（去抖 150ms）时清洗脏 `input`（非 text/image）、清理旧档位映射与 provider 级 `reasoning` 脏键、补 `compat.supportsDeveloperRole=false`；**不覆盖**用户已写或未保存行（staging）的值 |
| 未保存行 staging | 新行勾选先记内存，行保存（id 进配置快照）后自动落盘；flush 先于自动配置写入 |

host RPC 命名空间 `effortMemory`：`getEffortMemory` / `setModelEffort` / `getProviderEnabled` / `setProviderEnabled` / `testProvider`。

## 数据文件

| 文件 | 内容 |
|---|---|
| `effort-memory.json` | `"厂商:模型ID" → 档位` |
| `provider-enabled.json` | `供应商 → false`（缺省=启用） |

## 安装（profile 方式）

1. profile `package.json` 的 `dependencies` 加 `"dsh-model-effort": "link:E:/AI编程技能/DSH自用插件/dsh-model-effort"`
2. 同文件 `dsh.profile.bundles` 加 `"dsh-model-effort"`
3. profile 的 `node_modules` 下建联接：`mklink /J node_modules\dsh-model-effort E:\AI编程技能\DSH自用插件\dsh-model-effort`
4. 重启 DSH

## 维护

- host：改 `index.js`，重启生效
- client：改 `client.js` 后 `node --check client.js`（单文件 bundle，无合并步骤）
- 新增 host RPC：描述符数组要过 `addStrictCodecFactories()`（内核 2.0.14 起 strict codec 必须带 `create()`）
- **官方 DOM 变化是高危点**：注入器靠 `aria-label` 前缀定位展开按钮（`CAP_LABELS`，含旧「容量/Capacities」与新「模型选项/Model options」）与模型 ID 输入框（`ID_LABELS`），再挂进 `[class*="modelAdvanced"]`；route 由卡内 `[class*="rowName"]`/editorTitle 对照 settings 的 `displayName` 推出。官方再改文案/结构时，表现为注入行消失（不影响官方页面），回来改这几个常量
- **滑块挂在官方 `Menu` 的 `children` 里**：`Menu` 会把 `children` 渲染在条目列表之后（同一个弹层、同一份材质），所以不需要自建弹层/定位；换成自建 portal 反而会多一套 `useAnchoredPosition`（`margin` 漏传会算出 `NaNpx`，实测踩过）
- **`closeOnPointerLeave` 改成了 `false`**：面板里有滑块，拖到边界外时原来会把整个菜单带关（实测）；现在靠点外部/选中条目/Esc 关闭。提供商子菜单仍按 hover 展开、移到别的条目上自动收起
- **影子菜单的子列表要左翻**：胶囊贴屏幕右缘，官方 submenu 默认向右展开会出屏，CSS 里保留 `div[role="menu"] div[role="menu"]{left:auto;right:calc(100% + 10px)}` 这条不能删
