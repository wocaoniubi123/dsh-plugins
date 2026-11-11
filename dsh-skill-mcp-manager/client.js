// dsh-skill-mcp-manager · client 侧：侧栏面板入口（「插件」下面）+ 技能/MCP 管理页。
//
// 入口走官方 sidebar.panellist（order 1 → 排在「插件」order 0 之后），页面注册到 main
// 槽位（key 与 panellist 的 id 相同，点击按钮即切到该页）。页面两块分组框：技能 / MCP。
window.__ModuleLoader__.load({ id: "dsh-skill-mcp-manager", factory: (require) => {
  var module = { exports: {} };
  var exports = module.exports;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

  var React = require("react");
  var jsxRuntime = require("react/jsx-runtime");
  var _primitives = require("@deepseek-ai/dsh-client-ui-primitives");

  var NS = "skillMcpManager";
  var PANEL_ID = "skill-mcp";

  function h(tag, props) {
    var children = [];
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === void 0 || child === null || child === false) continue;
      if (Array.isArray(child)) children = children.concat(child);
      else children.push(child);
    }
    var merged = Object.assign({}, props ?? {});
    if (children.length > 0) merged.children = children.length === 1 ? children[0] : children;
    return React.createElement(tag, merged);
  }

  var zh = {
    panel: "技能/MCP",
    title: "技能 与 MCP",
    intro: "直接管理技能文件（SKILL.md）与 MCP 服务器。技能改动即时生效；MCP 改动写入 profile 的 cordis.patch.yml，官方 HMR 监听到就热加载生效（用不着重启）。",
    skills: "技能",
    mcp: "MCP 服务器",
    roots: "技能根",
    noSkills: "这个技能根下还没有技能",
    noMcp: "没有配置 MCP 服务器",
    loading: "读取中…",
    refresh: "刷新",
    newSkill: "新建技能",
    upload: "上传技能",
    uploadTitle: "上传技能",
    pick: "选择来源",
    pickFolder: "选择文件夹",
    pickFile: "选择 .md 文件",
    files: "文件",
    skipped: "跳过",
    uploading: "正在读取并写入…",
    uploadHint: "选技能文件夹（里面要有 SKILL.md，或只有一层子目录里有）或单个 .md 文件；写进所选技能根下的同名目录，相对路径原样保留。SKILL.md 缺 frontmatter 会自动补。单文件上限 4MB。",
    uploadEmpty: "还没选文件",
    uploadOk: "已上传 {count} 个文件到 {path}",
    uploadFilled: "（SKILL.md 缺 frontmatter，已自动补上）",
    addServer: "添加服务器",
    edit: "编辑",
    remove: "删除",
    removeAll: "全部删除",
    footerWriting: "正在写入…",
    footerTestFailed: "测试未通过，未写入；再点一次【仍然保存】才会写",
    confirm: "确定",
    save: "保存",
    import: "导入",
    cancel: "取消",
    close: "关闭",
    name: "名称",
    description: "描述",
    content: "SKILL.md 内容",
    serverName: "serverName",
    transport: "传输",
    command: "命令",
    args: "参数（每行一个）",
    env: "环境变量",
    envAdd: "添加变量",
    addItem: "再加一项",
    removeItem: "删除这一项",
    itemCount: "共 {n} 项",
    headers: "请求头（headers）",
    headerAdd: "添加请求头",
    cwd: "工作目录（cwd）",
    cwdPlaceholder: "留空 = 继承 DSH 工作目录",
    toolTimeout: "工具调用超时（ms）",
    toolTimeoutPlaceholder: "留空 = 用官方默认值",
    url: "URL",
    state: "状态",
    active: "运行中",
    inactive: "未激活",
    hotSaved: "已热加载生效（{path} 同步更新）",
    hotPending: "已写入 {path}，热加载中…",
    savedSkill: "已保存",
    createdSkill: "已创建：{path}",
    confirmDeleteSkill: "删除技能「{name}」？文件会被删除，不可恢复。",
    confirmDeleteServer: "从配置里移除 MCP 服务器「{name}」？（立即生效）",
    error: "出错：{detail}",
    mode: "添加方式",
    modeForm: "表单",
    modeJson: "JSON 粘贴",
    jsonContent: "MCP 配置 JSON",
    jsonHint: "支持 {\"mcpServers\":{…}}、{\"名字\":{…}}、单个 {\"serverName\":…} 或数组；可一次导入多个。带 url → streamable-http，带 command → stdio。同名服务器会被覆盖。",
    importedServers: "已导入 {count} 个服务器（同名覆盖），已热加载生效",
    test: "测试",
    testing: "正在连一次 MCP 握手（initialize → tools/list）…",
    testOk: "✓ {name}：连接成功，{count} 个工具",
    testFail: "✗ {name}：{detail}",
    testBlocked: "连接测试没过，没有写入。{detail}\n再点一次按钮仍要保存。",
    stillSave: "仍然保存"
  };
  var en = {
    panel: "Skills/MCP",
    title: "Skills & MCP",
    intro: "Manage skill files (SKILL.md) and MCP servers. Skill edits apply immediately; MCP edits are written to the profile's cordis.patch.yml and hot-loaded live by the official HMR watcher.",
    skills: "Skills",
    mcp: "MCP servers",
    roots: "Skill roots",
    noSkills: "No skills under this root yet",
    noMcp: "No MCP server configured",
    loading: "Loading…",
    refresh: "Refresh",
    newSkill: "New skill",
    upload: "Upload skill",
    uploadTitle: "Upload skill",
    pick: "Source",
    pickFolder: "Pick folder",
    pickFile: "Pick .md file",
    files: "Files",
    skipped: "skipped",
    uploading: "Reading and writing…",
    uploadHint: "Pick a skill folder (with SKILL.md at its root or one level down) or a single .md file; it is written into a same-named folder under the chosen skill root, relative paths preserved. Missing SKILL.md frontmatter is added automatically. Per-file limit 4MB.",
    uploadEmpty: "No file picked yet",
    uploadOk: "Uploaded {count} file(s) to {path}",
    uploadFilled: " (SKILL.md had no frontmatter — added)",
    addServer: "Add server",
    edit: "Edit",
    remove: "Delete",
    removeAll: "Delete all",
    footerWriting: "Saving…",
    footerTestFailed: "Test failed, nothing written; click again (Save anyway) to write",
    confirm: "OK",
    save: "Save",
    import: "Import",
    cancel: "Cancel",
    close: "Close",
    name: "Name",
    description: "Description",
    content: "SKILL.md content",
    serverName: "serverName",
    transport: "Transport",
    command: "Command",
    args: "Arguments (one per line)",
    env: "Environment",
    envAdd: "Add variable",
    addItem: "Add item",
    removeItem: "Delete this item",
    itemCount: "{n} item(s)",
    headers: "Headers",
    headerAdd: "Add header",
    cwd: "Working directory (cwd)",
    cwdPlaceholder: "empty = inherit DSH working directory",
    toolTimeout: "Tool call timeout (ms)",
    toolTimeoutPlaceholder: "empty = official default",
    url: "URL",
    state: "State",
    active: "Active",
    inactive: "Inactive",
    hotSaved: "Live now（{path} updated too）",
    hotPending: "Written to {path} — hot-loading…",
    savedSkill: "Saved",
    createdSkill: "Created: {path}",
    confirmDeleteSkill: "Delete skill \"{name}\"? The file is removed permanently.",
    confirmDeleteServer: "Remove MCP server \"{name}\" from the config? (takes effect immediately)",
    error: "Error: {detail}",
    mode: "Input",
    modeForm: "Form",
    modeJson: "Paste JSON",
    jsonContent: "MCP config JSON",
    jsonHint: "Accepts {\"mcpServers\":{…}}, a name→config map, a single {\"serverName\":…} object, or an array; multiple servers at once are fine. url → streamable-http, command → stdio. Same-name servers are overwritten.",
    importedServers: "Imported {count} server(s), same names overwritten — live now",
    test: "Test",
    testing: "Doing a real MCP handshake (initialize → tools/list)…",
    testOk: "✓ {name}: connected, {count} tool(s)",
    testFail: "✗ {name}: {detail}",
    testBlocked: "Connection test failed, nothing written. {detail}\nClick the button again to save anyway.",
    stillSave: "Save anyway"
  };

  // RPC 超时兜底：host 不回就报错，别让界面永远停在"忙"上（那就是假死）
  var RPC_TIMEOUT_MS = 45000;
  function wireCall(method, payload) {
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = controller === null ? null : setTimeout(function () { controller.abort(); }, RPC_TIMEOUT_MS);
    var stop = function () { if (timer !== null) clearTimeout(timer); };
    return fetch("/api/skillMcp/" + method, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller === null ? void 0 : controller.signal,
      body: JSON.stringify({
        type: "client-request",
        rpcId: String(Date.now()) + "-" + Math.random().toString(36).slice(2),
        method: "skillMcp/" + method,
        payload: { args: payload ?? {} }
      })
    }).then(function (r) { return r.json(); }).then(function (full) {
      stop();
      if (full && full.result && full.result.ok) return full.result.value;
      throw new Error(full && full.result && full.result.error ? full.result.error.message : "rpc failed");
    }, function (reason) {
      stop();
      throw new Error(reason !== null && reason !== void 0 && reason.name === "AbortError"
        ? "请求超时（" + Math.round(RPC_TIMEOUT_MS / 1000) + "s 没回应）"
        : String((reason && reason.message) || reason));
    });
  }

  function installStyles() {
    if (typeof document === "undefined") return;
    if (document.querySelector("style[data-plugin-css=" + JSON.stringify("dsh-skill-mcp-manager/page.css") + "]") !== null) return;
    var tag = document.createElement("style");
    tag.dataset.plugin = "dsh-skill-mcp-manager";
    tag.dataset.pluginCss = "dsh-skill-mcp-manager/page.css";
    tag.textContent = ".ssm_page{box-sizing:border-box;height:100%;overflow:auto;padding:24px 28px;color:var(--dsw-alias-label-primary)}" +
      ".ssm_title{margin:0 0 8px;font-size:20px;font-weight:650;letter-spacing:-.2px}" +
      ".ssm_intro{margin:0 0 18px;max-width:52em;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.6}" +
      ".ssm_grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px;align-items:start}" +
      "@media (max-width: 1100px){.ssm_grid{grid-template-columns:minmax(0,1fr)}}" +
      ".ssm_group{border:1px solid var(--dsw-alias-border-l2);border-radius:14px;margin-bottom:18px;overflow:hidden}" +
      ".ssm_groupHead{display:flex;align-items:center;gap:10px;padding:12px 16px;background:var(--dsw-alias-bg-layer-3);border-bottom:1px solid var(--dsw-alias-border-l2);flex-wrap:wrap;row-gap:8px}" +
      ".ssm_groupTitle{font-size:14px;font-weight:600;white-space:nowrap;flex:none}" +
      ".ssm_groupMeta{font-size:12px;color:var(--dsw-alias-label-tertiary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1 1 60px}" +
      ".ssm_btn{cursor:pointer;border:1px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-primary);border-radius:8px;padding:4px 12px;font:inherit;font-size:12px;flex:none}" +
      ".ssm_btn:hover{background:var(--dsw-alias-interactive-bg-hover)}" +
      ".ssm_btn:disabled{opacity:.5;cursor:default}" +
      ".ssm_btnDanger:hover{color:var(--dsw-alias-state-error-primary)}" +
      ".ssm_rows{display:flex;flex-direction:column}" +
      ".ssm_row{display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:.5px solid var(--dsw-alias-border-l2)}" +
      ".ssm_row:last-child{border-bottom:none}" +
      ".ssm_hint{margin:8px 0 0;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-tertiary)}" +
      ".ssm_pairs{display:flex;flex-direction:column;gap:6px}" +
      // 宽弹窗：官方 .dialog 是 min(380px,100%)，这里用更高的特异性盖掉
      // 弹窗封顶：超过屏幕就让内容区自己滚，不再无限往下长
      "div.ssm_wideModal{width:min(1120px,94vw);max-width:94vw;max-height:88vh;display:flex;flex-direction:column;position:relative;top:-28px}" +
      "div.ssm_wideModal .ssm_mcpBody{max-height:calc(88vh - 170px);overflow:auto;padding:0 6px 10px 0;min-height:0}" +
      ".ssm_mcpGrid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px;align-items:start}" +
      "@media (max-width:760px){.ssm_mcpGrid{grid-template-columns:minmax(0,1fr)}}" +
      ".ssm_mcpCol{display:flex;flex-direction:column;gap:10px;min-width:0}" +
      ".ssm_valueItems{display:flex;flex-wrap:wrap;gap:4px;align-items:center;flex:1 1 auto;min-width:0}" +
      ".ssm_valueItemWrap{display:inline-flex;align-items:center;gap:2px;flex:0 1 auto;max-width:100%;min-width:0}" +
      // 值框固定 320 宽（窄窗口自动缩），删这一项的 ✕ 在框右侧、红色
      ".ssm_valueItemWrap .ssm_valueItem{flex:0 1 320px;width:320px;max-width:100%;min-width:88px;font-family:ui-monospace,Consolas,monospace;font-size:12px}" +
      ".ssm_valueItemWrap .ssm_itemDel{flex:none;width:16px;height:16px;line-height:1;border:none;border-radius:4px;cursor:pointer;background:transparent;color:var(--dsw-alias-state-error-primary);font-size:10px;padding:0}" +
      ".ssm_valueItemWrap .ssm_itemDel:hover{background:var(--dsw-alias-interactive-bg-hover)}" +
      // 「＋ 再加一项 / 共 N 项 / 删除整行」独占一行，落在最后一条数据下方
      ".ssm_pairFoot{flex:0 0 100%;display:flex;align-items:center;gap:8px;margin-top:2px;min-width:0}" +
      ".ssm_itemAdd{flex:none;padding:2px 8px}" +
      ".ssm_itemCount{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}" +
      ".ssm_pairRow{display:flex;align-items:flex-start;gap:6px}" +
      // 变量名框统一长度
      ".ssm_pairRow .ssm_keyInput{flex:0 0 132px;width:132px;min-width:0}" +
      // headers 那种单值框也拉到 320
      ".ssm_pairRow .ssm_valInput{flex:0 1 320px;width:320px;min-width:0}" +
      ".ssm_pairRow .ssm_btn{flex:none;padding:4px 8px}" +
      ".ssm_rowDel{color:var(--dsw-alias-state-error-primary);border-color:transparent;padding:4px 6px}" +
      // 底部状态行：状态靠左、按钮靠右（与取消/保存同一行）
      ".ssm_footerRow{display:flex;flex:1 1 auto;align-items:center;gap:12px;width:100%;min-width:0}" +
      ".ssm_footerStatus{flex:1 1 auto;min-width:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".ssm_footerBtns{display:flex;flex:none;align-items:center;gap:8px;margin-left:auto}" +
      ".ssm_rowDel:hover{background:var(--dsw-alias-interactive-bg-hover)}" +
      ".ssm_fileList{max-height:160px;overflow:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px 10px;display:flex;flex-direction:column;gap:2px}" +
      ".ssm_fileRow{display:flex;gap:10px;align-items:center;font-size:12px}" +
      ".ssm_fileName{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,Consolas,monospace}" +
      ".ssm_fileSize{flex:none;color:var(--dsw-alias-label-tertiary)}" +
      ".ssm_rowMain{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}" +
      ".ssm_rowName{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".ssm_rowDesc{font-size:12px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".ssm_rowPath{font-size:11px;color:var(--dsw-alias-label-caption,var(--dsw-alias-label-tertiary));overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".ssm_tag{flex:none;font-size:11px;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:1px 8px}" +
      ".ssm_status{flex:none;font-size:11px;padding:1px 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2)}" +
      ".ssm_statusActive{color:var(--dsw-alias-state-success-primary)}" +
      ".ssm_empty{padding:14px 16px;font-size:12px;color:var(--dsw-alias-label-tertiary)}" +
      ".ssm_notice{padding:10px 16px;font-size:12px;color:var(--dsw-alias-state-success-primary)}" +
      ".ssm_field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}" +
      ".ssm_label{font-size:12px;color:var(--dsw-alias-label-secondary)}" +
      ".ssm_input{box-sizing:border-box;width:100%;min-height:30px;padding:5px 8px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l3);border-radius:8px;font:inherit;font-size:13px;outline:0}" +
      ".ssm_textarea{box-sizing:border-box;width:100%;min-height:260px;padding:8px 10px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-button-elevated-fill));border:1px solid var(--dsw-alias-border-l2);border-radius:8px;font-family:ui-monospace,Consolas,monospace;font-size:12px;line-height:1.6;outline:0;resize:vertical}" +
      ".ssm_rowActions{display:inline-flex;gap:8px;flex:none}";
    document.head.appendChild(tag);
  }

  // ── 上传技能：读本地文件 → 走 RPC 落盘 ──
  var TEXT_EXT = /\.(md|markdown|txt|json|ya?ml|js|mjs|cjs|ts|tsx|jsx|css|html?|py|rb|go|rs|java|sh|ps1|bat|toml|ini|cfg|env|gitignore)$/i;
  var UPLOAD_FILE_LIMIT = 4 * 1024 * 1024;

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
  }

  /** 文件 → RPC 条目：文本按 utf8，二进制转 base64；超大文件跳过并标注。 */
  function readUploadFile(file, relative) {
    if (file.size > UPLOAD_FILE_LIMIT) return Promise.resolve({ path: relative, size: file.size, skipped: "超过 " + formatSize(UPLOAD_FILE_LIMIT) });
    if (TEXT_EXT.test(relative) || file.type.indexOf("text/") === 0 || file.type === "application/json") {
      return file.text().then(function (text) { return { path: relative, size: file.size, text: text }; });
    }
    return file.arrayBuffer().then(function (buffer) {
      var bytes = new Uint8Array(buffer);
      var binary = "";
      for (var i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return { path: relative, size: file.size, base64: btoa(binary) };
    });
  }


  // ── 应用内确认框（替代 window.confirm）──
  // 原生 confirm 是同步阻塞的：万一没被正常关掉，整个页面的 JS 都停住，点什么都没反应、只能重启。
  function ConfirmDialog({ t, state, onClose }) {
    var busyPair = React.useState(false);
    var busy = busyPair[0];
    var setBusy = busyPair[1];
    var run = function (ok) {
      if (!ok) { onClose(); return; }
      setBusy(true);
      Promise.resolve(state.onOk()).then(function () { setBusy(false); onClose(); }, function () { setBusy(false); onClose(); });
    };
    return h(_primitives.Modal, {
      open: true,
      onClose: function () { if (!busy) onClose(); },
      closeLabel: t("cancel"),
      title: state.title,
      footer: h(React.Fragment, null,
        h(_primitives.Button, { variant: "outline", disabled: busy, onClick: function () { run(false); } }, t("cancel")),
        h(_primitives.Button, { variant: "outline", disabled: busy, onClick: function () { run(true); } }, state.okLabel ?? t("confirm"))),
      children: h("div", null, h("p", { className: "ssm_hint", style: { margin: 0 } }, state.message))
    });
  }

  // ── 上传技能弹窗 ──
  function UploadSkillDialog({ t, state, onClose, onUpload }) {
    var rootPair = React.useState(state.rootPath ?? (state.roots ?? [])[0]?.path ?? "");
    var root = rootPair[0];
    var setRoot = rootPair[1];
    var namePair = React.useState("");
    var name = namePair[0];
    var setName = namePair[1];
    var pickedPair = React.useState([]);
    var picked = pickedPair[0];
    var setPicked = pickedPair[1];
    var busyPair = React.useState(false);
    var busy = busyPair[0];
    var setBusy = busyPair[1];
    var errPair = React.useState(null);
    var error = errPair[0];
    var setError = errPair[1];
    var folderRef = React.useRef(null);
    var fileRef = React.useRef(null);
    React.useEffect(function () {
      // webkitdirectory 不是标准 React 属性，挂载后直接设
      if (folderRef.current !== null) {
        folderRef.current.setAttribute("webkitdirectory", "");
        folderRef.current.setAttribute("directory", "");
      }
    }, []);
    var take = function (event) {
      var files = Array.from(event.target.files ?? []);
      event.target.value = "";
      if (files.length === 0) return;
      var rows = files.map(function (file) {
        var relative = file.webkitRelativePath !== void 0 && file.webkitRelativePath.length > 0 ? file.webkitRelativePath : file.name;
        return { relative: relative, file: file };
      });
      setPicked(rows);
      setError(null);
      if (name.trim().length === 0) {
        var first = rows[0].relative.split("/")[0];
        var base = first.replace(/\.md$/i, "");
        // 单文件选到 SKILL.md 时没有有意义的名字，留给用户填
        setName(base.toLowerCase() === "skill" ? "" : base);
      }
    };
    var submit = function () {
      if (picked.length === 0) { setError(t("error", { detail: t("uploadEmpty") })); return; }
      setBusy(true);
      setError(null);
      Promise.all(picked.map(function (row) { return readUploadFile(row.file, row.relative); })).then(function (entries) {
        return onUpload({ rootPath: root, name: name, entries: entries });
      }).then(function () { setBusy(false); onClose(); }, function (reason) {
        setBusy(false);
        setError(t("error", { detail: String((reason && reason.message) || reason) }));
      });
    };
    var field = function (label, node) {
      return h("div", { className: "ssm_field" }, h("span", { className: "ssm_label" }, label), node);
    };
    return h(_primitives.Modal, {
      open: true,
      onClose: function () { if (!busy) onClose(); },
      closeLabel: t("close"),
      title: t("uploadTitle"),
      footer: h(React.Fragment, null,
        h(_primitives.Button, { variant: "outline", disabled: busy, onClick: onClose }, t("cancel")),
        h(_primitives.Button, { variant: "outline", disabled: busy, onClick: submit }, t("upload"))),
      children: h("div", null,
        field(t("roots"), h("select", { className: "ssm_input", value: root, disabled: busy, onChange: function (event) { setRoot(event.target.value); } },
          (state.roots ?? []).map(function (item) { return h("option", { key: item.path, value: item.path }, item.source + " · " + item.path); }))),
        field(t("name"), h("input", { className: "ssm_input", value: name, disabled: busy, placeholder: "skill-name", onChange: function (event) { setName(event.target.value); } })),
        h("div", { className: "ssm_field" },
          h("span", { className: "ssm_label" }, t("pick")),
          h("div", { className: "ssm_pairRow" },
            h("button", { type: "button", className: "ssm_btn", disabled: busy, onClick: function () { if (folderRef.current !== null) folderRef.current.click(); } }, t("pickFolder")),
            h("button", { type: "button", className: "ssm_btn", disabled: busy, onClick: function () { if (fileRef.current !== null) fileRef.current.click(); } }, t("pickFile")),
            h("input", { type: "file", multiple: true, ref: folderRef, style: { display: "none" }, onChange: take }),
            h("input", { type: "file", multiple: true, accept: ".md,text/markdown", ref: fileRef, style: { display: "none" }, onChange: take }))),
        picked.length > 0 ? h("div", { className: "ssm_field" },
          h("span", { className: "ssm_label" }, t("files") + "（" + picked.length + "）"),
          h("div", { className: "ssm_fileList" }, picked.slice(0, 40).map(function (row) {
            return h("div", { className: "ssm_fileRow", key: row.relative },
              h("span", { className: "ssm_fileName" }, row.relative),
              h("span", { className: "ssm_fileSize" }, row.file.size > UPLOAD_FILE_LIMIT ? t("skipped") + " " + formatSize(row.file.size) : formatSize(row.file.size)));
          }))) : null,
        h("p", { className: "ssm_hint" }, t("uploadHint")),
        busy ? h("p", { className: "ssm_hint" }, t("uploading")) : null,
        error !== null ? h("div", { className: "ssm_notice", style: { color: "var(--dsw-alias-state-error-primary)", whiteSpace: "pre-wrap" } }, error) : null)
    });
  }

  // ── 技能编辑弹窗 ──
  function SkillDialog({ t, state, onClose, onSave }) {
    var draftPair = React.useState(state.content ?? "");
    var draft = draftPair[0];
    var setDraft = draftPair[1];
    var busyPair = React.useState(false);
    var busy = busyPair[0];
    var setBusy = busyPair[1];
    var namePair = React.useState(state.name ?? "");
    var name = namePair[0];
    var setName = namePair[1];
    var rootPair = React.useState(state.rootPath ?? (state.roots ?? [])[0]?.path ?? "");
    var root = rootPair[0];
    var setRoot = rootPair[1];
    var errPair = React.useState(null);
    var error = errPair[0];
    var setError = errPair[1];
    var submit = function () {
      setBusy(true);
      setError(null);
      Promise.resolve(onSave({ name: name, rootPath: root, content: draft })).then(function () {
        setBusy(false);
        onClose();
      }, function (reason) {
        setBusy(false);
        setError(t("error", { detail: String((reason && reason.message) || reason) }));
      });
    };
    return h(_primitives.Modal, {
      open: true,
      onClose: function () { if (!busy) onClose(); },
      closeLabel: t("close"),
      title: state.mode === "create" ? t("newSkill") : t("edit"),
      footer: h(React.Fragment, null,
        h(_primitives.Button, { variant: "outline", disabled: busy, onClick: onClose }, t("cancel")),
        h(_primitives.Button, { variant: "outline", disabled: busy, onClick: submit }, t("save"))),
      children: h("div", null,
        state.mode === "create" ? h("div", { className: "ssm_field" },
          h("span", { className: "ssm_label" }, t("name")),
          h("input", { className: "ssm_input", value: name, disabled: busy, onChange: function (event) { setName(event.target.value); } })) : null,
        state.mode === "create" ? h("div", { className: "ssm_field" },
          h("span", { className: "ssm_label" }, t("roots")),
          h("select", { className: "ssm_input", value: root, disabled: busy, onChange: function (event) { setRoot(event.target.value); } },
            (state.roots ?? []).map(function (item) { return h("option", { key: item.path, value: item.path }, item.source + " · " + item.path); }))) : null,
        h("div", { className: "ssm_field" },
          h("span", { className: "ssm_label" }, t("content")),
          h("textarea", { className: "ssm_textarea", value: draft, disabled: busy, spellCheck: false, onChange: function (event) { setDraft(event.target.value); } })),
        error !== null ? h("div", { className: "ssm_notice", style: { color: "var(--dsw-alias-state-error-primary)" } }, error) : null)
    });
  }

  // ── 键值对（env / headers）与表单行的互转 ──
  function pairsToRows(map) {
    var rows = [];
    if (map !== void 0 && map !== null && typeof map === "object" && !Array.isArray(map)) {
      Object.keys(map).forEach(function (key) { rows.push({ key: key, value: String(map[key]) }); });
    }
    return rows;
  }
  function rowsToMap(rows) {
    var map = {};
    rows.forEach(function (row) {
      var key = String(row.key ?? "").trim();
      if (key.length === 0) return;
      map[key] = String(row.value ?? "");
    });
    return map;
  }
  function patchRow(rows, index, field, value) {
    var next = {};
    next[field] = value;
    return rows.map(function (row, at) { return at === index ? Object.assign({}, row, next) : row; });
  }

  // ── MCP JSON 导入解析（宽容：mcpServers 包裹 / 名称映射 / 单对象 / 数组）──
  function parseMcpJson(text) {
    var raw = String(text ?? "").trim();
    if (raw.length === 0) throw new Error("empty JSON");
    var data = JSON.parse(raw);
    var source = data !== null && typeof data === "object" && !Array.isArray(data) && data.mcpServers !== void 0 ? data.mcpServers : data;
    var entries = [];
    var push = function (fallbackName, value) {
      if (value === null || typeof value !== "object" || Array.isArray(value)) return;
      var name = String(value.serverName ?? value.name ?? fallbackName ?? "").trim();
      var url = String(value.url ?? value.serverUrl ?? "").trim();
      var kind = String(value.transport ?? value.type ?? "").toLowerCase();
      var timeout = Number(value.toolCallTimeoutMs ?? value.timeoutMs ?? 0);
      entries.push({
        serverName: name,
        transport: kind.indexOf("http") >= 0 || kind === "sse" || (kind.length === 0 && url.length > 0) ? "streamable-http" : "stdio",
        command: String(value.command ?? "").trim(),
        args: Array.isArray(value.args) ? value.args.map(String) : [],
        env: value.env !== void 0 && typeof value.env === "object" && !Array.isArray(value.env) ? value.env : {},
        url: url,
        headers: value.headers !== void 0 && typeof value.headers === "object" && !Array.isArray(value.headers) ? value.headers : {},
        cwd: String(value.cwd ?? "").trim(),
        toolCallTimeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 0
      });
    };
    if (Array.isArray(source)) source.forEach(function (item, index) { push("mcp-" + (index + 1), item); });
    else if (source !== null && typeof source === "object") {
      if (source.command === void 0 && source.url === void 0 && source.serverName === void 0 && source.name === void 0) {
        Object.keys(source).forEach(function (key) { push(key, source[key]); });
      } else push("", source);
    }
    entries = entries.filter(function (entry) { return entry.serverName.length > 0; });
    if (entries.length === 0) throw new Error("no server config found (expected mcpServers / name map / single server object)");
    entries.forEach(function (entry) {
      if (!/^[A-Za-z0-9._-]+$/.test(entry.serverName)) throw new Error("serverName 只能包含字母/数字/._- : " + entry.serverName);
      if (entry.transport === "stdio" && entry.command.length === 0) throw new Error("stdio server needs \"command\": " + entry.serverName);
      if (entry.transport === "streamable-http" && entry.url.length === 0) throw new Error("http server needs \"url\": " + entry.serverName);
    });
    return entries;
  }

  // ── MCP 编辑弹窗 ──
  function McpDialog({ t, state, onClose, onSave, onImport, onTest }) {
    var server = state.server ?? {};
    var namePair = React.useState(server.serverName ?? "");
    var serverName = namePair[0];
    var setServerName = namePair[1];
    var transportPair = React.useState(server.transport === "streamable-http" ? "streamable-http" : "stdio");
    var transport = transportPair[0];
    var setTransport = transportPair[1];
    var commandPair = React.useState(server.command ?? "");
    var command = commandPair[0];
    var setCommand = commandPair[1];
    var argsPair = React.useState((server.args ?? []).join("\n"));
    var args = argsPair[0];
    var setArgs = argsPair[1];
    var envPair = React.useState(pairsToRows(server.env));
    var envRows = envPair[0];
    var setEnvRows = envPair[1];
    var headerPair = React.useState(pairsToRows(server.headers));
    var headerRows = headerPair[0];
    var setHeaderRows = headerPair[1];
    var urlPair = React.useState(server.url ?? "");
    var url = urlPair[0];
    var setUrl = urlPair[1];
    var cwdPair = React.useState(server.cwd ?? "");
    var cwd = cwdPair[0];
    var setCwd = cwdPair[1];
    var timeoutPair = React.useState(server.toolCallTimeoutMs > 0 ? String(server.toolCallTimeoutMs) : "");
    var timeoutText = timeoutPair[0];
    var setTimeoutText = timeoutPair[1];
    var modePair = React.useState("form");
    var mode = modePair[0];
    var setMode = modePair[1];
    var jsonPair = React.useState("");
    var jsonText = jsonPair[0];
    var setJsonText = jsonPair[1];
    var busyPair = React.useState(false);
    var busy = busyPair[0];
    var setBusy = busyPair[1];
    var errPair = React.useState(null);
    var error = errPair[0];
    var setError = errPair[1];
    var forcedPair = React.useState(false);
    var forced = forcedPair[0];
    var setForced = forcedPair[1];
    var isCreate = state.mode === "create";

    // 保存前先探活：全通过才写；有失败就报错并转成「仍然保存」
    var commit = function (entries, write) {
      setBusy(true);
      setError(null);
      // 只有新增才探活；编辑已存在的服务器直接写（用户明确要求）
      Promise.resolve(forced || !isCreate ? null : onTest(entries)).then(function (results) {
        if (results !== null && results !== void 0) {
          var failed = results.filter(function (item) { return item.ok !== true; });
          if (failed.length > 0) {
            setForced(true);
            var blocked = new Error(t("testBlocked", {
              detail: failed.map(function (item) { return item.serverName + "：" + item.error; }).join("；")
            }));
            blocked.raw = true;
            throw blocked;
          }
        }
        return write();
      }).then(function () { setBusy(false); onClose(); }, function (reason) {
        setBusy(false);
        setError(reason !== null && reason !== void 0 && reason.raw === true ? String(reason.message) : t("error", { detail: String((reason && reason.message) || reason) }));
      });
    };
    var submit = function () {
      var entry = {
        id: server.id,
        serverName: serverName.trim(),
        transport: transport,
        command: command.trim(),
        args: args.split(/\r?\n/).map(function (line) { return line.trim(); }).filter(function (line) { return line.length > 0; }),
        env: rowsToMap(envRows),
        url: url.trim(),
        headers: rowsToMap(headerRows),
        cwd: cwd.trim(),
        toolCallTimeoutMs: Number(timeoutText) > 0 ? Math.round(Number(timeoutText)) : 0
      };
      if (entry.serverName.length === 0) { setError(t("error", { detail: "serverName 不能为空" })); return; }
      commit([entry], function () { return onSave(entry); });
    };
    var field = function (label, node) {
      return h("div", { className: "ssm_field" }, h("span", { className: "ssm_label" }, label), node);
    };
    // 键值行编辑器：env / headers 用同一套。
    // splitValues=true（环境变量）时，值按逗号拆成多个小框分别编辑，右边显示项数 —— 一长串 key 不再挤在一个框里。
    var pairEditor = function (label, rows, setRows, keyHint, valueHint, addLabel, splitValues) {
      var itemsOf = function (value) { return String(value ?? "").split(","); };
      var setItemAt = function (index, slot, text) {
        var items = itemsOf(rows[index].value);
        items[slot] = text;
        setRows(patchRow(rows, index, "value", items.join(",")));
      };
      var delRow = function (index) { setRows(rows.filter(function (_row, at) { return at !== index; })); };
      var rowDelBtn = function (index) { return h("button", { type: "button", className: "ssm_btn ssm_rowDel", disabled: busy, onClick: function () { delRow(index); } }, t("removeAll")); };
      return h("div", { className: "ssm_field" },
        h("span", { className: "ssm_label" }, label),
        h("div", { className: "ssm_pairs" },
          rows.map(function (row, index) {
            var keyInput = h("input", { className: "ssm_input ssm_keyInput", value: row.key, placeholder: keyHint, disabled: busy, onChange: function (event) { setRows(patchRow(rows, index, "key", event.target.value)); } });
            if (splitValues !== true) {
              return h("div", { className: "ssm_pairRow", key: index },
                keyInput,
                h("input", { className: "ssm_input ssm_valInput", value: row.value, placeholder: valueHint, disabled: busy, onChange: function (event) { setRows(patchRow(rows, index, "value", event.target.value)); } }),
                rowDelBtn(index));
            }
            var items = itemsOf(row.value);
            return h("div", { className: "ssm_pairRow", key: index },
              keyInput,
              h("div", { className: "ssm_valueItems" },
                items.map(function (item, slot) {
                  return h("span", { className: "ssm_valueItemWrap", key: slot },
                    h("input", { className: "ssm_input ssm_valueItem", value: item, placeholder: valueHint, disabled: busy, onChange: function (event) { setItemAt(index, slot, event.target.value); } }),
                    h("button", {
                      type: "button", className: "ssm_itemDel", disabled: busy, title: t("removeItem"),
                      onClick: function () {
                        // 只剩一项时等同删掉整行（否则删完还留个空框，看着像没反应）
                        if (items.length <= 1) { delRow(index); return; }
                        var rest = items.filter(function (_item, at) { return at !== slot; });
                        setRows(patchRow(rows, index, "value", rest.join(",")));
                      }
                    }, "✕"));
                }),
                // 再加一项 / 项数 / 删除整行 —— 独占一行，落在最后一条数据下方
                h("div", { className: "ssm_pairFoot" },
                  h("span", { className: "ssm_itemCount" }, t("itemCount", { n: items.length })),
                  h("button", { type: "button", className: "ssm_btn ssm_itemAdd", disabled: busy, title: t("addItem"), onClick: function () { setRows(patchRow(rows, index, "value", row.value + ",")); } }, "＋ " + t("addItem")),
                  rowDelBtn(index))));
          }),
          h("button", { type: "button", className: "ssm_btn", disabled: busy, onClick: function () { setRows(rows.concat([{ key: "", value: "" }])); } }, addLabel)));
    };
    var jsonMode = state.mode === "create" && mode === "json";
    var submitJson = function () {
      var entries;
      try {
        entries = parseMcpJson(jsonText);
      } catch (reason) {
        setError(t("error", { detail: String((reason && reason.message) || reason) }));
        return;
      }
      commit(entries, function () { return onImport(entries); });
    };
    // 焦点还在输入框里时，第一次点按钮可能只完成「失焦」、click 被吃掉（用户实测）。
    // 所以：mousedown 就动手，并延到 blur 引起的状态提交之后再取最新状态执行；
    // click 仍保留（键盘 Enter 走这条），500ms 内不重复执行。
    var latestAction = React.useRef(null);
    latestAction.current = { cancel: onClose, save: jsonMode ? submitJson : submit };
    var lastPress = 0;
    var press = function (kind) {
      return {
        onMouseDown: function (event) {
          if (event.button !== 0 || busy) return;
          lastPress = Date.now();
          setTimeout(function () { if (latestAction.current) latestAction.current[kind](); }, 0);
        },
        onClick: function () {
          if (busy || Date.now() - lastPress < 500) return;
          if (latestAction.current) latestAction.current[kind]();
        }
      };
    };
    // 底部状态：测试中 / 写入中 / 测试没过 / 出错原因（一行）
    var footerStatus = (function () {
      if (busy) return forced ? t("footerWriting") : isCreate ? t("testing") : t("footerWriting");
      if (forced) return t("footerTestFailed");
      if (error !== null) return String(error).split("\n")[0];
      return "";
    })();
    return h(_primitives.Modal, {
      open: true,
      onClose: function () { if (!busy) onClose(); },
      closeLabel: t("close"),
      title: state.mode === "create" ? t("addServer") : t("edit"),
      className: "ssm_wideModal",
      // 状态显示在底部（取消/保存左边），不放进滚动区
      footer: h("div", { className: "ssm_footerRow" },
        footerStatus.length > 0 ? h("span", { className: "ssm_footerStatus", title: footerStatus }, footerStatus) : null,
        h("div", { className: "ssm_footerBtns" },
          h(_primitives.Button, Object.assign({ variant: "outline", disabled: busy }, press("cancel")), t("cancel")),
          h(_primitives.Button, Object.assign({ variant: "outline", disabled: busy }, press("save")), forced ? t("stillSave") : jsonMode ? t("import") : t("save")))),
      children: h("div", { className: "ssm_mcpBody" },
        state.mode === "create" ? field(t("mode"), h("select", { className: "ssm_input", value: mode, disabled: busy, onChange: function (event) { setError(null); setMode(event.target.value); } },
          h("option", { value: "form" }, t("modeForm")),
          h("option", { value: "json" }, t("modeJson")))) : null,
        jsonMode ? h(React.Fragment, null,
          field(t("jsonContent"), h("textarea", { className: "ssm_textarea", style: { minHeight: "220px" }, value: jsonText, disabled: busy, spellCheck: false, placeholder: "{\n  \"mcpServers\": {\n    \"web-search\": { \"command\": \"npx\", \"args\": [\"-y\", \"@xxx/mcp\"] }\n  }\n}", onChange: function (event) { setJsonText(event.target.value); } })),
          h("p", { className: "ssm_hint" }, t("jsonHint"))) : null,
        jsonMode ? null : h("div", { className: "ssm_mcpGrid" },
          h("div", { className: "ssm_mcpCol" },
            field(t("serverName"), h("input", { className: "ssm_input", value: serverName, disabled: busy, onChange: function (event) { setServerName(event.target.value); } })),
            field(t("transport"), h("select", { className: "ssm_input", value: transport, disabled: busy, onChange: function (event) { setTransport(event.target.value); } },
              h("option", { value: "stdio" }, "stdio"),
              h("option", { value: "streamable-http" }, "streamable-http"))),
            transport !== "stdio" ? null : field(t("command"), h("input", { className: "ssm_input", value: command, disabled: busy, placeholder: "C:\\Program Files\\nodejs\\node.exe", onChange: function (event) { setCommand(event.target.value); } })),
            transport !== "stdio" ? null : field(t("args"), h("textarea", { className: "ssm_input", style: { minHeight: "72px", fontFamily: "ui-monospace,Consolas,monospace" }, value: args, disabled: busy, onChange: function (event) { setArgs(event.target.value); } })),
            transport !== "streamable-http" ? null : field(t("url"), h("input", { className: "ssm_input", value: url, disabled: busy, onChange: function (event) { setUrl(event.target.value); } })),
            transport !== "stdio" ? null : field(t("cwd"), h("input", { className: "ssm_input", value: cwd, disabled: busy, placeholder: t("cwdPlaceholder"), onChange: function (event) { setCwd(event.target.value); } })),
            field(t("toolTimeout"), h("input", { className: "ssm_input", value: timeoutText, disabled: busy, placeholder: t("toolTimeoutPlaceholder"), onChange: function (event) { setTimeoutText(event.target.value); } }))),
          h("div", { className: "ssm_mcpCol" },
            transport !== "stdio" ? null : pairEditor(t("env"), envRows, setEnvRows, "KEY", "VALUE", t("envAdd"), true),
            transport !== "streamable-http" ? null : pairEditor(t("headers"), headerRows, setHeaderRows, "Authorization", "Bearer xxx", t("headerAdd"), false))),
        error !== null ? h("div", { className: "ssm_notice", style: { color: "var(--dsw-alias-state-error-primary)", whiteSpace: "pre-wrap" } }, error) : null)
    });
  }

  // ── 页面（main 槽位）──
  function SkillMcpPage(props) {
    var t = props.t;
    var didMount = React.useRef(false);
    var dataPair = React.useState(null);
    var data = dataPair[0];
    var setData = dataPair[1];
    var busyPair = React.useState(false);
    var busy = busyPair[0];
    var setBusy = busyPair[1];
    var noticePair = React.useState(null);
    var notice = noticePair[0];
    var setNotice = noticePair[1];
    var errPair = React.useState(null);
    var error = errPair[0];
    var setError = errPair[1];
    var rootPair = React.useState(null);
    var rootFilter = rootPair[0];
    var setRootFilter = rootPair[1];
    var skillDialogPair = React.useState(null);
    var skillDialog = skillDialogPair[0];
    var setSkillDialog = skillDialogPair[1];
    var confirmPair = React.useState(null);
    var confirmDialog = confirmPair[0];
    var setConfirmDialog = confirmPair[1];
    var askConfirm = function (state) { setConfirmDialog(state); };
    var uploadDialogPair = React.useState(null);
    var uploadDialog = uploadDialogPair[0];
    var setUploadDialog = uploadDialogPair[1];
    var mcpDialogPair = React.useState(null);
    var mcpDialog = mcpDialogPair[0];
    var setMcpDialog = mcpDialogPair[1];

    var refresh = React.useCallback(function () {
      setBusy(true);
      setError(null);
      // cwd 每次刷新现取：注入那一刻可能还没有当前会话，页面挂载后再开会话也能拿到
      var cwd = null;
      try { cwd = typeof props.getCwd === "function" ? props.getCwd() : null; } catch (error) { cwd = null; }
      return Promise.all([wireCall("listSkills", { cwd: cwd }), wireCall("listMcp", {})]).then(function (results) {
        setData({ skills: results[0], mcp: results[1] });
        setBusy(false);
      }, function (reason) {
        setBusy(false);
        setError(t("error", { detail: String((reason && reason.message) || reason) }));
      });
    }, []);
    React.useEffect(function () {
      installStyles();
      if (didMount.current) return;
      didMount.current = true;
      refresh();
    }, []);

    if (data === null) {
      return h("div", { className: "ssm_page" }, h("h2", { className: "ssm_title" }, t("title")), h("div", { className: "ssm_empty" }, t("loading")));
    }

    var roots = data.skills.roots ?? [];
    var selectedRoot = rootFilter === null ? (roots.filter(function (r) { return r.exists; })[0] ?? roots[0]) : roots.filter(function (r) { return r.path === rootFilter; })[0];
    var skills = (data.skills.skills ?? []).filter(function (skill) { return selectedRoot === void 0 || skill.source === selectedRoot.source; });
    var servers = data.mcp.servers ?? [];

    var saveSkill = function (payload) {
      if (skillDialog.mode === "create") {
        return wireCall("createSkill", payload).then(function (result) {
          setNotice(t("createdSkill", { path: result.path }));
          return refresh();
        });
      }
      return wireCall("saveSkill", { path: skillDialog.path, content: payload.content }).then(function () {
        setNotice(t("savedSkill"));
        return refresh();
      });
    };
    var deleteSkill = function (skill) {
      askConfirm({
        title: t("remove") + " " + skill.name,
        message: t("confirmDeleteSkill", { name: skill.name }),
        okLabel: t("remove"),
        onOk: function () {
          return wireCall("deleteSkill", { path: skill.path }).then(function () { return refresh(); }, function (reason) {
            setError(t("error", { detail: String((reason && reason.message) || reason) }));
          });
        }
      });
    };
    var uploadSkill = function (payload) {
      return wireCall("uploadSkill", payload).then(function (result) {
        setNotice(t("uploadOk", { count: result.files, path: result.path }) + (result.addedFrontmatter === true ? t("uploadFilled") : ""));
        return refresh();
      });
    };
    // 写完立刻反馈，热加载状态后台追（删条目官方要等子进程退出、加条目要等握手，别让用户干等）
    var finishMcp = function (call, expect, message) {
      return call().then(function (result) {
        var pending = t("hotPending", { path: result.patchFile });
        setNotice(message !== void 0 ? message + " · " + pending : pending);
        watchMcp(expect, result.patchFile);
        return refresh();
      });
    };
    // 后台每 0.6s 看一眼，命中期望状态就改口"已生效"，最多追 8 秒
    var watchMcp = function (expect, patchFile) {
      var deadline = Date.now() + 8000;
      var tick = function () {
        wireCall("listMcp", {}).then(function (fresh) {
          var servers = fresh.servers ?? [];
          setData(function (prev) { return prev === null ? prev : { skills: prev.skills, mcp: fresh }; });
          if (expect === void 0 || expect(servers) === true) { setNotice(t("hotSaved", { path: patchFile })); return; }
          if (Date.now() < deadline) setTimeout(tick, 600);
        }, function () { if (Date.now() < deadline) setTimeout(tick, 600); });
      };
      setTimeout(tick, 300);
    };
    // 增删改一律交给 host：host 以 patch 文件为准（前端/运行时的列表可能是空的）。
    var upsertServer = function (entry) {
      var name = entry.serverName;
      return finishMcp(function () { return wireCall("upsertMcpServer", { server: entry }); }, function (servers) {
        return servers.some(function (item) { return item.serverName === name && item.state === "active"; });
      });
    };
    // 探活：每个条目单独连一次（并行），返回 { serverName, ok, error?, tools? }
    var testServers = function (entries) {
      return Promise.all(entries.map(function (entry) {
        return wireCall("testMcp", { server: entry }).then(function (result) {
          return Object.assign({ serverName: entry.serverName }, result);
        }, function (reason) {
          return { serverName: entry.serverName, ok: false, error: String((reason && reason.message) || reason) };
        });
      }));
    };
    var testOne = function (server) {
      setNotice(t("testing"));
      testServers([server]).then(function (results) {
        var item = results[0];
        setNotice(item.ok === true ? t("testOk", { name: item.serverName, count: item.tools }) : t("testFail", { name: item.serverName, detail: item.error }));
      }, function (reason) {
        setError(t("error", { detail: String((reason && reason.message) || reason) }));
      });
    };
    // JSON 批量导入：按 serverName 合并（同名覆盖），其余原样保留
    var importServers = function (entries) {
      var names = entries.map(function (item) { return item.serverName; });
      return finishMcp(function () { return wireCall("importMcpServers", { entries: entries }); }, function (servers) {
        return names.every(function (name) { return servers.some(function (item) { return item.serverName === name && item.state === "active"; }); });
      }, t("importedServers", { count: entries.length }));
    };
    var removeServer = function (server) {
      askConfirm({
        title: t("remove") + " " + server.serverName,
        message: t("confirmDeleteServer", { name: server.serverName }),
        okLabel: t("remove"),
        onOk: function () {
          return finishMcp(function () { return wireCall("removeMcpServer", { serverName: server.serverName }); }, function (servers) {
            return servers.every(function (item) { return item.serverName !== server.serverName; });
          });
        }
      });
    };

    return h("div", { className: "ssm_page" },
      h("h2", { className: "ssm_title" }, t("title")),
      h("p", { className: "ssm_intro" }, t("intro")),
      error !== null ? h("div", { className: "ssm_notice", style: { color: "var(--dsw-alias-state-error-primary)" } }, error) : null,
      notice !== null ? h("div", { className: "ssm_notice" }, notice) : null,

      h("div", { className: "ssm_grid" },
      h("section", { className: "ssm_group" },
        h("div", { className: "ssm_groupHead" },
          h("span", { className: "ssm_groupTitle" }, t("skills")),
          h("select", {
            className: "ssm_input",
            // 可压缩：表头窄的时候先压这个下拉，别把右边按钮挤出分组框
            style: { width: "auto", minWidth: "0", maxWidth: "100%", flex: "1 1 120px" },
            value: selectedRoot === void 0 ? "" : selectedRoot.path,
            onChange: function (event) { setRootFilter(event.target.value); }
          }, roots.map(function (item) {
            return h("option", { key: item.path, value: item.path }, item.source + " · " + item.path + (item.exists ? "" : "（不存在）"));
          })),
          h("button", { type: "button", className: "ssm_btn", disabled: busy, onClick: function () { setNotice(null); setSkillDialog({ mode: "create", roots: roots, rootPath: selectedRoot?.path, content: "" }); } }, t("newSkill")),
          h("button", { type: "button", className: "ssm_btn", disabled: busy, onClick: function () { setNotice(null); setUploadDialog({ roots: roots, rootPath: selectedRoot?.path }); } }, t("upload")),
          h("button", { type: "button", className: "ssm_btn", disabled: busy, onClick: function () { setNotice(null); refresh(); } }, t("refresh"))),
        skills.length === 0
          ? h("div", { className: "ssm_empty" }, t("noSkills"))
          : h("div", { className: "ssm_rows" }, skills.map(function (skill) {
            return h("div", { className: "ssm_row", key: skill.path },
              h("div", { className: "ssm_rowMain" },
                h("span", { className: "ssm_rowName" }, skill.name),
                skill.description.length > 0 ? h("span", { className: "ssm_rowDesc" }, skill.description) : null,
                h("span", { className: "ssm_rowPath" }, skill.path)),
              h("span", { className: "ssm_tag" }, skill.kind === "dir" ? "SKILL.md" : ".md"),
              h("span", { className: "ssm_rowActions" },
                h("button", {
                  type: "button", className: "ssm_btn", disabled: busy, onClick: function () {
                    setNotice(null);
                    wireCall("readSkill", { path: skill.path }).then(function (result) {
                      setSkillDialog({ mode: "edit", path: skill.path, name: skill.name, content: result.content });
                    }, function (reason) { setError(t("error", { detail: String((reason && reason.message) || reason) })); });
                  }
                }, t("edit")),
                h("button", { type: "button", className: "ssm_btn ssm_btnDanger", disabled: busy, onClick: function () { deleteSkill(skill); } }, t("remove"))));
          }))),

      h("section", { className: "ssm_group" },
        h("div", { className: "ssm_groupHead" },
          h("span", { className: "ssm_groupTitle" }, t("mcp")),
          h("span", { className: "ssm_groupMeta" }, data.mcp.patchFile ?? ""),
          h("button", { type: "button", className: "ssm_btn", disabled: busy, onClick: function () { setNotice(null); setMcpDialog({ mode: "create", server: { transport: "stdio" } }); } }, t("addServer")),
          h("button", { type: "button", className: "ssm_btn", disabled: busy, onClick: function () { setNotice(null); refresh(); } }, t("refresh"))),
        servers.length === 0
          ? h("div", { className: "ssm_empty" }, t("noMcp"))
          : h("div", { className: "ssm_rows" }, servers.map(function (server) {
            return h("div", { className: "ssm_row", key: server.id + ":" + server.serverName },
              h("div", { className: "ssm_rowMain" },
                h("span", { className: "ssm_rowName" }, server.serverName),
                h("span", { className: "ssm_rowDesc" }, server.transport === "stdio" ? (server.command + " " + (server.args ?? []).join(" ")) : server.url),
                h("span", { className: "ssm_rowPath" }, server.id)),
              h("span", { className: "ssm_tag" }, server.transport),
              h("span", { className: "ssm_status" + (server.state === "active" ? " ssm_statusActive" : "") }, server.state === "active" ? t("active") : t("inactive")),
              h("span", { className: "ssm_rowActions" },
                h("button", { type: "button", className: "ssm_btn", disabled: busy, onClick: function () { testOne(server); } }, t("test")),
                h("button", { type: "button", className: "ssm_btn", disabled: busy, onClick: function () { setNotice(null); setMcpDialog({ mode: "edit", server: server }); } }, t("edit")),
                h("button", { type: "button", className: "ssm_btn ssm_btnDanger", disabled: busy, onClick: function () { removeServer(server); } }, t("remove"))));
          })))),

      skillDialog !== null ? h(SkillDialog, { t: t, state: skillDialog, onClose: function () { setSkillDialog(null); }, onSave: saveSkill }) : null,
      uploadDialog !== null ? h(UploadSkillDialog, { t: t, state: uploadDialog, onClose: function () { setUploadDialog(null); }, onUpload: uploadSkill }) : null,
      confirmDialog !== null ? h(ConfirmDialog, { t: t, state: confirmDialog, onClose: function () { setConfirmDialog(null); } }) : null,
      mcpDialog !== null ? h(McpDialog, { t: t, state: mcpDialog, onClose: function () { setMcpDialog(null); }, onSave: upsertServer, onImport: importServers, onTest: testServers }) : null
    );
  }

  function apply(ctx) {
    var t = ctx.locale.bind(NS);
    ctx.effect(function () {
      return ctx.locale.register(NS, { zh: zh, en: en });
    }, "dsh-skill-mcp-manager: dictionaries");
    ctx.effect(installStyles, "dsh-skill-mcp-manager: styles");

    ctx.slots.inject("main", function () {
      return ctx.slots.register({
        name: "main",
        key: PANEL_ID,
        locale: NS,
        inject: function () {
          return {
            // 当前会话工作目录（懒解析）：定位工作区级技能根（.dsh/skills、.agents/skills）
            getCwd: function () {
              try {
                var snapshot = ctx.sessions.list.getSnapshot();
                var current = snapshot.current;
                var summary = current !== void 0 && snapshot.byId !== void 0 ? snapshot.byId[current] : void 0;
                if (summary !== void 0 && typeof summary.cwd === "string") return summary.cwd;
              } catch (error) { /* 拿不到就算了 */ }
              return null;
            }
          };
        }
      }, SkillMcpPage);
    });
    ctx.slots.inject("sidebar.panellist", function () {
      return ctx.slots.register({
        name: "sidebar.panellist",
        id: PANEL_ID,
        order: 1,
        label: function () { return ctx.locale.bind(NS)("panel"); },
        locale: NS
      }, function (props) {
        return h(_primitives.IconSkillOutlineRegular, { size: props.size });
      });
    });
  }

  exports.apply = apply;
  exports.inject = ["slots", "locale", "sessions"];
  return module.exports;
}});
