// dsh-model-effort · client 侧：模型能力（思考档位注入 + 思考胶囊 + 影子模型选择器 + 连通性测试）。
// 合并进 client.js 时提取本文件的 factory 体。
window.__ModuleLoader__.load({ id: "dsh-model-effort", factory: (require) => {
  "use strict";

  var module = { exports: {} };
  var exports = module.exports;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

  var React = require("react");
  var react_jsx_runtime = require("react/jsx-runtime");
  var _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

  var NS = "dsh-model-effort";
  // 自定义提供方都在 llm-pi-ai settings 命名空间下；provider-card 洞按
  // entryKey === options.key 匹配渲染，key 必须等于该 settingsNs。
  var PROVIDER_NS = "llm-pi-ai";

  var zh = {
    title: "模型能力",
    empty: "该提供方没有声明模型。点【添加模型】后再来配置能力。",
    image: "图像",
    effort: "思考",
    saved: "已保存",
    note: "思考档位写入 reasoningEfforts 后，输入框模型选择器里可直接选档；输入类型（文本/图片）由官方模型编辑卡维护。",
  };

  var en = {
    title: "Model capabilities",
    empty: "No models declared. Add a model first.",
    image: "Image",
    effort: "Effort",
    saved: "Saved",
    failed: "Save failed",
    note: "Effort writes reasoningEfforts, which enables the effort menu in the composer model picker; input modalities are owned by the official model editor.",
  };

  // 三档制（用户 2026-11-09 定）：low / high / max，显示名首字母大写。
  // color = 该档在滑块上的颜色；胶囊上的档位文字用同一个色（用户要求一致）。
  var EFFORT_LEVELS = [
    { id: "low", zh: "低", en: "Low", label: "Low", color: "#3b82f6" },
    { id: "high", zh: "高", en: "High", label: "High", color: "#6366f1" },
    { id: "max", zh: "最高", en: "Max", label: "Max", color: "#a855f7" }
  ];

  function h(tag, props) {
    props = props || {};
    for (var _i = 2; _i < arguments.length; _i++) {
      var c = arguments[_i];
      if (c === void 0 || c === null || c === false) continue;
      if (!props.children) props.children = [];
      if (Array.isArray(c)) props.children = props.children.concat(c);
      else props.children.push(c);
    }
    return React.createElement(tag, props);
  }

  // 三档制：思考勾选框勾上就写这个映射（low/high/max，wire 同名）。
  // off 档按用户要求取消（2026-11-09）：不声明显式关思考，未勾选 = 字段缺省
  // （不写 false 不写 provider 级 reasoning——fk-hs 报错根源就是不写这些）。
  // supportsDeveloperRole=false：国产中转网关（b.ai/flatkey 等）不认 developer
  // 角色，声明思考能力后 pi-ai 会把 system 换成 developer，必须显式关掉。
  var THREE_EFFORTS = { low: "low", high: "high", max: "max" };
  function threeEfforts() {
    return Object.assign({}, THREE_EFFORTS);
  }
  // 声明映射是否已经是三档形状（键集合 = low/high/max，无多余键）。
  // 旧的四档映射（带 off）算过期，会被 autoConfigure 重写成三档。
  function isThreeEfforts(efforts) {
    if (!efforts || typeof efforts !== "object") return false;
    var keys = Object.keys(efforts).sort();
    return keys.length === 3 && keys.join(",") === "high,low,max";
  }
  function effortOf(model) {
    var efforts = model.reasoningEfforts;
    if (!efforts || typeof efforts !== "object") return "max";
    if (efforts.max !== void 0) return "max";
    if (efforts.high !== void 0) return "high";
    if (efforts.low !== void 0) return "low";
    return "max";
  }

  // ── wire 调用（host RPC 通道）────────────────────────────────────
  function wireCall(namespace, method, payload) {
    return fetch("/api/" + namespace + "/" + method, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "client-request",
        rpcId: String(Date.now()) + "-" + Math.random().toString(36).slice(2),
        method: namespace + "/" + method,
        payload: { args: payload }
      })
    }).then(function (r) { return r.json(); }).then(function (full) {
      if (full && full.result && full.result.ok) return full.result.value;
      throw new Error(full && full.result && full.result.error ? full.result.error.message : "rpc failed");
    });
  }

  // ── 思考档位记忆（host 读写插件目录 effort-memory.json）────────────
  // key = "provider:modelId"。选模型时先读记忆档位，没有记录才顶格；
  // 手动改档位 / 首次顶格都会回写。内存缓存 + 异步落盘。
  var EFFORT_MEMORY = null;
  function memoryKey(providerId, modelId) {
    return providerId + ":" + modelId;
  }
  function loadEffortMemory() {
    return wireCall("effortMemory", "getEffortMemory", {}).then(function (map) {
      if (map && typeof map === "object") EFFORT_MEMORY = map;
      return EFFORT_MEMORY;
    }).catch(function () {
      // 读失败也要落成 {}：否则 EFFORT_MEMORY 一直 null，选模型/落档的重试会无限递归。
      if (EFFORT_MEMORY === null) EFFORT_MEMORY = {};
      return EFFORT_MEMORY;
    });
  }
  function rememberedEffortOf(providerId, modelId) {
    if (!EFFORT_MEMORY) return void 0;
    return EFFORT_MEMORY[memoryKey(providerId, modelId)];
  }
  function saveEffortMemory(providerId, modelId, effort) {
    if (!EFFORT_MEMORY) EFFORT_MEMORY = {};
    EFFORT_MEMORY[memoryKey(providerId, modelId)] = effort;
    wireCall("effortMemory", "setModelEffort", { key: memoryKey(providerId, modelId), effort: effort })
      .catch(function () { /* 写失败保留内存态，下次覆盖 */ });
  }

  // ── 提供方启用开关（host 读写插件目录 provider-enabled.json）────
  // { "<providerKey>": false }，无记录 = 启用。取消勾选只是把提供方从输入框
  // 模型列表隐藏（不是禁用）：当前会话/agent 默认模型照常工作。
  var PROVIDER_ENABLED = null;
  function loadProviderEnabled() {
    return wireCall("effortMemory", "getProviderEnabled", {}).then(function (map) {
      PROVIDER_ENABLED = (map && typeof map === "object") ? map : {};
      return PROVIDER_ENABLED;
    }).catch(function () { return PROVIDER_ENABLED || {}; });
  }
  function isProviderEnabled(pid) {
    return !(PROVIDER_ENABLED && PROVIDER_ENABLED[pid] === false);
  }
  function setProviderEnabled(pid, enabled) {
    if (!PROVIDER_ENABLED) PROVIDER_ENABLED = {};
    if (enabled === false) PROVIDER_ENABLED[pid] = false; else delete PROVIDER_ENABLED[pid];
    wireCall("effortMemory", "setProviderEnabled", { key: pid, enabled: enabled === false ? false : true })
      .catch(function () { /* 写失败保留内存态 */ });
  }

  // 任何要写进 settings 的 input 数组先过这里：白名单过滤 + 兜底保底 text。
  function sanitizeInput(arr) {
    var out = (Array.isArray(arr) ? arr : []).filter(function (m) { return m === "text" || m === "image"; });
    if (out.indexOf("text") === -1) out.unshift("text");
    return out;
  }

  // ── 自动配置（模块级，折叠区 UI 移除后保留）────────────────────────
  // scope 快照变化时（去抖 150ms），为缺 input/reasoningEfforts 的已保存模型
  // 按目录补默认，并维护 provider compat/reasoning。与注入器 staging 的
  // 优先级：reconcile 先 flush staging（用户选择优先），自动配置只补"仍缺失"
  // 的字段，不会覆盖用户/staging 已写的值。写入成功后快照更新→再跑→ops 空
  // 收敛，不会循环。
  var autoConfigTimer = null;
  function autoConfigure(sc) {
    if (autoConfigTimer) return;
    autoConfigTimer = setTimeout(function () {
      autoConfigTimer = null;
      try { autoConfigureOnce(sc); } catch (e) { /* 忽略 */ }
    }, 150);
  }
  function autoConfigureOnce(sc) {
    if (!sc) return;
    var snap = sc.getSnapshot();
    var value = snap && snap.value;
    var providers = value && value.providers && typeof value.providers === "object" ? value.providers : null;
    if (!providers) return;
    var ops = [];
    var allKeys = Object.keys(providers);
    for (var i = 0; i < allKeys.length; i++) {
      var pid = allKeys[i];
      var prof = providers[pid] || {};
      var mlist = Array.isArray(prof.models) ? prof.models : [];
      var nextModels = null;
      for (var j = 0; j < mlist.length; j++) {
        var m = mlist[j];
        if (!m.id) continue;
        // 档位清理：只认三档映射（low/high/max）。旧四档（带 off）/六档映射、
        // false 一律 unset 后重写成三档。缺字段的已保存模型自动补三档 = 自动打开官方
        // 「推理等级」（该开关就是 reasoningEfforts 的有无）；用户想关就在
        // 模型选项里手动关掉推理等级，被关掉的模型进 injectorEffortOptOut，
        // 之后不再自动补，绝不回弹。
        var staleEfforts = m.reasoningEfforts !== void 0 && !isThreeEfforts(m.reasoningEfforts);
        var missingEfforts = m.reasoningEfforts === void 0 && !(injectorEffortOptOut && injectorEffortOptOut[pid + "#" + m.id]);
        var dirtyInput = Array.isArray(m.input) && m.input.some(function (x) { return x !== "text" && x !== "image"; });
        var needsInput = !Array.isArray(m.input) || m.input.length === 0 || dirtyInput;
        if (!staleEfforts && !missingEfforts && !needsInput) continue;
        var base = nextModels !== null && nextModels[j] ? nextModels[j] : m;
        if (!nextModels) nextModels = mlist.slice();
        var patched = Object.assign({}, base);
        if (staleEfforts) {
          delete patched.reasoningEfforts;
        }
        if (staleEfforts || missingEfforts) {
          patched.reasoningEfforts = threeEfforts();
        }
        if (needsInput) {
          // 默认 [text, image]：配合 vision-bridge 识图桥，纯文本模型也能发图
          // （图片由视觉模型识别后转文本进请求）。用户行内显式勾掉 image 后
          // input 已存在 → 不再补，不会弹回。
          patched.input = sanitizeInput(["text", "image"]);
        }
        nextModels[j] = patched;
      }
      if (nextModels) ops.push({ op: "set", path: ["providers", pid, "models"], value: nextModels });
      if (!(prof.compat && prof.compat.supportsDeveloperRole === false)) {
        ops.push({ op: "set", path: ["providers", pid, "compat"], value: Object.assign({}, prof.compat || {}, { supportsDeveloperRole: false }) });
      }
      // provider 级 reasoning 键（历史版本写入的顶格/off 默认档）一律 unset：
      // 任何具体档位回退都会撞某类模型（max→关思考模型、off→始终思考模型400）。
      if (prof.reasoning !== void 0) {
        ops.push({ op: "unset", path: ["providers", pid, "reasoning"] });
      }
      // 新模型的「输入类型」默认值：官方模型页的勾选兜底就是 provider.defaultInput
      // （默认只有 text），设成 text+image 后「+ 添加模型」默认就把图片勾上。
      if (!Array.isArray(prof.defaultInput) || prof.defaultInput.indexOf("image") === -1) {
        ops.push({ op: "set", path: ["providers", pid, "defaultInput"], value: ["text", "image"] });
      }
    }
    if (ops.length > 0) {
      sc.mutate(ops, snap && snap.revision).catch(function () {});
    }
  }

  // ── 模型胶囊（影子官方 seat）────────────────────────
  // conversation.input.model 是 single 洞：priority 更低的注册会遮蔽官方
  // ModelSelect（ui-slots 的 entriesOfSlot 取 priority 升序第一个）。
  // 本插件接管这一格（用户 2026-11-08 定下的形态）：
  //   · 胶囊 = 「模型名 + 思考档位」，档位文字按当前档颜色着色，与滑块同色。
  //   · 面板 = 提供商列表 → 该提供商的模型列表 → 思考强度吸附滑块。
  //   · 档位固定三档 low/high/max，只显示模型实际声明过的那些。
  //   · 独立"思考胶囊"已删除，输入框只留这一枚（用户要求）。
  var EFFORT_BY_ID = {};
  var EFFORT_RANK = [];
  for (var _ei = 0; _ei < EFFORT_LEVELS.length; _ei++) {
    EFFORT_BY_ID[EFFORT_LEVELS[_ei].id] = EFFORT_LEVELS[_ei];
    EFFORT_RANK.push(EFFORT_LEVELS[_ei].id);
  }
  function effortLabel(id) {
    if (id === void 0 || id === null || id === "") return "";
    var hit = EFFORT_BY_ID[id];
    return hit ? hit.label : String(id);
  }
  function effortColor(id) {
    var hit = EFFORT_BY_ID[id];
    return hit ? hit.color : "var(--dsw-alias-label-tertiary)";
  }
  // 面板里可调的档：模型声明的 ∩ 三档，按 low→max 排。
  function effortLevelsOf(model) {
    var declared = model && model.reasoning && Array.isArray(model.reasoning.efforts) ? model.reasoning.efforts : [];
    var ids = [];
    for (var i = 0; i < declared.length; i++) {
      var id = typeof declared[i] === "string" ? declared[i] : declared[i].id;
      if (EFFORT_RANK.indexOf(id) !== -1 && ids.indexOf(id) === -1) ids.push(id);
    }
    ids.sort(function (a, b) { return EFFORT_RANK.indexOf(a) - EFFORT_RANK.indexOf(b); });
    return ids.map(function (id) { return EFFORT_BY_ID[id]; });
  }

  // 星尘粒子：[left%, top%, 延迟s, 周期s]，错峰闪烁（参考 Codex 满档星云）。
  var PARTICLE_SEEDS = [
    [4, 28, 0.0, 2.6], [10, 62, 0.9, 2.2], [16, 24, 1.5, 3.0], [22, 70, 0.3, 2.4],
    [28, 40, 1.2, 2.8], [34, 58, 1.9, 2.3], [40, 26, 0.5, 3.2], [46, 72, 1.4, 2.5],
    [52, 36, 0.9, 2.9], [58, 60, 1.7, 2.3], [64, 24, 0.2, 2.7], [70, 68, 1.0, 3.1],
    [76, 32, 2.1, 2.6], [82, 56, 2.4, 2.9], [88, 26, 0.4, 2.4], [94, 64, 2.0, 3.3],
    [7, 46, 1.6, 2.2], [13, 78, 0.6, 2.8], [19, 34, 1.1, 2.5], [25, 52, 2.3, 2.1],
    [31, 22, 0.8, 3.0], [37, 66, 1.8, 2.4], [43, 44, 0.1, 2.7], [49, 30, 1.3, 2.9],
    [55, 74, 2.2, 2.2], [61, 42, 0.7, 3.1], [67, 28, 1.6, 2.5], [73, 62, 0.5, 2.6],
    [79, 38, 2.0, 2.3], [85, 70, 1.1, 2.8], [91, 44, 0.3, 3.2], [97, 30, 1.4, 2.4]
  ];

  // 吸附滑块：按下跳到最近档、拖动实时预览、松手提交（Codex 那种离散档位）。
  function EffortSlider(props) {
    var levels = props.levels;
    var value = props.value;
    var disabled = props.disabled;
    var onCommit = props.onCommit;
    var trackRef = (0, React.useRef)(null);
    var dragState = (0, React.useState)(false);
    var dragging = dragState[0];
    var setDragging = dragState[1];
    var previewState = (0, React.useState)(null);
    var preview = previewState[0];
    var setPreview = previewState[1];
    var previewRef = (0, React.useRef)(null);
    // 乐观值：松手后先按新档显示，等 directory 投影追上（value === optimistic）
    // 或兜底 2s 再清掉。没有它的话，松手瞬间 preview 清空、value 还是旧档，
    // 进度条会先弹回原位置再跳过来（用户看到的"回弹一下"）。
    var optimisticState = (0, React.useState)(null);
    var optimistic = optimisticState[0];
    var setOptimistic = optimisticState[1];
    (0, React.useEffect)(function () {
      if (optimistic !== null && value === optimistic) setOptimistic(null);
    }, [value, optimistic]);
    (0, React.useEffect)(function () {
      if (optimistic === null) return void 0;
      var timer = setTimeout(function () { setOptimistic(null); }, 2000);
      return function () { clearTimeout(timer); };
    }, [optimistic]);
    var n = levels.length;
    function indexOf(id) {
      for (var i = 0; i < n; i++) if (levels[i].id === id) return i;
      return n > 0 ? n - 1 : 0;
    }
    var shown = preview !== null ? preview : (optimistic !== null ? optimistic : value);
    var idx = indexOf(shown);
    var pct = n <= 1 ? 100 : (idx / (n - 1)) * 100;
    var active = levels[idx] || null;
    var activeColor = active ? active.color : "var(--dsw-alias-label-tertiary)";
    // 填充色：从最低思考档（蓝）渐变到当前档的颜色；Off 就是该档纯色。
    // 不能把 off 的灰算进渐变——否则 Low 档左边会拖一截灰，看着像没填满。
    var litLevels = levels.filter(function (lv) { return lv.id !== "off"; });
    var startColor = litLevels.length > 0 ? litLevels[0].color : (active ? active.color : "transparent");
    var gradient = !active || active.id === "off"
      ? (active ? active.color : "transparent")
      : "linear-gradient(90deg," + startColor + "," + active.color + ")";
    function pick(clientX) {
      var el = trackRef.current;
      if (!el || n <= 1) return 0;
      var r = el.getBoundingClientRect();
      var t = r.width > 0 ? (clientX - r.left) / r.width : 1;
      if (t < 0) t = 0;
      if (t > 1) t = 1;
      return Math.round(t * (n - 1));
    }
    function update(clientX) {
      var next = levels[pick(clientX)];
      if (!next) return;
      if (previewRef.current === next.id) return;
      previewRef.current = next.id;
      setPreview(next.id);
    }
    function finish() {
      setDragging(false);
      var picked = previewRef.current;
      previewRef.current = null;
      setPreview(null);
      if (picked !== null && picked !== value) {
        setOptimistic(picked);
        onCommit(picked);
      }
    }
    return h("div", {
      ref: trackRef,
      className: "dsme_slider",
      role: "slider",
      tabIndex: disabled ? -1 : 0,
      "aria-disabled": disabled ? "true" : void 0,
      "aria-valuemin": 0,
      "aria-valuemax": n - 1,
      "aria-valuenow": idx,
      "aria-valuetext": active ? active.label : "",
      onPointerDown: function (e) {
        if (disabled) return;
        e.preventDefault();
        e.stopPropagation();
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* 没有指针捕获也能用 */ }
        setDragging(true);
        update(e.clientX);
      },
      onPointerMove: function (e) {
        if (!dragging || disabled) return;
        update(e.clientX);
      },
      onPointerUp: function (e) {
        if (!dragging) return;
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (err) { /* 同 */ }
        finish();
      },
      onPointerCancel: function () { if (dragging) finish(); },
      onKeyDown: function (e) {
        if (disabled) return;
        var delta = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
        if (delta === 0) return;
        e.preventDefault();
        var next = Math.max(0, Math.min(n - 1, idx + delta));
        if (levels[next] && levels[next].id !== value) {
          setOptimistic(levels[next].id);
          onCommit(levels[next].id);
        }
      }
    },
      h("div", { className: "dsme_track" },
        h("div", { className: "dsme_fill", style: { width: pct + "%", background: gradient } },
          // 满档（Max）才亮星云 + 星尘：粒子全部 CSS 动画，位置写死避免每次重排抖。
          active && active.id === "max"
            ? h("div", { className: "dsme_fx" },
              h("div", { className: "dsme_nebula" }),
              PARTICLE_SEEDS.map(function (p, i) {
                return h("span", {
                  key: "p" + i,
                  className: "dsme_p",
                  style: { left: p[0] + "%", top: p[1] + "%", animationDelay: p[2] + "s", animationDuration: p[3] + "s" }
                });
              })
            )
            : null
        )
      ),
      h("div", { className: "dsme_stops" },
        levels.map(function (lv, i) {
          return h("span", {
            key: lv.id,
            className: "dsme_dot",
            style: { left: (n <= 1 ? 100 : (i / (n - 1)) * 100) + "%" }
          });
        })
      ),
      h("span", {
        className: "dsme_knob",
        style: {
          left: pct + "%",
          borderColor: activeColor,
          boxShadow: dragging
            ? "0 0 0 4px " + activeColor + "33, 0 1px 4px rgba(0,0,0,.35)"
            : "0 1px 4px rgba(0,0,0,.35)"
        }
      })
    );
  }

  // 模型胶囊：**保留原「提供商 → 模型」二级菜单逻辑（未改）**，
  // 只在菜单底部追加「当前模型 + 思考强度滑块」。滑块用 Menu 的 children
  // 挂在条目列表之后，仍然是同一个弹层。
  function ModelSeat(props) {
    var directory = props.directory;
    var select = props.select;
    var load = props.load;
    var available = props.available;
    var state = (0, React.useSyncExternalStore)(function (fn) { return directory.subscribe(fn); }, function () { return directory.getSnapshot(); });
    (0, React.useEffect)(function () {
      load();
    }, []);
    var openState = (0, React.useState)(false);
    var open = openState[0];
    var setOpen = openState[1];
    (0, React.useEffect)(function () {
      if (open) load();
    }, [open]);
    if (!available) return null;
    var busy = state.status === "selecting";
    var current = state.current;
    var groups = state.groups || [];
    // 当前模型的显示名：优先 settings 里的「显示名称」（directory 的 model.name），
    // 取不到才退回模型 ID（输入框不显示裸 ID）。
    var currentModel = null;
    for (var gi = 0; gi < groups.length; gi++) {
      if (current === null || current === void 0 || groups[gi].id !== current.provider) continue;
      for (var mi = 0; mi < (groups[gi].models || []).length; mi++) {
        if (groups[gi].models[mi].id === current.model) currentModel = groups[gi].models[mi];
      }
    }
    var modelLabel = current === null || current === void 0 ? "选择模型" : (currentModel && currentModel.name) || current.model;
    var reasoning = currentModel && currentModel.reasoning;
    var levels = effortLevelsOf(currentModel);
    var effective = (current && current.reasoningEffort) || (reasoning && reasoning.defaultEffort);
    // 会话里可能还留着已删除的档（比如历史 off）：不在这三档里就显示最高档，
    // 免得胶囊上冒出一个不在滑块上的档位名。
    if (effective !== void 0 && levels.length > 0) {
      var known = false;
      for (var li = 0; li < levels.length; li++) if (levels[li].id === effective) known = true;
      if (!known) effective = levels[levels.length - 1].id;
    }
    var effortText = effortLabel(effective);

    var items = [];
    var selMap = {};
    groups.forEach(function (group) {
      (group.models || []).forEach(function (model) {
        selMap[group.id + ":" + model.id] = { provider: group.id, model: model };
      });
    });
    // 厂商一级、模型二级（Menu 原生 submenu，hover 展开）——原逻辑，未改。
    // 未启用（设置页取消勾选）的提供方整组不进菜单。
    // 厂商标签优先 settings 快照的 displayName（官方 directory 不透出备注名）。
    groups.forEach(function (group) {
      if (!isProviderEnabled(group.id)) return;
      var subs = (group.models || []).map(function (model) {
        var isSel = current && current.provider === group.id && current.model === model.id;
        // ✅ 放进 Menu 原生的图标槽（.itemIcon，固定 14px）：选中项填 ✅，未选中项填空串占位，
        // 这样整列模型名都从同一 x 起排（此前只有选中项带「✅ 」文字前缀，其他行左移，看着歪）。
        // ✅ 压到 12px 行内盒，避免 emoji 撑破 14px 槽位把选中行再挤歪。
        var tick = isSel
          ? react_jsx_runtime.jsx("span", { style: { fontSize: "12px", lineHeight: "1" }, children: "✅" })
          : "";
        return { id: group.id + ":" + model.id, label: model.name || model.id, icon: tick };
      });
      var snap = injectorScope ? injectorScope.getSnapshot() : null;
      var prov = snap && snap.value && snap.value.providers && snap.value.providers[group.id];
      if (subs.length > 0) items.push({ id: "provider:" + group.id, label: (prov && prov.displayName) || group.label || group.id, submenu: subs });
    });
    function onPick(id) {
      setOpen(false);
      if (busy) return;
      // 记忆表未加载完（启动窗口）先等加载，防误判"无记录"顶格回写。
      if (EFFORT_MEMORY === null) { loadEffortMemory().then(function () { onPick(id); }); return; }
      var entry = selMap[id];
      if (!entry) return;
      var selection = { provider: entry.provider, model: entry.model.id };
      // 选模型：先读档位记忆；没有记录才顶格（三档取 max）并回写。
      // 无声明档的模型（reasoningEfforts 缺省）不带档位 select。
      var declared = entry.model.reasoning && Array.isArray(entry.model.reasoning.efforts)
        ? entry.model.reasoning.efforts.map(function (d) { return typeof d === "string" ? d : d.id; })
        : [];
      var remembered = rememberedEffortOf(entry.provider, entry.model.id);
      if (declared.length > 0) {
        if (remembered && declared.indexOf(remembered) !== -1) {
          selection.reasoningEffort = remembered;
        } else {
          var top = declared.indexOf("max") !== -1 ? "max" : declared[declared.length - 1];
          selection.reasoningEffort = top;
          saveEffortMemory(entry.provider, entry.model.id, top);
        }
      }
      select(selection).catch(function () { /* 失败保持原选择 */ });
    }
    // 滑块落档：只换档位（provider/model 不变），同时写档位记忆。
    function commitEffort(id) {
      if (busy || current === null || current === void 0) return;
      if (EFFORT_MEMORY === null) { loadEffortMemory().then(function () { commitEffort(id); }); return; }
      saveEffortMemory(current.provider, current.model, id);
      select({ provider: current.provider, model: current.model, reasoningEffort: id }).catch(function () { });
    }
    // 菜单底部：当前模型 + 思考强度滑块（模型没声明档位时整块不出现）。
    var footer = levels.length > 0 ? h("div", { className: "dsme_footer" },
      h("div", { className: "dsme_div" }),
      h("div", { className: "dsme_cur" },
        h("span", { className: "dsme_curLabel" }, "模型"),
        h("span", { className: "dsme_curName" }, modelLabel)
      ),
      h("div", { className: "dsme_effhead" },
        h("span", null, "思考强度"),
        h("span", {
          className: effective === "max" ? "dsme_grad" : "",
          style: { color: effortColor(effective), fontWeight: 500 }
        }, effortText || "默认")
      ),
      h(EffortSlider, { levels: levels, value: effective, disabled: busy, onCommit: commitEffort })
    ) : null;

    return h("span", { style: { position: "relative", display: "inline-flex", flex: "none" } },
      h(_deepseek_ai_dsh_client_ui_primitives.Menu, {
        open: open,
        onClose: function () { setOpen(false); },
        items: items,
        selectedId: current ? "provider:" + current.provider : void 0,
        onSelect: onPick,
        portal: true,
        side: "top",
        align: "end",
        // 面板里多了滑块：鼠标拖出边界时不能把菜单连带关掉（原为 true）。
        closeOnPointerLeave: false,
        children: footer,
        anchor: h("button", {
          type: "button",
          disabled: busy,
          "aria-label": "选择模型",
          title: "选择模型",
          onClick: function (e) {
            e.stopPropagation();
            setOpen(function (v) { return !v; });
          },
          style: {
            cursor: busy ? "wait" : "pointer", font: "inherit", fontSize: "13px", height: "28px",
            color: busy ? "var(--dsw-alias-label-dimmed)" : "var(--dsw-alias-label-primary)",
            background: "transparent", border: "none", borderRadius: "14px",
            alignItems: "center", gap: "4px", padding: "0 8px", display: "inline-flex", flex: "none", maxWidth: "260px"
          }
        },
          h("span", { style: { lineHeight: "20px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, modelLabel),
          effortText ? h("span", {
            // 满档用紫蓝相间渐变字（.dsme_grad 会覆盖 color）；其余档用该档纯色。
            className: effective === "max" ? "dsme_grad" : "",
            style: { lineHeight: "20px", flex: "none", color: effortColor(effective), fontWeight: 500 }
          }, effortText) : null,
          h(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, { size: 12 })
        )
      })
    );
  }

  // ── 设置页模型行注入器（思考档位编辑；输入类型归官方）────────────────
  // 官方 settings 页没有直达单个模型行的 slot（provider-card 只到供应商卡片级），
  // 参考 dsh-better-reasoning-effort 的 DOM 旁路思路：MutationObserver 全页监听 +
  // reconcile 幂等扫描，锚定每行的展开按钮（aria-label 前缀，中英文；2.0.14 起
  // 官方把它从「容量」改名为「模型选项」），把编辑器挂进展开后的字段容器
  // （modelAdvanced）底部。防御性设计：官方结构/文案变了找不到锚点就自动停注入，
  // 不影响官方页面；行收起/删除/重渲染时编辑器随 DOM 一起消失，下次展开重新注入。
  var CAP_LABELS = ["容量", "Capacities", "模型选项", "Model options"];
  var ID_LABELS = ["模型 ID", "Model ID"];
  // 展开按钮选择器：由标签表拼出（2.0.14 起官方把「容量」改名为「模型选项」）
  var CAP_SELECTOR = CAP_LABELS.map(function (l) { return 'button[aria-label^="' + l + '"]'; }).join(", ");
  var CAP_MARK = "data-ziyong-cap";
  var injectorScope = null;
  var injectorPending = {}; // "route#modelId" -> true，写入期间防扫描回拉勾选
  var injectorObserved = false;

  function injectorLevelZh(levelId) {
    for (var i = 0; i < EFFORT_LEVELS.length; i++) {
      if (EFFORT_LEVELS[i].id === levelId) return EFFORT_LEVELS[i].label;
    }
    return String(levelId);
  }
  // 编辑卡的路由 key：editorRoute 标签优先；官方只在 displayName ≠ key 时渲染该
  // 标签（同名供应商如 flatkey 没有），此时用卡内标题匹配 displayName 或直接当 key。
  function injectorRouteOf(card) {
    var tag = card.querySelector('[class*="editorRoute"]');
    if (tag) {
      var key = (tag.textContent || "").trim();
      if (key.length > 0) return key;
    }
    var title = card.querySelector('[class*="editorTitle"], [class*="rowName"]');
    if (title) {
      var t = (title.textContent || "").trim();
      if (t.length > 0) {
        var snap = injectorScope ? injectorScope.getSnapshot() : null;
        var provs = snap && snap.value && snap.value.providers;
        if (provs && typeof provs === "object") {
          for (var k in provs) {
            if (provs[k] && provs[k].displayName === t) return k;
          }
          if (Object.prototype.hasOwnProperty.call(provs, t)) return t;
        }
        // 匹配不到 providers 键/displayName 的标题（如误抓全局标题）不可信：
        // 返回空跳过该卡，防 staging 写进错误 route 导致 flush 永不命中。
        return "";
      }
    }
    return "";
  }
  // 未保存新提供方卡的 route 兜底：官方 route 解析依赖配置里已有该提供方，
  // 新卡还没有。取卡内"Provider ID"输入框的值当临时 route——创建提供方后
  // settings 里的键就是它，staging 届时能对上号自动落盘。ID 为空返回空跳过。
  function injectorPendingRouteOf(card) {
    var inputs = card.querySelectorAll("input[aria-label]");
    for (var i = 0; i < inputs.length; i++) {
      var al = inputs[i].getAttribute("aria-label") || "";
      if (al.indexOf("Provider ID") === 0 || al.indexOf("Provider Id") === 0) {
        return String(inputs[i].value || "").trim();
      }
    }
    return "";
  }
  // staging 表：未保存行的用户勾选，行保存后自动落盘。
  // route -> { modelId -> { input?, reasoningEfforts? } }
  var injectorStaged = {};
  function injectorStagedGet(route, modelId) {
    var r = injectorStaged[route];
    return r ? r[modelId] : void 0;
  }
  function injectorStagedSet(route, modelId, patch) {
    var r = injectorStaged[route] || (injectorStaged[route] = {});
    r[modelId] = Object.assign({}, r[modelId], patch);
  }
  function injectorStagedClear(route, modelId) {
    var r = injectorStaged[route];
    if (!r) return;
    delete r[modelId];
    if (Object.keys(r).length === 0) delete injectorStaged[route];
  }
  // 读 scope 快照算某行的勾选状态：
  //   快照已保存 → 配置实际值（可写）；
  //   未保存（手动输入中的新行）→ staging 优先，否则默认勾（文本/图片/思考）。
  //   纯展示，不写配置。
  function injectorStateOf(route, modelId) {
    var snap = injectorScope ? injectorScope.getSnapshot() : null;
    var value = snap && snap.value;
    var prov = value && value.providers && value.providers[route];
    var models = prov && Array.isArray(prov.models) ? prov.models : [];
    for (var i = 0; i < models.length; i++) {
      if (models[i] && models[i].id === modelId) {
        var model = models[i];
        // 已保存行显示配置实际值：字段缺省/无映射 = 思考未勾
        // （未勾=不写字段，与新行默认勾是两个状态：新行勾上保存时会落三档映射）。
        return {
          saved: true,
          model: model,
          input: Array.isArray(model.input) ? model.input.slice() : [],
          effortOn: !!model.reasoningEfforts,
          levelZh: model.reasoningEfforts ? injectorLevelZh(effortOf(model)) : "不启用"
        };
      }
    }
    var staged = injectorStagedGet(route, modelId);
    var input = staged && staged.input ? staged.input.slice() : sanitizeInput(["text", "image"]);
    var effortOn = staged ? !!staged.reasoningEfforts : true;
    var levelZh = effortOn && staged && staged.reasoningEfforts
      ? injectorLevelZh(effortOf({ reasoningEfforts: staged.reasoningEfforts }))
      : (effortOn ? "Max" : "不启用");
    return { saved: false, input: input, effortOn: effortOn, levelZh: levelZh };
  }
  // 写某行字段（patch 直接进 models 数组对应下标，保留行内其他字段）。
  function injectorWriteRow(route, modelId, patch) {
    var snap = injectorScope ? injectorScope.getSnapshot() : null;
    var value = snap && snap.value;
    var prov = value && value.providers && value.providers[route];
    var models = prov && Array.isArray(prov.models) ? prov.models : [];
    for (var i = 0; i < models.length; i++) {
      if (models[i] && models[i].id === modelId) {
        var next = models.slice();
        next[i] = Object.assign({}, models[i], patch);
        return injectorScope.mutate([{ op: "set", path: ["providers", route, "models"], value: next }], snap && snap.revision);
      }
    }
    return Promise.reject(new Error("模型行尚未保存"));
  }
  // 取消思考勾选：移除该行 reasoningEfforts 键（字段缺省，不写 false）。
  function injectorUnsetEfforts(route, modelId) {
    var snap = injectorScope ? injectorScope.getSnapshot() : null;
    var value = snap && snap.value;
    var prov = value && value.providers && value.providers[route];
    var models = prov && Array.isArray(prov.models) ? prov.models : [];
    for (var i = 0; i < models.length; i++) {
      if (models[i] && models[i].id === modelId) {
        var next = models.slice();
        var row = Object.assign({}, models[i]);
        delete row.reasoningEfforts;
        next[i] = row;
        return injectorScope.mutate([{ op: "set", path: ["providers", route, "models"], value: next }], snap && snap.revision);
      }
    }
    return Promise.reject(new Error("模型行尚未保存"));
  }
  // 行编辑器挂载/更新：wrap 已存在只刷状态，不存在则创建并绑事件。
  // idInput = 该行"模型 ID"输入框（实时匹配 + staging key 迁移用）。
  function injectorMount(container, route, idInput) {
    var wrap = container.querySelector("[" + CAP_MARK + "]");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.setAttribute(CAP_MARK, "");
      wrap.style.cssText = "display:inline-flex;align-items:center;gap:8px;flex-wrap:nowrap;margin-left:6px;font-size:12px;line-height:22px;color:var(--dsw-alias-label-secondary);vertical-align:middle";
      var err = document.createElement("span");
      err.style.cssText = "color:var(--dsw-alias-state-error-primary);font-size:12px";
      wrap.appendChild(err);
      // 输入类型（文本/图片）自 2.0.14 起官方模型编辑卡自带；「思考」勾选框与
      // 「推理等级」（2.0.19 起）也全是官方的，插件不再重复提供，也不显示档位文字。
      // 这里只保留：待保存标识 + 连通性测试按钮。
      var modeSpan = document.createElement("span");
      modeSpan.setAttribute("data-ziyong-mode", "");
      modeSpan.style.cssText = "font-size:11px;color:var(--dsw-alias-state-warn-label)";
      wrap.appendChild(modeSpan);
      // ── 连通性测试按钮：host 按卡内当前值（含未保存）发最小请求 ──
      var testBtn = document.createElement("button");
      testBtn.type = "button";
      testBtn.textContent = "测试";
      testBtn.title = "用该模型发一条最小请求测连通性（成功=延迟，失败=原因）";
      // 与官方「文本 / 图片」勾选框同高同排（box-sizing + 固定高 22px、字号 12px），
      // 只加水平内边距以免文字贴边；视觉上与勾选框那一行对齐。
      testBtn.style.cssText = "box-sizing:border-box;height:22px;line-height:20px;font-family:inherit;font-size:12px;color:var(--dsw-alias-label-secondary);background:transparent;border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;padding:0 6px;margin:0;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle";
      var testResult = document.createElement("span");
      testResult.style.cssText = "font-size:12px";
      wrap.appendChild(testBtn);
      wrap.appendChild(testResult);
      testBtn.addEventListener("click", function () {
        var modelId = curId();
        if (!modelId) { testResult.textContent = "先填模型 ID"; testResult.style.color = "var(--dsw-alias-state-error-primary)"; return; }
        var card = container.closest('[class*="editor"], [class*="rowCard"], [class*="addCard"]');
        if (!card) return;
        var urlInput = card.querySelector('input[aria-label="API 地址"]');
        var apiSel = card.querySelector('select[aria-label="API 协议"]');
        var keyInput = card.querySelector('input[aria-label="API 密钥"]');
        var baseURL = urlInput ? String(urlInput.value || "").trim() : "";
        if (!baseURL) { testResult.textContent = "API 地址为空"; testResult.style.color = "var(--dsw-alias-state-error-primary)"; return; }
        // apiKeyEnv：已保存读快照（权威），未保存按官方 deriveKeyRef 规则推导。
        var apiKeyEnv = null;
        var snap = injectorScope ? injectorScope.getSnapshot() : null;
        var prov = snap && snap.value && snap.value.providers && snap.value.providers[route];
        if (prov && prov.apiKeyEnv) apiKeyEnv = prov.apiKeyEnv;
        else apiKeyEnv = String(route || "").toUpperCase().replace(/[^A-Z0-9]/g, "_") + "_API_KEY";
        testBtn.disabled = true;
        testBtn.textContent = "…";
        testResult.textContent = "";
        wireCall("effortMemory", "testProvider", {
          api: apiSel ? apiSel.value : "openai-completions",
          baseURL: baseURL,
          model: modelId,
          apiKeyEnv: apiKeyEnv,
          // 密钥框有手输新值（未保存卡或替换 key）优先用它；空 = 走 credentials/env
          apiKey: keyInput && keyInput.value ? keyInput.value : null
        }).then(function (r) {
          if (r && r.ok) {
            testResult.textContent = "✓ " + r.latencyMs + "ms";
            testResult.style.color = "var(--dsw-alias-state-success-primary)";
          } else {
            testResult.textContent = "✗ " + String(r && r.error || "失败").slice(0, 80);
            testResult.style.color = "var(--dsw-alias-state-error-primary)";
          }
        }, function (e) {
          testResult.textContent = "✗ " + String(e && e.message || e).slice(0, 80);
          testResult.style.color = "var(--dsw-alias-state-error-primary)";
        }).then(function () {
          testBtn.disabled = false;
          testBtn.textContent = "测试";
        });
      });
      var curId = function () { return (idInput ? idInput.value : "").trim(); };
      // 模型 ID 输入框实时监听：staging key 跟随最新 id。
      // 新行默认勾的三档预置在 injectorSync 兜底（覆盖手动输入/获取可用模型
      // 等所有 ID 写入路径），这里只做 key 迁移。
      if (idInput && !idInput.hasAttribute("data-ziyong-bound")) {
        idInput.setAttribute("data-ziyong-bound", "");
        idInput.addEventListener("input", function () {
          var cur = (idInput.value || "").trim();
          var r = injectorStaged[route];
          if (r) {
            var oldIds = Object.keys(r);
            for (var oi = 0; oi < oldIds.length; oi++) {
              if (oldIds[oi] !== cur) {
                injectorStaged[route][cur] = r[oldIds[oi]];
                delete r[oldIds[oi]];
              }
            }
          }
          injectorSync(container, route, idInput);
        });
      }
      // 挂在官方「输入类型」那一行里（文本/图片 勾选框右侧；modelInputChoices 是 flex 行，
      // 挂它的父级 fieldset 会换行）。注意 querySelector 按文档序取首个匹配，必须分开查。
      var host = container.querySelector('[class*="modelInputChoices"]') || container.querySelector('[class*="modelInputTypes"]') || container;
      if (wrap.parentElement !== host) host.appendChild(wrap);
    }
    injectorWatchReasoningOff(container, route, idInput);
    injectorAutoReasoning(container);
    injectorSync(container, route, idInput);
  }
  // ── 自动打开官方「推理等级」开关 ──
  // 2.0.19 起官方模型编辑卡自带「推理等级」开关（= reasoningEfforts 有无）。
  // 新加的模型行（手动「添加模型」或「获取可用模型」批量拉取）默认是关的；
  // 草稿不在配置里，autoConfigure 写不到，只能替用户点一下这个官方开关。
  // 用户自己关掉后该卡片永久沉默（expando 标记），绝不回弹。
  // ── 自动打开官方「推理等级」开关（适配自定义开关：root + 滑块 thumb）──
  // 官方 2.0.19 的开关是自定义组件（结构里是 <span class="_thumb_xxx">），
  // 既没有 role=switch 也可能是 div；所以用「标签文字 + 同一行 + 在右侧 + 滑块位置」定位。
  function injectorFindReasonSwitch(container) {
    // 官方真实结构（2.0.19）：
    //   <div role="group" aria-label="推理等级 2">
    //     <div class="…REASONINGHead">
    //       <span class="…FieldLabel"><button aria-label="推理等级说明">?</button></span>
    //       <button role="switch" aria-checked="false" class="_switch_…"><span class="_thumb_…"></span></button>
    //     </div>
    //   </div>
    // 按语义定位：先找 aria-label 以「推理等级 / Reasoning」开头的 group，再取组内 role=switch。
    var group = null;
    var groups = container.querySelectorAll('[role="group"][aria-label]');
    for (var gi = 0; gi < groups.length; gi++) {
      var gal = groups[gi].getAttribute("aria-label") || "";
      if (gal.indexOf("推理等级") === 0 || /^Reasoning/i.test(gal)) { group = groups[gi]; break; }
    }
    var root = null;
    if (group !== null) {
      root = group.querySelector('[role="switch"]');
      if (root === null) root = group.querySelector('button[aria-checked]');
      if (root === null) root = group.querySelector('[class*="thumb"], [class*="Thumb"]');
      if (root !== null && /thumb/i.test(String(root.className || ""))) {
        // 只拿到滑块时往上找开关根
        for (var up1 = 0; up1 < 4 && root.parentElement; up1++) {
          root = root.parentElement;
          if (root.tagName === "BUTTON" || root.getAttribute("role") === "switch" || root.hasAttribute("aria-checked")) break;
        }
      }
    }
    if (root === null) {
      // 兜底：整张模型卡里只有一个 switch 时直接用它
      var allSw = container.querySelectorAll('[role="switch"], button[aria-checked]');
      if (allSw.length === 1) root = allSw[0];
    }
    if (root === null) return null;
    // 状态：aria-checked → input.checked → 类名 → 滑块几何（兜底）
    var isOn = null;
    var probe = root;
    for (var p = 0; p < 4 && probe; p++) {
      var aria = probe.getAttribute && probe.getAttribute("aria-checked");
      if (aria !== null && aria !== undefined) { isOn = aria === "true"; break; }
      if (probe.tagName === "INPUT") { isOn = probe.checked === true; break; }
      probe = probe.parentElement;
    }
    if (isOn === null) {
      var cls = String(root.className || "");
      if (/(checked|selected|active|enabled)/i.test(cls)) isOn = true;
      else if (/(unchecked|disabled)/i.test(cls)) isOn = false;
    }
    if (isOn === null) {
      var thumbEl = root.querySelector('[class*="thumb"], [class*="Thumb"]');
      if (thumbEl === null && /thumb/i.test(String(root.className || ""))) thumbEl = root;
      if (thumbEl !== null) {
        var tr = root.getBoundingClientRect();
        var th = thumbEl.getBoundingClientRect();
        if (tr.width > 4 && th.width > 0) {
          isOn = (th.left + th.width / 2 - tr.left) / tr.width > 0.5;
        }
      }
    }
    return { root: root, isOn: isOn };
  }
  function injectorAutoReasoning(container) {
    if (!container || container.__ziyongReasonUser === true) return;
    if (container.__ziyongReasonOn === true) return; // 已确认开着，不再扫描（性能）
    var now = Date.now();
    if (container.__ziyongReasonClickedAt && now - container.__ziyongReasonClickedAt < 1500) return;
    var found = injectorFindReasonSwitch(container);
    if (!found) return;
    if (found.isOn === true) { container.__ziyongReasonOn = true; return; }
    if (found.isOn === null) return;   // 认不出状态，宁可不点（防止把开着的关掉）
    // 用户手动点过 → 这张卡永久沉默
    if (!found.root.hasAttribute("data-ziyong-autoreason")) {
      found.root.setAttribute("data-ziyong-autoreason", "");
      var markUser = function (ctr) {
        return function () {
          if (injectorAutoClicking) return;
          ctr.__ziyongReasonUser = true;
        };
      }(container);
      found.root.addEventListener("click", markUser, true);
    }
    container.__ziyongReasonClickedAt = now;
    injectorAutoClicking = true;
    try { found.root.click(); } catch (e5) { /* 点不动就算了 */ }
    injectorAutoClicking = false;
  }
  // 自动补「输入类型 → 图片」：只补「从没设置过 input」的卡片（新建供应商/新模型的草稿），
  // 一张卡只补一次；用户自己点过/取消勾选后永久沉默，绝不回弹。已声明过 input 的模型不碰。
  // （草稿不在配置里，插件读不到也写不了，只能替用户点这一下官方的勾选框。）
  var AUTO_MARK = "data-ziyong-autoimg";
  var injectorAutoOptOut = {}; // route#modelId -> true，用户动过
  var injectorAutoClicking = false;
  // 用户手动关掉某模型的「推理等级」后记在这里，之后不再自动补三档（绝不回弹）。
  // 键是 provider#modelId；关闭动作来自官方开关的点击（见 injectorWatchReasoningOff）。
  var injectorEffortOptOut = {};
  function injectorSavedInput(route, modelId) {
    try {
      var snap = injectorScope ? injectorScope.getSnapshot() : null;
      var provs = snap && snap.value && snap.value.providers;
      var list = provs && provs[route] && Array.isArray(provs[route].models) ? provs[route].models : [];
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].id === modelId) return list[i].input;
      }
    } catch (e) { /* 快照不可用就当没设置过 */ }
    return undefined;
  }
  function injectorAutoImage(container, route, idInput) {
    if (!container) return;
    var row = container.querySelector('[class*="modelInputChoices"]');
    if (!row) return;
    var boxes = row.querySelectorAll("input[type=checkbox]");
    for (var i = 0; i < boxes.length; i++) {
      var img = boxes[i];
      var label = img.closest && img.closest("label");
      var text = label ? (label.textContent || "").trim() : "";
      if (!/图片|Image/.test(text)) continue; // 只看官方那个「图片」框
      if (!img.hasAttribute(AUTO_MARK)) {
        img.setAttribute(AUTO_MARK, "");
        var markUser = function (el) {
          return function () {
            if (injectorAutoClicking) return; // 自己点的这一次不算用户操作
            el.setAttribute(AUTO_MARK, "user");
            var mid = (idInput ? idInput.value : "").trim();
            injectorAutoOptOut[route + "#" + mid] = true;
          };
        }(img);
        img.addEventListener("click", markUser, true);
        img.addEventListener("change", markUser, true);
      }
      var mid0 = (idInput ? idInput.value : "").trim();
      if (img.getAttribute(AUTO_MARK) === "user" || injectorAutoOptOut[route + "#" + mid0]) return;
      if (img.checked) return; // 已经是勾上的
      var saved = mid0 ? injectorSavedInput(route, mid0) : undefined;
      if (Array.isArray(saved) && saved.length > 0) return; // 已声明过输入类型 → 尊重用户选择
      injectorAutoClicking = true;
      try { img.click(); } catch (e) { /* 点不动就算了，不阻断注入 */ }
      injectorAutoClicking = false;
      return;
    }
  }
  // 用户手动关掉「推理等级」→ 记 opt-out，之后 autoConfigure 不再自动补。
  // 官方开关的语义就是 reasoningEfforts 有无；点完一拍后读配置判断是否真被关掉。
  function injectorWatchReasoningOff(container, route, idInput) {
    if (!container || container.hasAttribute("data-ziyong-effortwatch")) return;
    container.setAttribute("data-ziyong-effortwatch", "");
    container.addEventListener("click", function (event) {
      var target = event.target;
      if (target === null || target === void 0 || typeof target.closest !== "function") return;
      // 命中推理等级开关（role=switch / 勾选框）或其 label 才算
      var hit = target.closest('[role="switch"], input[type="checkbox"], label');
      if (hit === null) return;
      var labelText = (hit.closest("label") || hit.parentElement || {}).textContent || "";
      if (/推理等级|Reasoning/i.test(labelText) === false && hit.getAttribute("role") !== "switch") return;
      var modelId = (idInput ? idInput.value : "").trim();
      if (!modelId) return;
      setTimeout(function () {
        try {
          var st = injectorStateOf(route, modelId);
          if (st && st.saved && st.effortOn === false) injectorEffortOptOut[route + "#" + modelId] = true;
        } catch (e) { /* 忽略 */ }
      }, 400);
    }, true);
  }
  // 刷一行编辑器状态（勾选/档位/待保存标识），写入中跳过防回拉。
  function injectorSync(container, route, idInput) {
    var wrap = container.querySelector("[" + CAP_MARK + "]");
    if (!wrap) return;
    var modelId = (idInput ? idInput.value : "").trim();
    if (!modelId) return;
    var key = route + "#" + modelId;
    if (injectorPending[key]) return;
    var st = injectorStateOf(route, modelId);
    if (!st) return;
    var err = wrap.firstChild;
    if (err && err.tagName === "SPAN") err.textContent = "";
    // 按 data 属性定位（勿数 children 索引：测试按钮等尾部元素会错位，踩过）
    var modeEl = wrap.querySelector("[data-ziyong-mode]");
    // 行内挂在官方「输入类型」右侧，不再用顶边线做标识；未保存靠「待保存」文字提示
    if (modeEl) modeEl.textContent = st.saved ? "" : "待保存";
  }
  // 未保存行的 staging 落盘：该 id 出现在配置快照（行已保存）后自动写入。
  function injectorFlushStaged() {
    if (!injectorScope) return;
    // flush 前先同步预置一遍未保存行（与 flush 同一个调用块，消除保存快于
    // observer 去抖的时序缝）：DOM 里的新行若还没预置三档，这里补上。
    try { injectorPrestageNewRows(); } catch (e) { /* 预置失败不阻断 flush */ }
    var snap = injectorScope.getSnapshot();
    var value = snap && snap.value;
    var providers = value && value.providers;
    if (!providers) return;
    var chain = Promise.resolve();
    var settled = []; // 完成的 (route, modelId)，循环外统一清
    for (var route in injectorStaged) {
      var prof = providers[route];
      var models = prof && Array.isArray(prof.models) ? prof.models : [];
      var r = injectorStaged[route];
      if (!r) continue;
      for (var modelId in r) {
        var found = false;
        for (var i = 0; i < models.length; i++) if (models[i] && models[i].id === modelId) { found = true; break; }
        if (!found) continue;
        var decl = r[modelId];
        var hadEffortsInDecl = "reasoningEfforts" in decl;
        var patch = {};
        if (decl.input) patch.input = decl.input;
        if (hadEffortsInDecl) patch.reasoningEfforts = decl.reasoningEfforts;
        var unsetIt = hadEffortsInDecl && decl.reasoningEfforts === void 0;
        settled.push({ route: route, modelId: modelId });
        (function (rt, mid, p, un) {
          // 串行链：每个写入等上一个完成，各自 mutate 内部重读最新快照
          //（injectorWriteRow/Unset 自己 getSnapshot），避免并发 revision 冲突
          //（批量添加 11 行并发写只有第 1 行成功，其余全 conflict，实测踩过）。
          chain = chain.then(function () {
            return un ? injectorUnsetEfforts(rt, mid) : injectorWriteRow(rt, mid, p);
          });
        })(route, modelId, patch, unsetIt);
      }
    }
    if (settled.length > 0) {
      chain.then(function () {
        for (var k = 0; k < settled.length; k++) injectorStagedClear(settled[k].route, settled[k].modelId);
      }, function () { /* 失败保留 staging，下次扫描重试 */ });
    }
  }
  // 设置弹窗模型区块根：容量按钮所在 section（弹窗关闭后 isConnected=false，自动重找）。
  var injectorRoot = null;
  function injectorFindRoot() {
    if (injectorRoot && injectorRoot.isConnected) return injectorRoot;
    injectorRoot = null;
    if (typeof document === "undefined" || !document.body) return null;
    var btn = document.querySelector(CAP_SELECTOR);
    if (!btn) return null;
    var root = btn.closest('[class*="section"]');
    injectorRoot = root || document.body;
    return injectorRoot;
  }
  // 预置未保存新行的三档进 staging（幂等）：扫描 DOM 中所有容量行，
  // ID 已填、不在配置里的行若无 staging 记录则预置。reconcile（DOM 变动）
  // 与 flushStaged（保存链）都会调用——后者兜底"保存快于 observer 去抖"
  // 的时序缝（批量添加后立即保存会漏，实测踩过）。
  function injectorPrestageNewRows() {
    var root = injectorFindRoot();
    if (!root) return;
    if (!root.querySelector(CAP_SELECTOR)) return;
    var buttons = root.querySelectorAll("button[aria-label]");
    for (var b = 0; b < buttons.length; b++) {
      var btn = buttons[b];
      var al = btn.getAttribute("aria-label") || "";
      var isCap = false;
      for (var j = 0; j < CAP_LABELS.length; j++) if (al.indexOf(CAP_LABELS[j]) === 0) { isCap = true; break; }
      if (!isCap) continue;
      var row = btn.closest('[class*="modelEntry"]');
      var card = btn.closest('[class*="editor"], [class*="rowCard"], [class*="addCard"]');
      if (!row || !card) continue;
      var idInput = null;
      var inputs = row.querySelectorAll("input[aria-label]");
      for (var ii = 0; ii < inputs.length; ii++) {
        var iali = inputs[ii].getAttribute("aria-label") || "";
        for (var jj = 0; jj < ID_LABELS.length; jj++) {
          if (iali.indexOf(ID_LABELS[jj]) === 0) { idInput = inputs[ii]; break; }
        }
        if (idInput) break;
      }
      if (!idInput) continue;
      var route = injectorRouteOf(card);
      if (!route) route = injectorPendingRouteOf(card);
      if (!route) continue;
      var mid = String(idInput.value || "").trim();
      if (!mid) continue;
      var st = injectorStateOf(route, mid);
      if (st && !st.saved && !injectorStagedGet(route, mid)) {
        injectorStagedSet(route, mid, { reasoningEfforts: threeEfforts() });
      }
    }
  }

  // ── 提供方行"启用"勾选（设置页列表注入）────────────────────────
  // 勾选状态存 provider-enabled.json。追加在 rowActions 末尾：自定义提供方
  // = 删除后面，DeepSeek 这类只有编辑的 = 编辑后面。
  var ENABLE_MARK = "data-ziyong-enable";
  // 行的 route：官方编辑按钮 aria-label 自带键（"编辑 xxx (route)"，displayName
  // ≠ key 时才有括号）；无括号时标题就是键。内置官方（DeepSeek 不在 settings）
  // 用标题小写兜底，同时返回官方括号键——两个键一起切换，ModelSeat 过滤两个都认。
  function enableRouteOf(row, editBtn) {
    var al = editBtn.getAttribute("aria-label") || "";
    var m = al.match(/\(([^()]+)\)\s*$/);
    var paren = m ? m[1].trim() : "";
    var title = row.querySelector('[class*="rowName"]');
    var t = title ? (title.textContent || "").trim() : "";
    if (!t && !paren) return null;
    var keys = [];
    if (paren) keys.push(paren);
    if (t) {
      var snap = injectorScope ? injectorScope.getSnapshot() : null;
      var provs = snap && snap.value && snap.value.providers;
      if (provs && Object.prototype.hasOwnProperty.call(provs, t)) keys.push(t);
      else {
        var found = false;
        if (provs) {
          for (var k in provs) {
            if (provs[k] && provs[k].displayName === t) { keys.push(k); found = true; break; }
          }
        }
        if (!found) keys.push(t.toLowerCase());
      }
    }
    return keys;
  }
  function injectorEnableScan() {
    if (!injectorScope || typeof document === "undefined" || !document.body) return;
    var rows = document.querySelectorAll('[class*="rowCard"]');
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var actions = row.querySelector('[class*="rowActions"]');
      if (!actions || actions.querySelector("[" + ENABLE_MARK + "]")) continue;
      var editBtn = actions.querySelector('button[aria-label^="编辑"]');
      if (!editBtn) continue;
      var keys = enableRouteOf(row, editBtn);
      if (!keys) continue;
      var wrap = document.createElement("label");
      wrap.setAttribute(ENABLE_MARK, "");
      wrap.style.cssText = "display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer;user-select:none";
      var box = document.createElement("input");
      box.type = "checkbox";
      box.checked = keys.some(function (k) { return isProviderEnabled(k); });
      wrap.appendChild(box);
      wrap.appendChild(document.createTextNode("启用"));
      box.addEventListener("change", (function (ks) {
        return function () {
          for (var j = 0; j < ks.length; j++) setProviderEnabled(ks[j], this.checked);
        };
      })(keys));
      actions.appendChild(wrap);
    }
  }

  // 编辑卡"自定义设置"是原生 <details class*=customized> 折叠块：收起时容量
  // 按钮根本不在 DOM，注入器锚点链（找容量按钮 → 找 root）直接断掉。所以
  // reconcile 必须在找 root 之前先把弹窗里所有收起的 customized details 顶开
  //（open=true 幂等；与容量同口径：用户手动收起也会被顶回，一直展开）。
  function injectorExpandCustomized() {
    if (typeof document === "undefined" || !document.body) return;
    var nodes = document.querySelectorAll('details[class*="customized"]');
    for (var i = 0; i < nodes.length; i++) {
      if (!nodes[i].open) nodes[i].open = true;
    }
  }

  // 局部扫描（只扫设置弹窗模型区块）：幂等，锚点缺失即停。
  // flushStaged 必须在 DOM gate 之前：行保存后编辑器关闭、容量按钮消失，
  // 但 staging 落盘不依赖 DOM，只依赖快照（行 id 已出现在配置里即可写）。
  // ── 设置弹窗闸门 ─────────────────────────────────────────────────
  // injector 的 observer 挂在 document.body 上（全局）：会话页每有一次结构变动
  // 也会排队一次 reconcile，而 reconcile 开头会做 4 次全文档查询才发现"没有设置页"
  //（实测 0.8~1.1ms/次，活跃时最多 8 次/秒，纯粹空转）。
  // 闸门策略：没见过弹窗就直接返回（零查询）；见过之后才去探测，弹窗消失即复位。
  var injectorDialogEl = null;
  var injectorSawDialog = false;
  function injectorDialogPresent() {
    if (injectorDialogEl !== null && injectorDialogEl.isConnected === true) return true;
    if (injectorSawDialog !== true) return false;
    injectorDialogEl = document.querySelector('[role="dialog"]');
    if (injectorDialogEl === null) injectorSawDialog = false;
    return injectorDialogEl !== null;
  }
  function injectorHasStaged() {
    for (var route in injectorStaged) {
      var bucket = injectorStaged[route];
      if (bucket && Object.keys(bucket).length > 0) return true;
    }
    return false;
  }
  function injectorReconcile() {
    if (!injectorScope) return;
    if (!injectorDialogPresent()) {
      // 关窗瞬间可能还有 staged 没落盘：补 flush 一次，之后不再扫描
      if (injectorHasStaged()) {
        try { injectorFlushStaged(); } catch (e) { /* 落盘失败留给下次 */ }
      }
      return;
    }
    injectorFlushStaged();
    injectorExpandCustomized();
    try { injectorEnableScan(); } catch (e) { /* 勾选注入失败不拖垮扫描 */ }
    var root = injectorFindRoot();
    if (!root) return;
    if (!root.querySelector(CAP_SELECTOR)) return;
    injectorFlushStaged();
    var buttons = root.querySelectorAll("button[aria-label]");
    for (var b = 0; b < buttons.length; b++) {
      var btn = buttons[b];
      var al = btn.getAttribute("aria-label") || "";
      var isCap = false;
      for (var j = 0; j < CAP_LABELS.length; j++) if (al.indexOf(CAP_LABELS[j]) === 0) { isCap = true; break; }
      if (!isCap) continue;
      var row = btn.closest('[class*="modelEntry"]');
      var card = btn.closest('[class*="editor"], [class*="rowCard"], [class*="addCard"]');
      if (!row || !card) continue;
      // 容量展开是纯 DOM 点击，不依赖 route，必须放在 route 解析之前：
      // 新建自定义提供方卡未保存、route 解析为空，若先查 route 会被整行
      // 跳过，容量按钮永远点不开（实测踩过）。
      var container = row.querySelector('[class*="modelAdvanced"]');
      // 容器不存在 = 容量收起：一律自动展开（点一次按钮），下一轮扫描
      //（MutationObserver 捕捉展开后的 DOM）再挂编辑器。用户手动收起也会
      // 被顶回展开（用户要求：一直展开，直观）。
      if (!container) {
        btn.click();
        continue;
      }
      // 取该行"模型 ID"输入框元素（实时匹配依赖它，值为空也不跳过）
      var idInput = null;
      var inputs = row.querySelectorAll("input[aria-label]");
      for (var ii = 0; ii < inputs.length; ii++) {
        var iali = inputs[ii].getAttribute("aria-label") || "";
        for (var jj = 0; jj < ID_LABELS.length; jj++) {
          if (iali.indexOf(ID_LABELS[jj]) === 0) { idInput = inputs[ii]; break; }
        }
        if (idInput) break;
      }
      if (!idInput) continue;
      var route = injectorRouteOf(card);
      if (!route) route = injectorPendingRouteOf(card);
      // 自动补「输入类型→图片」放在 route 门禁之前：新建提供方草稿没有 route
      // （Provider ID 还空着），被门禁挡掉就永远补不上（实测踩过）。
      injectorAutoImage(container, route, idInput);
      injectorAutoReasoning(container);
      if (!route) continue;
      // 未保存新行预置三档（幂等，flush 也会兜底跑）。
      var mid0 = String(idInput.value || "").trim();
      if (mid0) {
        var st0 = injectorStateOf(route, mid0);
        if (st0 && !st0.saved && !injectorStagedGet(route, mid0)) {
          injectorStagedSet(route, mid0, { reasoningEfforts: threeEfforts() });
        }
      }
      injectorMount(container, route, idInput);
    }
  }
  // 去抖调度：DOM 高频变动（展开动画/React 重渲染）合并成一次扫描，
  // 否则每次 mutation 全扫会把设置页卡死。
  var injectorScanTimer = null;
  function injectorSchedule() {
    if (injectorScanTimer) return;
    injectorScanTimer = setTimeout(function () {
      injectorScanTimer = null;
      try { injectorReconcile(); } catch (e) { /* 注入失败不拖垮页面 */ }
    }, 120);
  }
  function startInjector(sc) {
    if (injectorObserved || typeof MutationObserver === "undefined" || typeof document === "undefined" || !document.body) return;
    injectorObserved = true;
    injectorScope = sc;
    injectorSchedule();
    new MutationObserver(function (records) {
      // 只在"还没见过弹窗"时做这次探测：设置壳一出现就把开关打开，
      // 之后的 reconcile 才允许去查 DOM（见 injectorDialogPresent）。
      if (injectorSawDialog !== true) {
        for (var i = 0; i < records.length && injectorSawDialog !== true; i++) {
          var rec = records[i];
          if (rec.type !== "childList") continue;
          for (var j = 0; j < rec.addedNodes.length; j++) {
            var node = rec.addedNodes[j];
            if (node.nodeType !== 1) continue;
            if ((typeof node.getAttribute === "function" && node.getAttribute("role") === "dialog") ||
                (typeof node.querySelector === "function" && node.querySelector('[role="dialog"]') !== null)) {
              injectorSawDialog = true;
              break;
            }
          }
        }
      }
      injectorSchedule();
    }).observe(document.body, { childList: true, subtree: true });
    // 打字不产生 DOM 结构变动，MutationObserver 不触发；但新卡后填 Provider ID /
    // 模型 ID 需要重扫才能挂编辑器/预置 staging，所以监听 input 事件兜底。
    document.addEventListener("input", function () { injectorSchedule(); }, true);
    if (sc && typeof sc.subscribe === "function") {
      sc.subscribe(function () {
        injectorSchedule();
        autoConfigure(sc);
      });
    }
  }


  exports.apply = function apply(ctx) {
    ctx.effect(function () {
      return ctx.locale.register(NS, { zh: zh, en: en });
    }, "dsh-model-effort: dictionaries");
    var t = ctx.locale.bind(NS);
    // 模型胶囊面板的样式（portal 到 body，面板与滑块都不吃官方 CSS module 哈希）。
    ctx.effect(function () {
      var style = document.createElement("style");
      style.dataset.plugin = "dsh-model-effort";
      style.textContent = [
        // 影子菜单的子列表向左弹：胶囊贴屏幕右缘，Menu 原生向右展开会出屏。
        'div[role="menu"] div[role="menu"]{left:auto;right:calc(100% + 10px)}div[role="menu"] div[role="menu"]::before{left:auto;right:-10px}',
        // 条目分割线（提供商列表 + 模型子列表）：只在相邻两条 menuitem 之间，
        // 首条不加。作用域用 :has(.dsme_footer) 锁死在本插件这个菜单上，
        // 不影响官方其它菜单；子列表是 Menu 内嵌的 div[role=menu]，用后代选择器补一条。
        'div[role="menu"]:has(.dsme_footer) button[role="menuitem"]+button[role="menuitem"]{position:relative}',
        'div[role="menu"]:has(.dsme_footer) button[role="menuitem"]+button[role="menuitem"]::before{content:"";position:absolute;left:10px;right:10px;top:0;height:1px;background:var(--dsw-alias-border-l1,rgba(128,128,128,.22));pointer-events:none}',
        // 提供商那一层实测每条 menuitem 外面还包了一层 div（_itemWrap_xxx），
        // 按钮不是相邻兄弟 → 上面的规则匹配不到。这里按"包着 menuitem 的容器"
        // 相邻关系补一条，不依赖哈希类名。
        'div[role="menu"]:has(.dsme_footer) *:has(> button[role="menuitem"])+*:has(> button[role="menuitem"]){position:relative}',
        'div[role="menu"]:has(.dsme_footer) *:has(> button[role="menuitem"])+*:has(> button[role="menuitem"])::before{content:"";position:absolute;left:10px;right:10px;top:0;height:1px;background:var(--dsw-alias-border-l1,rgba(128,128,128,.22));pointer-events:none}',
        'div[role="menu"] div[role="menu"] button[role="menuitem"]+button[role="menuitem"]{position:relative}',
        'div[role="menu"] div[role="menu"] button[role="menuitem"]+button[role="menuitem"]::before{content:"";position:absolute;left:10px;right:10px;top:0;height:1px;background:var(--dsw-alias-border-l1,rgba(128,128,128,.22));pointer-events:none}',
        // 选中标记：官方 Menu 画的是 SVG 勾，这里换成 ✅（用户要求）。
        // SVG 是替换元素，伪元素画不上去，所以藏掉 SVG、在按钮上加 ::after 顶到右侧。
        'div[role="menu"]:has(.dsme_footer) button[role="menuitem"] svg[data-icon="dsw-icon-check-outline-regular"]{display:none}',
        'div[role="menu"]:has(.dsme_footer) button[role="menuitem"]:has(svg[data-icon="dsw-icon-check-outline-regular"])::after{content:"✅";font-size:12px;line-height:16px;margin-left:auto;flex:none}',
        // 菜单底部「当前模型 + 档位滑块」——挂在官方 Menu 的 children 里，材质/圆角由官方管。
        ".dsme_footer{padding:0 2px 4px;min-width:216px}",
        ".dsme_div{height:1px;background:var(--dsw-alias-border-l1,rgba(128,128,128,.25));margin:4px 6px 6px}",
        ".dsme_cur{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:2px 8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,inherit)}",
        ".dsme_curName{color:var(--dsw-alias-label-primary,inherit);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}",
        ".dsme_effhead{display:flex;align-items:center;justify-content:space-between;padding:2px 8px 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,inherit)}",
        ".dsme_slider{position:relative;height:38px;margin:2px 8px 4px;cursor:pointer;touch-action:none;outline:none}",
        ".dsme_slider:focus-visible{box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));border-radius:10px}",
        ".dsme_track{position:absolute;left:0;right:0;top:50%;height:16px;margin-top:-8px;border-radius:8px;background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.22));overflow:hidden}",
        ".dsme_fill{position:absolute;left:0;top:0;bottom:0;border-radius:8px;overflow:hidden;transition:width .12s ease}",
        ".dsme_stops{position:absolute;left:7px;right:7px;top:50%;height:0;pointer-events:none}",
        ".dsme_dot{position:absolute;top:-2.5px;width:5px;height:5px;margin-left:-2.5px;border-radius:50%;background:rgba(255,255,255,.65)}",
        ".dsme_knob{position:absolute;top:50%;width:22px;height:22px;margin-left:-11px;margin-top:-11px;border-radius:50%;background:#fff;border:3px solid transparent;box-sizing:border-box}",
        // 满档星云 + 星尘：静态紫蓝渐变底 + 错峰粒子，不加扫光/位移（用户要求
        // 只留静态渐变 + 粒子）。渐变也不能靠 background-position 循环——
        // 220% 平铺会在接缝处出现硬边（实测过，用户看到的那条"分割线"就是它）。
        ".dsme_fx{position:absolute;inset:0;border-radius:8px;overflow:hidden;pointer-events:none}",
        ".dsme_nebula{position:absolute;inset:0;background:linear-gradient(90deg,#3b82f6 0%,#7c5cff 48%,#a855f7 100%)}",
        ".dsme_p{position:absolute;width:2px;height:2px;margin-left:-1px;margin-top:-1px;border-radius:50%;background:radial-gradient(circle,#fff 0%,#fff 40%,rgba(255,255,255,0) 75%);animation-name:dsmeTwinkle;animation-iteration-count:infinite;animation-timing-function:ease-in-out}",
        "@keyframes dsmeTwinkle{0%,100%{opacity:.15;transform:scale(.75)}50%{opacity:1;transform:scale(1.15)}}",
        // 满档文字：紫蓝相间（静态渐变裁字，不做位移动画——平铺循环同样会出硬边）。
        ".dsme_grad{background:linear-gradient(90deg,#3b82f6 0%,#a855f7 55%,#3b82f6 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent!important}"
      ].join("");
      document.head.appendChild(style);
      return function () { style.remove(); };
    }, "dsh-model-effort: pill + slider css");

    // 档位记忆表启动加载（选模型时读，加载完成前 onPick 等待）。
    loadEffortMemory();
    loadProviderEnabled();
    // 设置绑定服务：dsh 0.1.7 起由 settingsScope 改名 configForms，且按 Host 条目 id
    // 取表单（旧内核写法是 settingsScope.bind({ namespace })）。两个名字都懒注入、
    // 谁先可用用谁；拿不到就不注入设置页行，不影响其余功能，所以不写进 exports.inject
    // （声明了会让新版内核下整个 client 插件永远 pending）。
    var scope = null;
    function useSettingsScope(next) {
      if (scope !== null) return;
      scope = next;
      // 设置页模型行注入器（DOM 旁路，容量展开区内嵌模态/思考编辑）。
      startInjector(scope);
    }
    ctx.inject(["configForms"], function (sctx) {
      useSettingsScope(sctx.configForms.get(PROVIDER_NS));
    });
    ctx.inject(["settingsScope"], function (sctx) {
      useSettingsScope(sctx.settingsScope.bind({ namespace: PROVIDER_NS }));
    });


    // 模型胶囊（session 作用域）：输入框只留这一枚，档位并入它的面板。
    // 独立的思考胶囊（conversation.input.right）已按用户要求删除。
    ctx.inject(["slots", "modelDirectories"], function (mctx) {
      var models = mctx.modelDirectories;
      // 模型选择器影子注册（priority -1 遮蔽官方 seat，接管成「模型 + 档位」胶囊）。
      ctx.slots.inject("conversation.input.model", function () {
        return ctx.slots.register({
          name: "conversation.input.model",
          id: "ziyong-model-seat",
          priority: -1,
          inject: function (sessionId) {
            var directory = models.directoryFor(sessionId);
            var available = mctx.sessions.subagentAddress(sessionId) === void 0;
            return {
              available: available,
              directory: directory.store,
              load: function () { directory.load().catch(function () {}); },
              select: function (selection) { return directory.select(selection).then(function () { return true; }, function () { return false; }); }
            };
          }
        }, ModelSeat);
      });
    });
  };

  // remote/remote.session：ModelDirectory 内部需要（cordis 严格注入，未声明
  // 会在 directoryFor 时抛 "cannot get property remote.session without inject"）。
  // sessions：影子模型选择器用 subagentAddress 判断可用性。
  // inject 需含 remote/remote.session（ModelDirectory 内部严格校验调用方 fiber），
  // 少声明会报 "cannot get property remote.session without inject"。
  // settingsScope/configForms：懒注入（见 apply 内注释），不写进声明——新版内核没有
  // settingsScope，声明会让整个 client 插件永远 pending。
  exports.inject = ["slots", "locale", "modelDirectories", "remote", "remote.session", "sessions"];
  return module.exports;
}});

