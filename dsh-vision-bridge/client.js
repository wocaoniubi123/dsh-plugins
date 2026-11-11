// dsh-vision-bridge · client 侧：设置区「视觉桥」（识图 API 配置）。单文件 bundle。
window.__ModuleLoader__.load({ id: "dsh-vision-bridge", factory: (require) => {
  var module = { exports: {} };
  var exports = module.exports;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

  var React = require("react");
  var react_jsx_runtime = require("react/jsx-runtime");

  var NS = "dsh-vision-bridge";

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

  var zh = {
    nav: "视觉桥",
    vbTitle: "视觉桥配置（识图 API）",
    vbDesc: "纯文本模型发图时，图片先经此视觉模型识别成文本再发给主模型；主模型支持视觉（静态名单判定）则直发不处理。",
    vbEnabled: "启用",
    vbBaseURL: "API 地址",
    vbApiKey: "API Key",
    vbModel: "视觉模型",
    vbSave: "保存",
    vbSaved: "已保存 ✓",
    vbSaving: "保存中…",
    vbTest: "测试连接",
    vbTesting: "测试中…",
    vbTestOk: "✓ 连接正常（{ms}ms）",
    vbTestFailed: "✗ 连接失败: ",
    vbTestUnknown: "未知错误",
    vbLoadFailed: "读取失败: ",
    vbSaveFailed: "保存失败: "
  };
  var en = {
    nav: "Vision bridge",
    vbTitle: "Vision bridge (image-to-text API)",
    vbDesc: "When the main model is text-only, images are recognized by this vision model first and sent as text; models declared as vision-capable pass images through.",
    vbEnabled: "Enabled",
    vbBaseURL: "API base URL",
    vbApiKey: "API key",
    vbModel: "Vision model",
    vbSave: "Save",
    vbSaved: "Saved ✓",
    vbSaving: "Saving…",
    vbTest: "Test connection",
    vbTesting: "Testing…",
    vbTestOk: "✓ Connected ({ms}ms)",
    vbTestFailed: "✗ Connection failed: ",
    vbTestUnknown: "unknown error",
    vbLoadFailed: "Load failed: ",
    vbSaveFailed: "Save failed: "
  };

  // ── 设置区「视觉桥」────────────────────────────────────────
  // 走官方 settings.section 槽位（id: vision-bridge，order 110 → 排在「对话头像」(120) 之上），
  // 与「通用设置/模型」同级：导航高亮与内容切换由官方设置壳管理，不再往插件配置列表塞卡片。
  // 配置读写仍走 host 的 visionBridge RPC（落盘插件目录 config.json）。
  function installVisionBridgeStyles() {
    if (typeof document === "undefined") return;
    if (document.querySelector("style[data-plugin-css=" + JSON.stringify("dsh-model-vision/vision-bridge.css") + "]") !== null) return;
    var tag = document.createElement("style");
    tag.dataset.plugin = "dsh-model-vision";
    tag.dataset.pluginCss = "dsh-model-vision/vision-bridge.css";
    tag.textContent = ".dvm_vbTitle{margin:0 0 12px;font-size:20px;font-weight:650;letter-spacing:-.2px}" +
      ".dvm_vbDesc{margin:0 0 20px;max-width:46em;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}" +
      ".dvm_vbRow{display:flex;align-items:center;gap:10px;margin-bottom:10px}" +
      ".dvm_vbLabel{flex:0 0 72px;font-size:12px;color:var(--dsw-alias-label-secondary)}" +
      ".dvm_vbInput{flex:1 1 auto;min-width:0;max-width:420px;padding:5px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-input-bg, transparent);color:var(--dsw-alias-label-primary);font-size:13px;font-family:inherit}" +
      ".dvm_vbCheck{width:16px;height:16px;accent-color:var(--dsw-alias-state-info-primary,#3182ce);cursor:pointer}" +
      ".dvm_vbBar{display:flex;align-items:center;gap:10px;margin-top:12px}" +
      ".dvm_vbSave{padding:5px 18px;border:none;border-radius:8px;background:var(--dsw-alias-interactive-bg, #3a6ef0);color:#fff;font-size:13px;cursor:pointer}" +
      ".dvm_vbTest{padding:5px 18px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;cursor:pointer}" +
      ".dvm_vbTest:disabled,.dvm_vbSave:disabled{opacity:.6;cursor:default}" +
      ".dvm_vbStatus{font-size:12px;color:var(--dsw-alias-label-tertiary)}";
    document.head.appendChild(tag);
  }
  var VB_FIELDS = [
    { key: "enabled", label: "vbEnabled", type: "checkbox" },
    { key: "baseURL", label: "vbBaseURL", type: "text", placeholder: "https://api.siliconflow.cn/v1" },
    { key: "apiKey", label: "vbApiKey", type: "password" },
    { key: "visionModel", label: "vbModel", type: "text", placeholder: "Qwen/Qwen3.5-4B" }
  ];
  /** 设置区「视觉桥」：启用 / API 地址 / API Key / 视觉模型（同旧插件卡片面板，改成正规设置区）。 */
  function VisionBridgeSection(props) {
    var t = props.t;
    var configPair = React.useState(null);
    var config = configPair[0];
    var setConfig = configPair[1];
    var statusPair = React.useState("");
    var status = statusPair[0];
    var setStatus = statusPair[1];
    var busyPair = React.useState(false);
    var busy = busyPair[0];
    var setBusy = busyPair[1];
    React.useEffect(function () {
      installVisionBridgeStyles();
      wireCall("visionBridge", "getConfig", {}).then(function (cfg) {
        setConfig(cfg || {});
      }, function (e) {
        setStatus(t("vbLoadFailed") + String((e && e.message) || e));
      });
    }, []);
    if (config === null) {
      return h("div", { className: "dvm_vbStatus" }, t("vbTitle") + "…");
    }
    var change = function (key) {
      return function (ev) {
        var next = Object.assign({}, config);
        next[key] = ev.target.type === "checkbox" ? ev.target.checked : ev.target.value;
        setConfig(next);
      };
    };
    var rows = VB_FIELDS.map(function (def) {
      var input = h("input", {
        type: def.type,
        className: def.type === "checkbox" ? "dvm_vbCheck" : "dvm_vbInput",
        checked: def.type === "checkbox" ? config.enabled !== false : void 0,
        value: def.type === "checkbox" ? void 0 : String(config[def.key] || ""),
        placeholder: def.placeholder,
        disabled: busy,
        onChange: change(def.key)
      });
      return h("div", { className: "dvm_vbRow" }, h("span", { className: "dvm_vbLabel" }, t(def.label)), input);
    });
    var save = function () {
      setBusy(true);
      setStatus(t("vbSaving"));
      wireCall("visionBridge", "updateConfig", { patch: {
        enabled: config.enabled !== false,
        baseURL: String(config.baseURL || "").trim(),
        apiKey: String(config.apiKey || "").trim(),
        visionModel: String(config.visionModel || "").trim()
      } }).then(function () {
        setStatus(t("vbSaved"));
        setBusy(false);
      }, function (e) {
        setStatus(t("vbSaveFailed") + String((e && e.message) || e));
        setBusy(false);
      });
    };
    // 测试连接：用表单当前值（含未保存）发一张 16x16 小图走完整识图链路
    var test = function () {
      setBusy(true);
      setStatus(t("vbTesting"));
      wireCall("visionBridge", "testConnection", { patch: {
        baseURL: String(config.baseURL || "").trim(),
        apiKey: String(config.apiKey || "").trim(),
        visionModel: String(config.visionModel || "").trim()
      } }).then(function (r) {
        if (r && r.ok === true) setStatus(t("vbTestOk", { ms: r.latencyMs }));
        else setStatus(t("vbTestFailed") + String((r && r.error) || t("vbTestUnknown")));
        setBusy(false);
      }, function (e) {
        setStatus(t("vbTestFailed") + String((e && e.message) || e));
        setBusy(false);
      });
    };
    return h(React.Fragment, null,
      h("h2", { className: "dvm_vbTitle" }, t("vbTitle")),
      h("p", { className: "dvm_vbDesc" }, t("vbDesc")),
      rows,
      h("div", { className: "dvm_vbBar" },
        h("button", { type: "button", className: "dvm_vbSave", disabled: busy, onClick: save }, t("vbSave")),
        h("button", { type: "button", className: "dvm_vbTest", disabled: busy, onClick: test }, t("vbTest")),
        h("span", { className: "dvm_vbStatus" }, status)
      )
    );
  }
  var vbIconObserved = false;
  /**
  * 导航图标：官方设置壳按 section id 硬编码图标（未映射的 id 给齿轮），只把我们
  * 「视觉桥」那一行换成图像图标（原位改 svg 内容，幂等，只动自己那行）。
  */
  function patchVisionBridgeNavIcon() {
    try {
      if (typeof document === "undefined") return;
      var dialog = document.querySelector('[role="dialog"]');
      if (dialog === null) return;
      if (dialog.querySelector("svg[data-dvm-vb-nav-icon]") !== null) return;
      var nav = dialog.querySelector("nav");
      if (nav === null) return;
      var cells = nav.querySelectorAll("button");
      for (var i = 0; i < cells.length; i++) {
        var label = (cells[i].textContent || "").trim();
        if (label !== "视觉桥" && label !== "Vision bridge") continue;
        var icon = cells[i].querySelector("svg");
        if (icon === null) return;
        icon.setAttribute("data-dvm-vb-nav-icon", "");
        icon.setAttribute("stroke-width", "1.3");
        while (icon.firstChild) icon.removeChild(icon.firstChild);
        var ns = "http://www.w3.org/2000/svg";
        var frame = document.createElementNS(ns, "rect");
        frame.setAttribute("x", "1.75");
        frame.setAttribute("y", "2.75");
        frame.setAttribute("width", "12.5");
        frame.setAttribute("height", "10.5");
        frame.setAttribute("rx", "2");
        frame.setAttribute("stroke", "currentColor");
        frame.setAttribute("fill", "none");
        var hill = document.createElementNS(ns, "path");
        hill.setAttribute("d", "M2.6 11.4l3.1-3.1 2.3 2.3 1.9-1.9 3.5 3.5");
        hill.setAttribute("stroke", "currentColor");
        hill.setAttribute("fill", "none");
        hill.setAttribute("stroke-linejoin", "round");
        var dot = document.createElementNS(ns, "circle");
        dot.setAttribute("cx", "10.7");
        dot.setAttribute("cy", "5.9");
        dot.setAttribute("r", "1.05");
        dot.setAttribute("fill", "currentColor");
        icon.appendChild(frame);
        icon.appendChild(hill);
        icon.appendChild(dot);
        return;
      }
    } catch (e) { /* 图标补丁失败不影响设置区 */ }
  }
  /** 注册「视觉桥」设置区 + 导航图标补丁（图标靠 MutationObserver 在弹窗打开时命中，幂等）。 */
  function registerVisionBridgeSection(ctx) {
    ctx.slots.inject("settings.section", function () {
      return ctx.slots.register({
        name: "settings.section",
        id: "vision-bridge",
        order: 110,
        label: function () { return ctx.locale.bind(NS)("nav"); },
        locale: NS,
        inject: function () { return { t: ctx.locale.bind(NS) }; }
      }, VisionBridgeSection);
    });
    if (typeof MutationObserver !== "undefined" && typeof document !== "undefined" && !vbIconObserved) {
      vbIconObserved = true;
      new MutationObserver(function () { patchVisionBridgeNavIcon(); }).observe(document.body, { childList: true, subtree: true });
      patchVisionBridgeNavIcon();
    }
  }


  exports.apply = function apply(ctx) {
    ctx.effect(function () {
      return ctx.locale.register(NS, { zh: zh, en: en });
    }, "dsh-vision-bridge: dictionaries");
    registerVisionBridgeSection(ctx);
  };
  // 严格注入：设置区需要 slots（注册槽位）与 locale（词条）
  exports.inject = ["slots", "locale"];
  return module.exports;
}});
