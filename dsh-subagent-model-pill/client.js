// dsh-subagent-model-pill · client 侧：子代理会话的模型胶囊。
//
// 背景（官方 2.0.19-next 实测）：
//   官方模型胶囊在 conversation.input.model（single 槽，官方独占），且组件里
//   硬编码 `if (!available) return null`，判定条件 sessions.subagentAddress(sessionId)
//   === undefined —— 子代理会话被寻址打开时直接不渲染。跟白名单开关无关。
//
// 本插件不抢官方槽位，改挂 conversation.input.right（list 槽，官方没占用），
// 只在「被寻址的子代理会话」里渲染一枚只读胶囊 + 可点开的选择菜单：
//   - 当前模型：读会话投影 modelSelection（next ?? lastUsed，来自 request/header）
//   - 可选项：取宿主 modelCatalog()，按 subagent-model-selection 白名单过滤
//   - 切换：调 session.selectModel —— 子代理会话会被 host 以 session/agent-busy
//     拒绝（origin === "subagent"），这是本插件要实测确认的边界，不是 UI 层能绕过的
window.__ModuleLoader__.load({ id: "dsh-subagent-model-pill", factory: (require) => {
  var module = { exports: {} };
  var exports = module.exports;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

  var React = require("react");
  var react_jsx_runtime = require("react/jsx-runtime");
  var _primitives = require("@deepseek-ai/dsh-client-ui-primitives");

  var NS = "dsh-subagent-model-pill";

  var zh = {
    pillTitle: "子代理模型",
    pillUnknown: "未知模型",
    loading: "读取模型…",
    noModels: "白名单里没有可用模型",
    catalogFailed: "模型目录读取失败",
    notAuthorized: "未在白名单内",
    selecting: "正在切换…",
    selectFailed: "切换失败：{reason}",
    current: "当前",
    teamFollow: "跟随主会话模型",
    teamUnified: "统一设置子代理模型",
    teamWorking: "正在应用…",
    teamDone: "已应用：成功 {ok} 个，失败 {fail} 个",
    teamNoChildren: "没有可设置的子代理",
    teamNoSession: "找不到当前会话",
    teamNoParentModel: "读不到主会话的模型",
    teamNoModel: "请先选择模型",
    teamFailed: "失败：{reason}"
  };
  var en = {
    pillTitle: "Subagent model",
    pillUnknown: "Unknown model",
    loading: "Reading model…",
    noModels: "No model in the allowlist",
    catalogFailed: "Model catalog unavailable",
    notAuthorized: "Not in the allowlist",
    selecting: "Switching…",
    selectFailed: "Switch failed: {reason}",
    current: "current",
    teamFollow: "Follow the lead's model",
    teamUnified: "Set all subagents to one model",
    teamWorking: "Applying…",
    teamDone: "Applied: {ok} ok, {fail} failed",
    teamNoChildren: "No subagents to configure",
    teamNoSession: "Current session not found",
    teamNoParentModel: "Could not read the lead session's model",
    teamNoModel: "Pick a model first",
    teamFailed: "Failed: {reason}"
  };

  // ── 样式（胶囊外观靠官方 Pill，这里只补少量间距与菜单样式）──
  var STYLE_ID = "dsh-subagent-model-pill-style";
  function installStyles() {
    if (typeof document === "undefined") return;
    if (document.getElementById(STYLE_ID) !== null) return;
    var tag = document.createElement("style");
    tag.id = STYLE_ID;
    tag.textContent =
      ".dsmp_wrap{display:inline-flex;align-items:center;gap:6px;position:relative}" +
      ".dsmp_pill{display:inline-flex;align-items:center;gap:4px;max-width:220px}" +
      ".dsmp_name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      // 背景优先用官方菜单材质变量（--dsw-menu-surface-fill），再退回语义层色。
      // 不能只给 #fff 兜底，深色主题下会变成白底白字。
      ".dsmp_menu{position:absolute;bottom:calc(100% + 6px);right:0;min-width:240px;max-height:320px;overflow:auto;" +
      "background:var(--dsw-menu-surface-fill,var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-primary,#fff)));" +
      "backdrop-filter:var(--dsw-menu-backdrop-filter,none);" +
      "border:1px solid var(--dsw-alias-border-l1,#e5e5e5);" +
      "border-radius:10px;box-shadow:var(--dsw-elevation-prominent,0 8px 24px rgba(0,0,0,.14));padding:4px;z-index:60;" +
      "color:var(--dsw-alias-label-primary,inherit)}" +
      ".dsmp_row{display:flex;flex-direction:column;gap:1px;width:100%;text-align:left;border:0;" +
      "background:transparent;border-radius:8px;padding:6px 8px;cursor:pointer;font:inherit;color:inherit}" +
      ".dsmp_row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.15))}" +
      ".dsmp_row[disabled]{cursor:not-allowed;opacity:.55}" +
      ".dsmp_rowMain{display:flex;align-items:center;justify-content:space-between;gap:8px}" +
      ".dsmp_rowModel{font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".dsmp_rowProvider{font-size:11px;opacity:.6}" +
      ".dsmp_mark{font-size:11px;opacity:.75}" +
      ".dsmp_msg{padding:6px 8px;font-size:12px;opacity:.8}" +
      ".dsmp_msg_err{color:var(--dsw-alias-state-error-primary,#d33)}";
    document.head.appendChild(tag);
  }

  // ── 白名单：读宿主 subagent-model-selection-settings 设置 ──
  // 命名空间必须与官方 dsh-client-ui-settings-subagent 的 SUBAGENT_MODEL_SELECTION_NS
  // 完全一致（带 -settings 后缀）；configForms 须在 inject 里声明后才能经 ctx.configForms 访问。
  // 拿不到时返回 null = 不过滤（宁多勿少，不因读设置失败而藏掉所有模型）。
  var ALLOWLIST_NS = "subagent-model-selection-settings";
  function allowedRouteKeys(ctx) {
    try {
      var forms = ctx.configForms;
      if (forms === void 0 || forms === null || typeof forms.get !== "function") return null;
      var scope = forms.get(ALLOWLIST_NS);
      if (scope === void 0 || scope === null || typeof scope.getSnapshot !== "function") return null;
      var snapshot = scope.getSnapshot();
      var value = snapshot !== null && snapshot !== void 0 ? snapshot.value : void 0;
      if (value === void 0 || value === null) return null;
      if (value.enabled !== true) return new Set();
      var list = Array.isArray(value.allowedModels) ? value.allowedModels : [];
      var keys = new Set();
      list.forEach(function (route) {
        if (route === null || route === void 0) return;
        if (typeof route.provider !== "string" || typeof route.model !== "string") return;
        keys.add(route.provider + "\u0000" + route.model);
      });
      return keys;
    } catch (error) {
      if (typeof console !== "undefined") console.warn("dsh-subagent-model-pill: read allowlist failed:", error);
      return null;
    }
  }

  // ── 模型目录（宿主全局，不需 sessionId）──
  function readCatalog(remoteSession) {
    if (remoteSession === void 0 || typeof remoteSession.modelCatalog !== "function") {
      return Promise.resolve(null);
    }
    return Promise.resolve(remoteSession.modelCatalog()).then(function (result) {
      if (result === void 0 || result.ok !== true) return null;
      var groups = result.value !== void 0 && Array.isArray(result.value.groups) ? result.value.groups : [];
      var out = [];
      groups.forEach(function (group) {
        var models = group !== null && group !== void 0 && Array.isArray(group.models) ? group.models : [];
        models.forEach(function (model) {
          if (model === null || model === void 0 || typeof model.id !== "string") return;
          out.push({
            provider: typeof group.id === "string" ? group.id : (typeof group.provider === "string" ? group.provider : ""),
            providerName: typeof group.name === "string" ? group.name : (typeof group.id === "string" ? group.id : ""),
            model: model.id,
            modelName: typeof model.name === "string" ? model.name : model.id,
            efforts: model.reasoning !== void 0 && Array.isArray(model.reasoning.efforts)
              ? model.reasoning.efforts.map(function (e) { return typeof e === "string" ? e : (e !== null && e !== void 0 && typeof e.id === "string" ? e.id : null); }).filter(function (e) { return e !== null; })
              : []
          });
        });
      });
      return out;
    }, function () { return null; });
  }

  // ── 胶囊组件 ──
  // host sessionTools 同名式 RPC 通道（与 dsh-session-tools 一致）
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
    }).then(function (r) {
      return r.json();
    }).then(function (full) {
      if (full && full.result && full.result.ok) return full.result.value;
      throw new Error(full && full.result && full.result.error ? full.result.error.message : "rpc failed");
    });
  }

  function SubagentModelPill(props) {
    var t = props.t;
    var sessionId = props.sessionId;
    var useSessions = props.useSessions;

    var closedPair = React.useState(true);
    var closed = closedPair[0];
    var setClosed = closedPair[1];
    var catalogPair = React.useState(null);
    var catalog = catalogPair[0];
    var setCatalog = catalogPair[1];
    var noticePair = React.useState(null);
    var notice = noticePair[0];
    var setNotice = noticePair[1];
    var busyPair = React.useState(false);
    var busy = busyPair[0];
    var setBusy = busyPair[1];
    var rootRef = React.useRef(null);

    React.useEffect(function () { installStyles(); }, []);


    // 只在子代理会话里出现（官方 SubagentCatalogAction 用同一条判定）
    var isSubagent = useSessions(function (state) {
      var byId = state.byId;
      var summary = byId === void 0 || byId === null ? void 0 : byId[sessionId];
      return summary !== void 0 && summary !== null && summary.origin === "subagent";
    });

    // 当前模型：会话投影 modelSelection（官方同一份数据源）
    // 结构：projectionsBySession[sessionId].values.modelSelection = { lastUsed, next }
    var projected = useSessions(function (state) {
      var bySession = state.projectionsBySession;
      var snapshot = bySession === void 0 || bySession === null ? void 0 : bySession[sessionId];
      if (snapshot === void 0 || snapshot === null) return null;
      var values = snapshot.values;
      var model = values === void 0 || values === null ? void 0 : values.modelSelection;
      if (model === void 0 || model === null) return null;
      return model.next !== void 0 && model.next !== null ? model.next : model.lastUsed;
    });
    // 本地已提交的选择：切换成功后立刻显示，不等投影回流。
    // 投影追上（lastUsed/next 变成同一个模型）后清掉，避免长期遮蔽真实状态。
    var localPair = React.useState(null);
    var localSelection = localPair[0];
    var setLocalSelection = localPair[1];
    React.useEffect(function () {
      if (localSelection === null) return;
      if (projected !== null && projected !== void 0 &&
          projected.provider === localSelection.provider &&
          projected.model === localSelection.model) {
        setLocalSelection(null);
      }
    }, [projected, localSelection]);
    var selection = localSelection !== null && localSelection !== void 0 ? localSelection : projected;

    // 目录只读一次（打开菜单时按就绪情况懒加载）
    React.useEffect(function () {
      if (closed || catalog !== null) return;
      var remote = props.remoteSession;
      readCatalog(remote).then(function (list) {
        setCatalog(list === null ? [] : list);
      });
    }, [closed, catalog]);

    // 关闭菜单：点外面或 Esc
    React.useEffect(function () {
      if (closed || typeof document === "undefined") return function () {};
      var onDown = function (event) {
        var root = rootRef.current;
        if (root !== null && root !== void 0 && typeof root.contains === "function" && root.contains(event.target)) return;
        setClosed(true);
      };
      var onKey = function (event) { if (event.key === "Escape") setClosed(true); };
      document.addEventListener("pointerdown", onDown, true);
      document.addEventListener("keydown", onKey, true);
      return function () {
        document.removeEventListener("pointerdown", onDown, true);
        document.removeEventListener("keydown", onKey, true);
      };
    }, [closed]);

    // 非子代理会话不渲染：官方胶囊已在那些会话里工作，这里不重复
    if (!isSubagent) return null;

    var currentName = selection !== null && selection !== void 0 && typeof selection.model === "string"
      ? selection.model
      : t("pillUnknown");

    var allowlist = allowedRouteKeys(props.ctx);
    var visible = catalog === null ? [] : catalog.filter(function (item) {
      return allowlist === null || allowlist.has(item.provider + "\u0000" + item.model);
    });

    var choose = function (item) {
      if (busy) return;
      setBusy(true);
      setNotice(null);
      // 档位固定在 host 侧用 max，这里只传模型。
      // RPC 描述符只有一个 request 参数，必须包一层，否则网关报 args 不匹配。
      var payload = { request: { sessionId: sessionId, provider: item.provider, model: item.model } };
      if (typeof console !== "undefined") console.log("dsh-subagent-model-pill: calling RPC", payload);
      // host RPC：走 selectForNextRequest 改写该子代理下一次请求的路由
      wireCall("subagentModelPill", "selectChildModel", payload).then(function (result) {
        setBusy(false);
        // 立刻把选择反映到胶囊上，不等投影回流
        var applied = result !== void 0 && result.selected !== void 0 ? result.selected : { provider: item.provider, model: item.model };
        setLocalSelection(applied);
        // 成功不弹任何文字：胶囊自己就是反馈，菜单里会标「当前」
        setNotice(null);
        setClosed(true);
        if (typeof console !== "undefined") console.log("dsh-subagent-model-pill: RPC ok", result);
      }, function (reason) {
        var detail = reason !== void 0 && reason.message !== void 0 ? reason.message : String(reason);
        setBusy(false);
        setNotice({ text: t("selectFailed", { reason: detail }), error: true });
        if (typeof console !== "undefined") console.error("dsh-subagent-model-pill: RPC failed", detail, reason);
      });
    };

    var rows = [];
    if (catalog === null) {
      rows.push((0, react_jsx_runtime.jsx)("div", { className: "dsmp_msg", children: t("loading") }, "loading"));
    } else {
      if (visible.length === 0) {
        rows.push((0, react_jsx_runtime.jsx)("div", { className: "dsmp_msg", children: catalog.length === 0 ? t("catalogFailed") : t("noModels") }, "empty"));
      }
      visible.forEach(function (item, index) {
        var isCurrent = selection !== null && selection !== void 0 && selection.provider === item.provider && selection.model === item.model;
        rows.push(
          (0, react_jsx_runtime.jsx)("button", {
            type: "button",
            className: "dsmp_row",
            disabled: busy,
            onClick: function () { choose(item); },
            children: (0, react_jsx_runtime.jsxs)("div", { className: "dsmp_rowMain", children: [
              (0, react_jsx_runtime.jsxs)("div", { children: [
                (0, react_jsx_runtime.jsx)("div", { className: "dsmp_rowModel", children: item.modelName }),
                (0, react_jsx_runtime.jsx)("div", { className: "dsmp_rowProvider", children: item.providerName })
              ] }),
              isCurrent ? (0, react_jsx_runtime.jsx)("span", { className: "dsmp_mark", children: t("current") }) : null
            ] })
          }, item.provider + "/" + item.model)
        );
      });
    }
    if (notice !== null) {
      rows.push((0, react_jsx_runtime.jsx)("div", {
        className: "dsmp_msg" + (notice.error ? " dsmp_msg_err" : ""),
        children: notice.text
      }, "notice"));
    }

    var ref = rootRef;
    return (0, react_jsx_runtime.jsxs)("div", { className: "dsmp_wrap", ref: ref, children: [
      (0, react_jsx_runtime.jsx)(_primitives.Pill, {
        active: !closed,
        title: t("pillTitle"),
        onClick: function () { setClosed(!closed); },
        children: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
          (0, react_jsx_runtime.jsx)("span", { className: "dsmp_name", children: currentName }),
          (0, react_jsx_runtime.jsx)(_primitives.IconChevronDownOutlineRegular, { size: 12 })
        ] })
      }),
      closed ? null : (0, react_jsx_runtime.jsx)("div", { className: "dsmp_menu", role: "menu", children: rows })
    ] });
  }

  // ── 智能体团队面板设置区 ──
  // 官方面板是纯 CSS Module 渲染、没有可挂载的 slot，这里用 MutationObserver
  // 监听面板出现，把设置区插入「成员」标题之前（幂等）。
  var TEAM_MARK = "data-dsmp-team";
  var TEAM_STYLE_ID = "dsh-subagent-model-pill-team-style";

  function installTeamStyles() {
    if (typeof document === "undefined") return;
    if (document.getElementById(TEAM_STYLE_ID) !== null) return;
    var tag = document.createElement("style");
    tag.id = TEAM_STYLE_ID;
    tag.textContent =
      "[data-dsmp-team]{margin:8px 4px 4px;padding:10px 12px;border:0.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));" +
      "background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.08));border-radius:9px;display:flex;flex-direction:column;gap:8px;" +
      "color:var(--dsw-alias-label-primary,inherit)}" +
      "[data-dsmp-team] .dsmp_tRow{display:flex;align-items:center;gap:7px;font-size:12px;cursor:pointer;user-select:none}" +
      "[data-dsmp-team] .dsmp_tRow input{width:14px;height:14px;margin:0;cursor:pointer;accent-color:var(--dsw-alias-state-business-primary,#3b82f6)}" +
      "[data-dsmp-team] .dsmp_tLabel{color:var(--dsw-alias-label-primary,inherit)}" +
      "[data-dsmp-team] .dsmp_tSelect{width:100%;font:inherit;font-size:12px;padding:4px 6px;border-radius:6px;" +
      "border:0.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));" +
      "background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.06));color:var(--dsw-alias-label-primary,inherit)}" +
      "[data-dsmp-team] .dsmp_tHint{font-size:11px;color:var(--dsw-alias-label-tertiary,rgba(128,128,128,.8));line-height:16px}" +
      "[data-dsmp-team] .dsmp_tErr{font-size:11px;color:var(--dsw-alias-state-error-primary,#e5484d);line-height:16px}";
    document.head.appendChild(tag);
  }

  function installTeamSettings(ctx) {
    if (typeof document === "undefined" || typeof MutationObserver === "undefined") return function () {};
    installTeamStyles();
    // 官方面板用 CSS Module，类名带构建期 hash 前缀（如 vhh34W_ / _5jjTcW_），
    // 每次 DSH 升级都会变。这里只按后缀匹配，不锁死前缀。
    var t = ctx.locale.bind(NS);

    // 「跟随」与「统一设置」互斥；统一设置用的模型存在本地
    var unified = { provider: "", model: "" };

    function currentSessionId() {
      // 1) 侧栏里标为 active 的会话行最可靠（就是用户当前打开的那个）
      var rows = document.querySelectorAll('[data-row-key^="session:"]');
      for (var i = 0; i < rows.length; i++) {
        var cls = String(rows[i].className || "");
        if (/active|Active|selected|Selected/.test(cls)) {
          return String(rows[i].getAttribute("data-row-key")).slice("session:".length);
        }
      }
      // 2) 退路：store 里记的当前会话
      try {
        var snapshot = ctx.sessions.list.getSnapshot();
        if (snapshot !== void 0 && typeof snapshot.activeSessionId === "string") return snapshot.activeSessionId;
        if (snapshot !== void 0 && typeof snapshot.currentSessionId === "string") return snapshot.currentSessionId;
      } catch (error) { /* ignore */ }
      return null;
    }

    // 从注入节点向上找所属的团队面板（不锁死 hash 前缀）
    // 要求面板里真的有成员卡片，避免把其他同后缀浮层当目标
    function panelOf(node) {
      var el = node.parentElement;
      while (el !== null && el !== void 0) {
        var cls = String(el.className || "");
        if (/(^|\s)[A-Za-z0-9]*_panel(\s|$)/.test(cls)) {
          if (el.querySelector("button[class]") !== null) return el;
        }
        el = el.parentElement;
      }
      return null;
    }

    function visibleModels() {
      var allow = allowedRouteKeys(ctx);
      var catalog = readCatalog(ctx.get("remote.session"));
      return catalog.then(function (list) {
        if (list === null) return [];
        return list.filter(function (item) {
          return allow === null || allow.has(item.provider + "\u0000" + item.model);
        });
      });
    }

    function runFollow(panel, node) {
      var parentId = currentSessionId();
      if (parentId === null) { setHint(node, t("teamNoSession"), true); return; }
      // 1) 从会话投影读 Lead 的模型
      var route = projectedRoute(parentId);
      if (route !== null) { applyToAll(panel, node, route.provider, route.model); return; }
      // 2) 退路：官方面板已经把 Lead 的模型渲染在成员卡片上，直接读那一行
      var domRoute = routeFromPanel(panel);
      if (domRoute !== null) { applyToAll(panel, node, domRoute.provider, domRoute.model); return; }
      // 3) 最后问 host
      setHint(node, t("teamWorking"), false);
      wireCall("subagentModelPill", "readRoute", { request: { sessionId: parentId } }).then(function (r) {
        if (r === void 0 || r === null || typeof r.model !== "string") { setHint(node, t("teamNoParentModel"), true); return; }
        applyToAll(panel, node, r.provider, r.model);
      }, function (reason) {
        setHint(node, t("teamFailed", { reason: String(reason && reason.message ? reason.message : reason) }), true);
      });
    }

    // 从官方成员卡片上读「· 模型: xxx」里的模型名，反查 provider
    function routeFromPanel(panel) {
      var cards = panel.querySelectorAll("button[class]");
      for (var i = 0; i < cards.length; i++) {
        var cls = String(cards[i].className || "");
        if (!/(^|\s)[A-Za-z0-9]*_member(\s|$)/.test(cls)) continue;
        var txt = String(cards[i].textContent || "");
        if (txt.indexOf("当前会话") < 0) continue;
        var m = txt.match(/模型[:：]\s*([A-Za-z0-9._\-]+)/);
        if (m === null) continue;
        var modelName = m[1];
        var catalogList = catalogCache !== null ? catalogCache : [];
        for (var j = 0; j < catalogList.length; j++) {
          if (catalogList[j].model === modelName || catalogList[j].modelName === modelName) {
            return { provider: catalogList[j].provider, model: catalogList[j].model };
          }
        }
      }
      return null;
    }

    // 缓存一份目录，供 routeFromPanel 反查 provider
    var catalogCache = null;

    // 从投影读某会话的当前模型：modelSelection.next ?? lastUsed
    function projectedRoute(sessionId) {
      try {
        var snap = ctx.sessions.list.getSnapshot();
        var bySession = snap !== void 0 && snap.projectionsBySession !== void 0 ? snap.projectionsBySession : null;
        if (bySession === null) return null;
        var entry = bySession[sessionId];
        if (entry === void 0 || entry === null || entry.values === void 0) return null;
        var ms = entry.values.modelSelection;
        if (ms === void 0 || ms === null) return null;
        var pick = ms.next !== void 0 && ms.next !== null ? ms.next : ms.lastUsed;
        if (pick === void 0 || pick === null || typeof pick.model !== "string") return null;
        return { provider: String(pick.provider), model: String(pick.model) };
      } catch (error) {
        return null;
      }
    }

    function applyToAll(panel, node, provider, model) {
      var ids = collectChildIds(panel);
      if (ids.length === 0) { setHint(node, t("teamNoChildren"), true); return; }
      setHint(node, t("teamWorking"), false);
      wireCall("subagentModelPill", "applyToChildren", {
        request: { parentSessionId: currentSessionId(), children: ids.map(function (id) { return { sessionId: id }; }), provider: provider, model: model }
      }).then(function (result) {
        var ok = result !== void 0 && result.ok !== void 0 ? result.ok : 0;
        var fail = result !== void 0 && result.fail !== void 0 ? result.fail : 0;
        setHint(node, t("teamDone", { ok: ok, fail: fail }), fail > 0);
      }, function (reason) {
        setHint(node, t("teamFailed", { reason: String(reason && reason.message ? reason.message : reason) }), true);
      });
    }

    function setHint(node, text, isError) {
      var hint = node.querySelector("[data-dsmp-hint]");
      if (hint === null) return;
      hint.textContent = text;
      hint.className = isError ? "dsmp_tErr" : "dsmp_tHint";
    }

    // 只收集面板上真实渲染的那些成员：
    // 官方 TeamMemberRow 的 props 里带 member.id，从 React fiber 上取，比匹配标题可靠。
    function collectChildIds(panel) {
      var ids = [];
      var target = panel !== undefined && panel !== null ? panel : document;
      // 用属性选择器遍历所有元素，再按「_member 结尾」筛，避免锁死 hash 前缀
      var all = target.querySelectorAll("button[class]");
      for (var i = 0; i < all.length; i++) {
        var card = all[i];
        var cls = String(card.className || "");
        // 精确到卡片：类名里必须有一个以 _member 结尾的片段（排除 memberName/memberText 等）
        if (!/(^|\s)[A-Za-z0-9]*_member(\s|$)/.test(cls)) continue;
        // Lead 自己：新版是 memberC，旧版是 memberCurrent
        if (/(^|\s)[A-Za-z0-9]*_memberC(urrent)?(\s|$)/.test(cls)) continue;
        if (cls.indexOf("memberCurrent") >= 0) continue;
        var id = memberIdOf(card);
        if (typeof id === "string" && id.length > 0 && ids.indexOf(id) === -1) ids.push(id);
      }
      return ids;
    }

    // 沿 React fiber 向上找携带 member.id 的 props
    function memberIdOf(el) {
      var key = null;
      var keys = Object.keys(el);
      for (var i = 0; i < keys.length; i++) {
        if (keys[i].indexOf("__reactFiber$") === 0) { key = keys[i]; break; }
      }
      if (key === null) return null;
      var f = el[key];
      var depth = 0;
      while (f !== null && f !== void 0 && depth < 40) {
        var props = f.memoizedProps;
        if (props !== null && props !== void 0 && props.member !== null && props.member !== void 0 && typeof props.member.id === "string") {
          return props.member.id;
        }
        f = f.return;
        depth++;
      }
      return null;
    }

    function buildNode() {
      var node = document.createElement("div");
      node.setAttribute(TEAM_MARK, "");
      node.innerHTML =
        '<label class="dsmp_tRow"><input type="checkbox" data-dsmp-follow><span class="dsmp_tLabel">' + escapeHtml(t("teamFollow")) + "</span></label>" +
        '<label class="dsmp_tRow"><input type="checkbox" data-dsmp-unified><span class="dsmp_tLabel">' + escapeHtml(t("teamUnified")) + "</span></label>" +
        '<select class="dsmp_tSelect" data-dsmp-model></select>' +
        '<div data-dsmp-hint class="dsmp_tHint"></div>';

      var follow = node.querySelector("[data-dsmp-follow]");
      var unifiedBox = node.querySelector("[data-dsmp-unified]");
      var select = node.querySelector("[data-dsmp-model]");
      var panel = panelOf(node);

      // 模型下拉：只列白名单
      visibleModels().then(function (models) {
        catalogCache = models;
        select.innerHTML = "";
        models.forEach(function (item) {
          var opt = document.createElement("option");
          opt.value = item.provider + "|" + item.model;
          opt.textContent = item.modelName;
          select.appendChild(opt);
        });
        if (models.length === 0) {
          var opt0 = document.createElement("option");
          opt0.value = "";
          opt0.textContent = t("noModels");
          select.appendChild(opt0);
        } else if (unified.model === "") {
          unified = { provider: models[0].provider, model: models[0].model };
        }
      });

      follow.addEventListener("change", function () {
        if (follow.checked) { unifiedBox.checked = false; }
        if (follow.checked) runFollow(panelOf(node) || panel, node);
      });
      unifiedBox.addEventListener("change", function () {
        if (unifiedBox.checked) { follow.checked = false; }
      });
      select.addEventListener("change", function () {
        var v = String(select.value || "");
        var parts = v.split("|");
        if (parts.length === 2) unified = { provider: parts[0], model: parts[1] };
      });
      // 「统一设置」勾上或换模型后立刻应用
      unifiedBox.addEventListener("click", function () {
        if (!unifiedBox.checked) return;
        if (unified.model === "") { setHint(node, t("teamNoModel"), true); return; }
        applyToAll(panelOf(node) || panel, node, unified.provider, unified.model);
      });
      select.addEventListener("click", function () {
        if (unifiedBox.checked && unified.model !== "") applyToAll(panelOf(node) || panel, node, unified.provider, unified.model);
      });
      return node;
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }

    // 找团队面板：只认「智能体团队」触发器的同 hash 前缀面板。
    // 不做通配兜底——[class*="_panel"] 会把插件市场、设置页等所有浮层都算进来。
    function findTeamPanels() {
      var trig = null;
      var btns = document.querySelectorAll("button");
      for (var i = 0; i < btns.length; i++) {
        var txt = String(btns[i].textContent || "");
        if (txt.indexOf("智能体团队") >= 0 || txt.indexOf("Agent Teams") >= 0) { trig = btns[i]; break; }
      }
      if (trig === null) return [];
      // 触发器必须处于展开态，否则面板没渲染
      if (trig.getAttribute("aria-expanded") !== "true") return [];
      var cls = String(trig.className || "");
      // 前缀可能带前导下划线（官方构建产物形如 _5jjTcW_trigger / vhh34W_trigger）。
      // 从 "xxx_trigger" 里取最后一个下划线之前的部分作为前缀。
      var m = cls.match(/([A-Za-z0-9_]+)_trigger(?:\s|$)/);
      if (m === null) return [];
      var raw = m[1];
      var cut = raw.lastIndexOf("_");
      var prefix = cut > 0 ? raw.slice(0, cut) : raw;
      var panels = document.querySelectorAll('[class*="' + prefix + '_panel"]');
      var found = [];
      for (var j = 0; j < panels.length; j++) {
        // 面板里必须有成员卡片才算团队面板
        if (panels[j].querySelector('[class*="' + prefix + '_member"]') !== null) found.push(panels[j]);
      }
      return found;
    }

    function scan() {
      var panels = findTeamPanels();
      // 先清掉错位的注入节点（早期版本通配兜底可能把它塞进插件市场等页面）
      var stray = document.querySelectorAll("[" + TEAM_MARK + "]");
      for (var s = 0; s < stray.length; s++) {
        var owned = false;
        for (var p = 0; p < panels.length; p++) {
          if (panels[p].contains(stray[s])) { owned = true; break; }
        }
        if (!owned) stray[s].remove();
      }
      for (var i = 0; i < panels.length; i++) {
        var panel = panels[i];
        if (panel.querySelector("[" + TEAM_MARK + "]") !== null) continue;
        var body = panel.querySelector('[class*="_body"]');
        if (body === null) continue;
        // 只认「有成员卡片」的面板，避免误注入其他同名结构
        if (body.querySelector("button[class]") === null) continue;
        var firstSection = body.querySelector("section");
        var node = buildNode();
        if (firstSection !== null && firstSection.parentNode === body) body.insertBefore(node, firstSection);
        else body.appendChild(node);
      }
    }

    scan();
    var observer = new MutationObserver(function () { scan(); });
    observer.observe(document.body, { childList: true, subtree: true });
    return function () { observer.disconnect(); };
  }

  // ── 槽位注册 ──
  function apply(ctx) {
    // configForms 必须作为 fiber 依赖声明，才能经 ctx.configForms 读到白名单（官方设置页同做法）
    ctx.inject(["slots", "locale", "sessions", "configForms"], function () {
      ctx.effect(function () {
        return ctx.locale.register(NS, { zh: zh, en: en });
      }, "dsh-subagent-model-pill: dictionaries");
      ctx.slots.inject("conversation.input.right", function () {
        return ctx.slots.register({
          name: "conversation.input.right",
          id: "dsh-subagent-model-pill",
          order: 10,
          locale: NS,
          // inject 收到 session 作用域的 sessionId（同官方 conversation.input.model 注册）
          inject: function (sessionId) {
            return {
              sessionId: sessionId,
              t: ctx.locale.bind(NS),
              ctx: ctx,
              remoteSession: ctx.get("remote.session")
            };
          }
        }, SubagentModelPill);
      });
      // 智能体团队面板：注入「跟随 / 统一设置」两个开关 + 白名单模型选择器
      ctx.effect(function () {
        return installTeamSettings(ctx);
      }, "dsh-subagent-model-pill: team settings");
    });
  }

  exports.apply = apply;
  exports.inject = ["slots", "locale", "sessions", "configForms"];
  return module.exports;
}});
