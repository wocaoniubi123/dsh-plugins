// dsh-session-tools · client 侧：会话批量管理（归档/删除）+ 删除确认「删除⏎」。
//
// 官方侧栏没有批量入口、菜单里也没有删除项（只有 置顶/重命名/分叉/归档），这里补齐：
//   1) 侧栏顶部注入「批量」按钮 → 打开 shell.overlay 面板：按工作区分组勾选，
//      全选/全不选、批量归档（官方 archiveSession）、批量删除（host sessionTools RPC）。
//   2) 会话右键菜单加「删除会话」（order 500）→ 确认弹窗（确认按钮文案「删除⏎」，
//      打开期间 Enter 直接确认）。
// 删除语义：先归档再删（host 侧串起来），删完刷新官方会话 store 防幽灵行。
window.__ModuleLoader__.load({ id: "dsh-session-tools", factory: (require) => {
  var module = { exports: {} };
  var exports = module.exports;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

  var React = require("react");
  var react_jsx_runtime = require("react/jsx-runtime");
  var _primitives = require("@deepseek-ai/dsh-client-ui-primitives");

  var NS = "dsh-session-tools";
  var BATCH_MARK = "data-dsh-session-tools-batch";

  var zh = {
    batch: "批量操作",
    selectAll: "全选",
    clearAll: "全不选",
    selectedCount: "已选 {n} 个",
    archiveSelected: "归档所选",
    deleteSelected: "删除所选",
    empty: "没有可批量操作的会话",
    pinned: "已置顶",
    timeNow: "刚刚",
    timeMinutes: "{n}分钟",
    timeHours: "{n}小时",
    timeDays: "{n}天",
    timeMonths: "{n}个月",
    timeYears: "{n}年",
    timeAgo: "{t}前",
    result: "完成：成功 {ok} 个，失败 {fail} 个",
    pending: "正在执行…",
    deleteTitle: "删除会话",
    deleteDesc: "将永久删除会话“{name}”及其子代理（含正在运行的）和全部记录（对话内容、统计、缓存），此操作不可恢复。",
    deleteBatchDesc: "将永久删除所选的 {n} 个会话及其子代理（含正在运行的）和全部记录，此操作不可恢复。",
    deleteConfirm: "删除⏎",
    deleting: "正在删除…",
    deleteMenu: "删除会话",
    ungrouped: "未分组",
    newSession: "新会话",
    selectSession: "选择会话“{name}”",
    close: "关闭",
    cancel: "取消",
    archNav: "会话管理",
    archTitle: "会话管理",
    openSessionsDir: "打开会话目录",
    openSessionsDirFailed: "打开目录失败: ",
    compatDedig: "修复 Git 页签与绘画插件的样式冲突",
    sidebarButton: "侧边栏按钮",
    navEntry: "会话管理",
    archDesc: "按工作区查看全部会话或已归档会话；全部会话只能归档，已归档可以恢复或永久删除。",
    tabAll: "全部会话",
    tabArchived: "已归档",
    archEmpty: "没有可显示的会话",
    archArchive: "归档",
    archArchiveSelected: "归档所选",
    grpExpand: "展开分组",
    grpCollapse: "收起分组",
    archSearch: "按标题筛选…",
    archRestore: "取消归档",
    archDelete: "删除",
    archRestoreSelected: "恢复所选",
    archDeleteSelected: "删除所选",
    archDeleteHint: "永久清除归档记账",
    archUpdated: "更新于 {time}",
    ctxPin: "置顶会话",
    ctxUnpin: "取消置顶",
    ctxOpenExplorer: "打开资源管理器",
    ctxCopyRef: "复制会话引用",
    ctxRename: "重命名",
    ctxFork: "分叉会话",
    ctxArchive: "归档会话",
    ctxUnarchive: "取消归档",
    ctxDelete: "删除会话",
    rnTitle: "重命名会话",
    rnSave: "保存",
    rnFailed: "重命名失败: "
  };
  var en = {
    batch: "Batch actions",
    selectAll: "Select all",
    clearAll: "Clear all",
    selectedCount: "{n} selected",
    archiveSelected: "Archive selected",
    deleteSelected: "Delete selected",
    empty: "No sessions available",
    pinned: "Pinned",
    timeNow: "just now",
    timeMinutes: "{n}m",
    timeHours: "{n}h",
    timeDays: "{n}d",
    timeMonths: "{n}mo",
    timeYears: "{n}y",
    timeAgo: "{t} ago",
    result: "Done: {ok} succeeded, {fail} failed",
    pending: "Working…",
    deleteTitle: "Delete session",
    deleteDesc: "Permanently delete session \"{name}\" with its subagents (including running ones) and all records. This cannot be undone.",
    deleteBatchDesc: "Permanently delete the {n} selected sessions with their subagents (including running ones) and all records. This cannot be undone.",
    deleteConfirm: "Delete⏎",
    deleting: "Deleting…",
    deleteMenu: "Delete session",
    ungrouped: "Ungrouped",
    newSession: "New session",
    selectSession: "Select session \"{name}\"",
    close: "Close",
    cancel: "Cancel",
    archNav: "Session manager",
    archTitle: "Session manager",
    openSessionsDir: "Open sessions folder",
    openSessionsDirFailed: "Could not open folder: ",
    compatDedig: "Fix Git tab styles clashing with the image-gen plugin",
    sidebarButton: "Sidebar button",
    navEntry: "Session manager",
    archDesc: "Browse all sessions or archived sessions by workspace. The all-sessions view can only archive; archived sessions can be restored or deleted permanently.",
    tabAll: "All sessions",
    tabArchived: "Archived",
    archEmpty: "No sessions to show",
    archArchive: "Archive",
    archArchiveSelected: "Archive selected",
    grpExpand: "Expand group",
    grpCollapse: "Collapse group",
    archSearch: "Filter by title…",
    archRestore: "Unarchive",
    archDelete: "Delete",
    archRestoreSelected: "Restore selected",
    archDeleteSelected: "Delete selected",
    archDeleteHint: "Clear archive bookkeeping permanently",
    archUpdated: "Updated {time}",
    ctxPin: "Pin session",
    ctxUnpin: "Unpin session",
    ctxOpenExplorer: "Open in File Explorer",
    ctxCopyRef: "Copy session reference",
    ctxRename: "Rename",
    ctxFork: "Fork session",
    ctxArchive: "Archive session",
    ctxUnarchive: "Unarchive session",
    ctxDelete: "Delete session",
    rnTitle: "Rename session",
    rnSave: "Save",
    rnFailed: "Rename failed: "
  };

  // ── wire：host sessionTools RPC（按 typert 网关的 HTTP 通道）──
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

  // ── 跟官方会话列表一致的排序与显示 ──
  // 官方：置顶在前（按 pinnedSessionIds 顺序），其余按 updatedAt 倒序、同值按 id 升序。
  // 会话引用 URI：与官方 @deepseek-ai/dsh-session-reference 的 uri 编码一致
  //   dsh-session: + base64url(UTF-8(JSON.stringify(sessionId)))
  // 官方 uri.ts：Buffer.from(JSON.stringify(id),"utf8").toString("base64url")
  function base64urlUtf8(text) {
    var bytes = new TextEncoder().encode(text);
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function sessionReferenceUri(sessionId) {
    return "dsh-session:" + base64urlUtf8(JSON.stringify(sessionId));
  }
  function sortLikeSidebar(rows, pinnedIds) {
    var pinned = [];
    var rest = [];
    var pinnedSet = new Set(pinnedIds || []);
    (rows || []).forEach(function (row) { (pinnedSet.has(row.id) ? pinned : rest).push(row); });
    var order = new Map();
    (pinnedIds || []).forEach(function (id, index) { if (!order.has(id)) order.set(id, index); });
    pinned.sort(function (a, b) { return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0); });
    rest.sort(function (a, b) {
      var diff = (b.updatedAt || 0) - (a.updatedAt || 0);
      if (diff !== 0) return diff;
      return a.id < b.id ? -1 : 1;
    });
    return pinned.concat(rest);
  }

  // 官方侧栏的相对时间文案（time.now/minutes/hours/days/months/years + ago）
  function relativeTime(t, updatedAt) {
    var stamp = Number(updatedAt) || 0;
    if (stamp <= 0) return "";
    var diff = Date.now() - stamp;
    if (diff < 60e3) return t("timeNow");
    if (diff < 3600e3) return t("timeAgo", { t: t("timeMinutes", { n: Math.floor(diff / 60e3) }) });
    if (diff < 86400e3) return t("timeAgo", { t: t("timeHours", { n: Math.floor(diff / 3600e3) }) });
    if (diff < 30 * 86400e3) return t("timeAgo", { t: t("timeDays", { n: Math.floor(diff / 86400e3) }) });
    if (diff < 365 * 86400e3) return t("timeAgo", { t: t("timeMonths", { n: Math.floor(diff / (30 * 86400e3)) }) });
    return t("timeAgo", { t: t("timeYears", { n: Math.floor(diff / (365 * 86400e3)) }) });
  }

  // 插件冲突修复开关：默认开。关闭后不再输出 .dig-* 那批覆盖规则。
  var dedigEnabled = true;

  // ── 侧栏导航结构锚点 ──────────────────────────────────────────────
  // 背景：CSS module 的哈希前缀（_2gh8Yq_ 这类）每次 DSH 升级都可能变，
  // 只靠 [class*="panelList"] 这种子串匹配，改名一次就失效（2.0.23 已中过一次）。
  // 做法：按「结构特征」找出侧栏导航，打上 data-dst-nav；样式挂在这个属性上。
  // 结构特征：<nav>、内部按钮 ≥2、宽 ≥120px、贴窗口左侧（left < 320px）。
  // React 重建 nav 后属性会丢，由 MutationObserver + 低频兜底重新打标。
  var NAV_MARK = "data-dst-nav";
  function findPanelNav() {
    var navs = document.querySelectorAll("nav");
    var best = null;
    for (var i = 0; i < navs.length; i++) {
      var n = navs[i];
      var count = n.querySelectorAll("button").length;
      if (count < 2) continue;
      var r = n.getBoundingClientRect();
      if (r.width < 120 || r.left > 320) continue;
      if (best === null || count > best.count) best = { el: n, count: count };
    }
    return best === null ? null : best.el;
  }
  function markPanelNav() {
    try {
      if (document.querySelector("nav[" + NAV_MARK + "]") !== null) return;
      var nav = findPanelNav();
      if (nav !== null) nav.setAttribute(NAV_MARK, "");
    } catch (e) { /* 打标失败不影响其它功能 */ }
  }
  function watchPanelNav() {
    if (typeof document === "undefined" || typeof MutationObserver === "undefined" || !document.body) {
      return function () {};
    }
    markPanelNav();
    var mo = new MutationObserver(function () {
      if (document.querySelector("nav[" + NAV_MARK + "]") === null) markPanelNav();
      ensureSidebarEntry();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    // 兜底：侧栏折叠/展开只改样式不产生结构变动，observer 收不到，低频补打一次。
    var timer = setInterval(function () {
      markPanelNav();
      ensureSidebarEntry();
    }, 2500);
    return function () {
      mo.disconnect();
      clearInterval(timer);
    };
  }

  // ── 侧栏「会话管理」入口 ─────────────────────────────────────────────
  // 勾选后往侧栏导航插一枚自己的按钮（纯 DOM，不依赖官方类名）。
  // 点击 = 打开设置并切到本插件注册的「会话管理」分页。
  // 定位链：侧栏账号入口 data-slot="sidebar.settings"（官方插槽，稳定）
  //        → 菜单项「设置 / Settings」→ 设置壳内的同名分页按钮。
  var SIDEBAR_ENTRY_MARK = "data-dst-session-entry";
  var sidebarBtnEnabled = false;
  // 文案走 apply 里绑定的 t：字典是 apply 中后注册的，这里不能提前取值（会拿到裸 key）。
  var sidebarEntryLabelFn = null;
  function sidebarEntryLabelText() {
    try {
      return sidebarEntryLabelFn === null ? "会话管理" : sidebarEntryLabelFn();
    } catch (e) { return "会话管理"; }
  }

  function lastDialogEl() {
    var dialogs = document.querySelectorAll('[role="dialog"]');
    return dialogs.length === 0 ? null : dialogs[dialogs.length - 1];
  }
  function findSectionButton() {
    var dialog = lastDialogEl();
    if (dialog === null) return null;
    var btns = dialog.querySelectorAll("button");
    for (var i = 0; i < btns.length; i++) {
      var text = (btns[i].textContent || "").replace(/\s+/g, " ").trim();
      if (text === "会话管理" || text === "Session manager") return btns[i];
    }
    return null;
  }
  function openSessionManager() {
    var section = findSectionButton();
    if (section !== null) { section.click(); return; }
    // 设置没开：点账号入口打开菜单，再点「设置」，最后等设置壳渲染出来点分页。
    var host = document.querySelector('[data-slot="sidebar.settings"]');
    var trigger = host === null ? null : host.querySelector("button");
    if (trigger === null) return;
    trigger.click();
    var tries = 0;
    var tick = function () {
      tries++;
      var target = findSectionButton();
      if (target !== null) { target.click(); return; }
      var menu = document.querySelectorAll('[role="menuitem"]');
      for (var i = 0; i < menu.length; i++) {
        var text = (menu[i].textContent || "").replace(/\s+/g, " ").trim();
        if (/^(设置|Settings)/.test(text)) { menu[i].click(); break; }
      }
      if (tries < 40) setTimeout(tick, 50);
    };
    setTimeout(tick, 150);
  }
  function ensureSidebarEntry() {
    try {
      if (typeof document === "undefined") return;
      var existing = document.querySelector("[" + SIDEBAR_ENTRY_MARK + "]");
      if (sidebarBtnEnabled !== true) {
        if (existing !== null) existing.remove();
        return;
      }
      var nav = document.querySelector("nav[" + NAV_MARK + "]");
      if (nav === null) return;
      var text = sidebarEntryLabelText();
      // 入口排在「更多」前面（用户要求）；找不到「更多」就追加到末尾。
      var moreEntry = null;
      for (var i = 0; i < nav.children.length; i++) {
        var childText = (nav.children[i].textContent || "").replace(/\s+/g, " ").trim();
        if (/^(更多|More)$/.test(childText)) { moreEntry = nav.children[i]; break; }
      }
      if (existing !== null && existing.parentElement === nav) {
        // 语言切换/字典晚注册时只更新文案，不重建节点（避免抢焦点）
        if (existing.getAttribute("data-dst-label") !== text) {
          existing.setAttribute("data-dst-label", text);
          existing.title = text;
          var old = existing.querySelector(".dst_navEntryLabel");
          if (old !== null) old.textContent = text;
        }
        // React 重排后位置可能变，这里把入口顶回「更多」前面（幂等）
        if (moreEntry !== null && existing.nextElementSibling !== moreEntry) {
          nav.insertBefore(existing, moreEntry);
        }
        return;
      }
      if (existing !== null) existing.remove();
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dst_navEntry";
      btn.setAttribute(SIDEBAR_ENTRY_MARK, "");
      btn.setAttribute("data-dst-label", text);
      btn.title = text;
      var icon = document.createElement("span");
      icon.className = "dst_navEntryIcon";
      icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>';
      var label = document.createElement("span");
      label.className = "dst_navEntryLabel";
      label.textContent = text;
      btn.appendChild(icon);
      btn.appendChild(label);
      btn.addEventListener("click", openSessionManager);
      nav.insertBefore(btn, moreEntry);
    } catch (e) { /* 注入失败不影响其它功能 */ }
  }

  function installStyles(force) {
    if (typeof document === "undefined") return;
    var existing = document.querySelector("style[data-plugin-css=" + JSON.stringify("dsh-session-tools/section.css") + "]");
    if (existing !== null && force !== true) return;
    if (existing !== null) existing.remove();
    var tag = document.createElement("style");
    tag.dataset.plugin = "dsh-session-tools";
    tag.dataset.pluginCss = "dsh-session-tools/section.css";
    tag.textContent = ".dst_batchTrigger{width:28px;height:28px;flex:none;color:var(--dsw-alias-label-primary);background:transparent;border:none;border-radius:8px;align-items:center;justify-content:center;display:inline-flex;cursor:pointer}" +
      ".dst_batchTrigger:hover{background:var(--dsw-alias-interactive-bg-hover)}" +
      ".dst_batchBar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:8px}" +
      ".dst_batchSelectAll{cursor:pointer;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-button-elevated-fill);color:var(--dsw-alias-label-primary);border-radius:8px;padding:4px 10px;font-size:12px}" +
      ".dst_batchList{max-height:320px;overflow:auto;display:flex;flex-direction:column;gap:12px}" +
      ".dst_batchGroupTitle{font-size:12px;color:var(--dsw-alias-label-tertiary);margin-bottom:2px}" +
      ".dst_batchRow{display:flex;align-items:center;gap:8px;padding:4px 0;cursor:pointer}" +
      ".dst_batchRowTitle{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".dst_batchRow .dst_batchRowTitle{flex:1 1 auto}" +
      ".dst_batchRowTime{color:var(--dsw-alias-label-caption);flex:none;font-size:10px;line-height:16px}" +
      ".dst_batchPin{width:16px;height:20px;color:#f25a5a;flex:none;display:inline-flex;align-items:center;justify-content:center;margin-left:6px}" +
      ".dst_batchEmpty,.dst_batchNotice{margin-top:8px;font-size:12px;color:var(--dsw-alias-label-tertiary)}" +
      // 标题行强制单行：标题与「打开会话目录」不缩，两个勾选框排在右边；
      // 空间不够时只让勾选框文字省略，不换行（用户要求两个开关同一行）。
      ".dst_archHead{display:flex;align-items:center;gap:10px;flex-wrap:nowrap;margin:0 0 12px}" +
      ".dst_archTitle{flex:none}" +
      ".dst_archDirBtn{flex:none}" +
      ".dst_archTitle{margin:0;font-size:20px;font-weight:650;letter-spacing:-.2px}" +
      ".dst_archDirBtn{cursor:pointer;display:inline-flex;align-items:center;gap:6px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-button-elevated-fill);color:var(--dsw-alias-label-primary);border-radius:8px;padding:4px 10px;font:inherit;font-size:12px}" +
      ".dst_archDirBtn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}" +
      ".dst_archDirBtn:disabled{opacity:.5;cursor:default}" +
      ".dst_archDesc{margin:0 0 16px;max-width:46em;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}" +
      ".dst_archSearch{box-sizing:border-box;width:min(100%,320px);height:30px;padding:0 10px;margin-bottom:14px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-button-elevated-fill));border:1px solid var(--dsw-alias-border-l2);border-radius:8px;font:inherit;font-size:13px;outline:0}" +
      ".dst_archGroup{margin-bottom:16px}" +
      ".dst_archTabs{display:flex;gap:4px;margin:0 0 14px;border-bottom:1px solid var(--dsw-alias-border-l2);padding-bottom:8px}" +
      ".dst_archTab{cursor:pointer;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-tertiary);border-radius:6px;padding:3px 10px;font:inherit;font-size:13px}" +
      ".dst_archTab:hover{color:var(--dsw-alias-label-primary)}" +
      ".dst_archTabActive{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-button-elevated-fill));border-color:var(--dsw-alias-border-l2)}" +
      ".dst_archGroupTitle{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-tertiary);margin-bottom:6px}" +
      ".dst_archCaret{cursor:pointer;border:none;background:transparent;color:inherit;font:inherit;width:16px;height:16px;padding:0;line-height:1;display:inline-flex;align-items:center;justify-content:center}" +
      ".dst_archGroupName{cursor:pointer;border:none;background:transparent;color:inherit;font:inherit;font-size:12px;padding:0;text-align:left}" +
      ".dst_archGroupName:hover{color:var(--dsw-alias-label-primary)}" +
      ".dst_archGroupCheck{cursor:pointer;flex:none;margin:0}" +
      ".dst_archGroupCount{font-size:11px;color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums}" +
      ".dst_archRowMeta{flex:none;font-size:11px;color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums;white-space:nowrap}" +
      ".dst_archRow{display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}" +
      ".dst_archRowTitle{min-width:0;flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".dst_archRowActions{display:inline-flex;align-items:center;gap:8px;flex:none}" +
      ".dst_archAction{cursor:pointer;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-button-elevated-fill);color:var(--dsw-alias-label-primary);border-radius:6px;padding:2px 10px;font:inherit;font-size:12px}" +
      ".dst_archActionDanger{color:var(--dsw-alias-state-error-primary,#e5484d)!important;border-color:var(--dsw-alias-state-error-primary,#e5484d)!important}" +
      ".dst_archActionDanger:hover:not(:disabled){background:var(--dsw-alias-state-error-primary,#e5484d)!important;border-color:var(--dsw-alias-state-error-primary,#e5484d)!important;color:#fff!important}" +
      // 删除确认弹窗的「删除⏎」按钮：常态红字红边，hover 反白填充
      ".dst_dangerBtn{color:var(--dsw-alias-state-error-primary,#e5484d)!important;border-color:var(--dsw-alias-state-error-primary,#e5484d)!important}" +
      ".dst_dangerBtn:hover:not(:disabled){background:var(--dsw-alias-state-error-primary,#e5484d)!important;border-color:var(--dsw-alias-state-error-primary,#e5484d)!important;color:#fff!important}" +
      ".dst_archBar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}" +
      ".dst_archMeta{font-size:12px;color:var(--dsw-alias-label-tertiary)}" +
      // 官方侧栏头部按钮行 `.headerActions{max-width:60px;overflow:hidden}`（刚好两个按钮，
      // 搜索展开时靠 max-width 动画收起到 0）：加第三个按钮会把「添加工作区」裁掉。
      // 只在「可见态」放开 max-width，隐藏态（官方 headerActionsHidden）保持原样。
      ".dst_headerActions:not([class*=\"headerActionsHidden\"]){max-width:none;overflow:visible}" +
      // 置顶钉子改红：官方置顶 marker 的 svg 用 currentColor 填充，覆盖容器 color 即可（class 通配绕开 hash 前缀）
      "[class*=\"_pinIndicator\"]{color:#f25a5a}" +
      // 隐藏侧栏顶部品牌标识（logo + deepseek 字标 + HARNESS 徽标），保留左侧折叠按钮。
      // 用 class 子串匹配绕开 CSS module 的 hash 前缀。
      "[class*=\"brandIdentity\"]{display:none!important}" +
      // 品牌按钮隐藏后 logoRow 只剩折叠按钮（它本身定位在标题栏区域），
      // 行高直接收成 0，避免「新会话」上方留一条空白带。
      "button[class*=\"_brand\"]{display:none!important}" +
      "[class*=\"logoRow\"]{height:0!important;min-height:0!important;overflow:visible!important}" +
      // 侧栏导航改成两列：容器由竖向 flex 改成横向换行，每个条目占一半宽
      //（胶囊背景随宽度缩短），行高 36→32、间距 2→4。
      "[class*=\"panelList\"]{flex-direction:row!important;flex-wrap:wrap!important;gap:2px!important;height:auto!important}" +
      "[class*=\"panelList\"] > *{box-sizing:border-box!important;flex:1 1 calc(50% - 1px)!important;max-width:calc(50% - 1px)!important;min-width:0!important}" +
      "[class*=\"panelList\"] [class*=\"panelRow\"]{height:28px!important;min-height:28px!important;padding:4px 8px!important;box-sizing:border-box!important}" +
      "[class*=\"panelList\"] [class*=\"panelRow\"] span{min-width:0!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}" +
      // ── 侧栏导航：结构锚点版（抗 DSH 升级）─────────────────────────────
      // CSS module 的哈希前缀（_2gh8Yq_ 这类）每次升级都会变，只挂 class 子串迟早失效。
      // 客户端 JS 按结构找出侧栏 nav 并打上 data-dst-nav（React 重建后自动补打），
      // 这里把两列规则同时挂到该属性上，class 那条只当兜底。
      // 新版把每个条目包了一层 panelEntry（左右各 3px 装饰边框 + content-box），
      // 只设 max-width 会让两条 137px 挤不进 264px 容器 → 退化成单列；
      // 所以子项统一 box-sizing:border-box，宽度按 border-box 折半。
      "[data-dst-nav]{display:flex!important;flex-direction:row!important;flex-wrap:wrap!important;gap:2px!important;height:auto!important}" +
      "[data-dst-nav] > *{box-sizing:border-box!important;flex:1 1 calc(50% - 1px)!important;max-width:calc(50% - 1px)!important;min-width:0!important}" +
      "[data-dst-nav] button{height:28px!important;min-height:28px!important;padding:4px 8px!important;box-sizing:border-box!important}" +
      "[data-dst-nav] button span{min-width:0!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}" +
      // 侧栏「会话管理」入口（勾选后由 JS 插入，纯 DOM 节点，不吃官方类名）
      ".dst_navEntry{display:flex;align-items:center;gap:6px;width:100%;height:28px;padding:4px 8px;box-sizing:border-box;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;cursor:pointer;text-align:left;min-width:0}" +
      ".dst_navEntry:hover{background:var(--dsw-alias-interactive-bg-hover)}" +
      ".dst_navEntryIcon{display:inline-flex;flex:none;width:16px;height:16px;align-items:center;justify-content:center}" +
      ".dst_navEntryLabel{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      // 底部：账号行占左侧，远程控制挪到右侧同一行（原先是上下两行）
      "[class*=\"footArea\"]{flex-direction:row!important;align-items:center!important;gap:8px!important}" +
      "[class*=\"footArea\"] > [class*=\"footerActions\"]{order:2!important;flex:0 0 auto!important;width:auto!important;min-width:0!important}" +
      "[class*=\"footArea\"] > [class*=\"footerActions\"] > div{width:auto!important;height:auto!important}" +
      "[class*=\"footArea\"] > [class*=\"settingsArea\"]{order:1!important;flex:1 1 auto!important;width:auto!important;min-width:0!important}" +
      "[class*=\"footerActions\"] button{width:auto!important;height:28px!important;min-height:28px!important;padding:0 8px!important;box-sizing:border-box!important}" +
      // 账号胶囊跟着缩：宽度按内容（头像+昵称），高度与导航行一致（28px），不再拉满整行
      "[class*=\"settingsArea\"] button{width:auto!important;height:28px!important;min-height:28px!important;padding:0 8px!important;border-radius:8px!important;box-sizing:border-box!important}" +
      // ═══════════════════════════════════════════════════════════════════
      // 【插件冲突修复 · 开始 · 整块可删】
      // 冲突双方：
      //   · dsh-ide-git 0.30.0          —— Git 页签（正常应显示）
      //   · @copylee/dsh-image-gen 0.2.0 —— 「绘画」插件（污染源）
      // 现象：绘画插件使用同一套 .dig-* 类名并全局注入样式，把 Git 页签改坏：
      //   提交列被压成 112px / 分支徽章变 52×52 方块 / 搜索框被撑高到 289px /
      //   顶部下拉被拉满整行 / 各种 padding、高度错位。
      // 处理：只对 Git 页签容器（.dig-conversation-seat）内的元素，把布局属性
      //       还原成 dsh-ide-git 自己的原生值；绘画插件自己的页面完全不受影响。
      // 值来源：dsh-ide-git 0.30.0 的 src/client.js（逐条对照）。
      // ★ 开关：设置 →「会话管理」面板底部「修复 Git 页签与绘画插件的样式冲突」
      //   （存插件目录 compat.json，默认开；关闭后这段规则不再输出，即时生效）
      // ★ 卸载「绘画」插件后：把「开始」到「结束」之间的这一整段直接删掉即可，
      //   不会有任何残留依赖；也可以只把开关关掉（效果相同，代码留作以后复用）。
      // ★ dsh-ide-git 升级后：这些硬编码值可能过期，需要回来复核一遍。
      // ═══════════════════════════════════════════════════════════════════
      (dedigEnabled ? "" +
      "[class*=\"dig-conversation-seat\"] [class*=\"dig-history\"]{width:auto!important;flex:1 1 auto!important;min-width:0!important}" +
      "@media (max-width:900px){[class*=\"dig-conversation-seat\"] [class*=\"dig-history\"]{display:flex!important}}" +
      // 同一批冲突：绘画插件把 .dig-ref（它用作 52×52 的缩略图）也全局注入了，
      // 把 git 的分支/标签徽章撑成 52×52 方块、文字被裁掉。这里只恢复 git 的原生形状。
      "[class*=\"dig-conversation-seat\"] [class*=\"dig-ref\"]{width:auto!important;height:auto!important;border:0!important;border-radius:999px!important;background:var(--dsw-alias-interactive-bg-hover)!important;position:static!important}" +
      // ── 全量对齐：把两个插件所有「布局属性」冲突一次性还原成 git 的原生值 ──
      // 扫描方式：枚举两套样式表里所有 .dig-* 选择器，取同名属性不同值且属于布局属性的项。
      // 以下每条右侧都是 dsh-ide-git 自己的值，绘画插件只是在这个容器里被"盖回去"。
      "[class*=\"dig-conversation-seat\"] .dig-search{flex:0 0 auto!important}" +
      "[class*=\"dig-conversation-seat\"] .dig-select-wrap{display:inline-flex!important;position:static!important;width:auto!important;max-width:90%!important;flex:0 1 auto!important;min-width:0!important}" +
      "[class*=\"dig-conversation-seat\"] .dig-select{padding-right:6px!important}" +
      "[class*=\"dig-conversation-seat\"] .dig-icon-btn{width:24px!important;height:24px!important}" +
      "[class*=\"dig-conversation-seat\"] .dig-toast{padding:6px 8px!important}" +
      "[class*=\"dig-conversation-seat\"] .dig-tab{padding:2px 10px!important}" +
      "[class*=\"dig-conversation-seat\"] .dig-pick-list{max-height:300px!important}" +
      "[class*=\"dig-conversation-seat\"] .dig-pick-row{padding-top:4px!important;padding-bottom:4px!important}" +
      "[class*=\"dig-conversation-seat\"] .dig-badge{padding-left:5px!important;padding-right:5px!important}" +
      "[class*=\"dig-conversation-seat\"] .dig-empty{padding:14px!important}" +
      "[class*=\"dig-conversation-seat\"] .dig-textarea{padding:5px 6px!important;min-height:50px!important}" +
      "[class*=\"dig-conversation-seat\"] .dig-btn{padding:3px 10px!important}" +
      "[class*=\"dig-conversation-seat\"] .dig-overlay{position:absolute!important}" +
      "[class*=\"dig-conversation-seat\"] .dig-menu-item{padding-top:4px!important;padding-bottom:4px!important}" +
      // ── 第二批：绘画插件对 git 独有的"单边污染"（git 没声明、它声明了）──
      // 这些属性 git 原本走默认值，被它改写后会造成布局走样，这里逐一归位。
      "[class*=\"dig-conversation-seat\"] .dig-toast{position:static!important;left:auto!important;bottom:auto!important}" +
      "[class*=\"dig-conversation-seat\"] .dig-tab{height:auto!important}" +
      "[class*=\"dig-conversation-seat\"] .dig-btn{height:auto!important}" +
      "[class*=\"dig-conversation-seat\"] .dig-menu-item{min-height:0!important}" +
      "[class*=\"dig-conversation-seat\"] .dig-menu-label{padding:0!important}" +
      "[class*=\"dig-conversation-seat\"] .dig-pick-list{padding:0!important}" +
      "[class*=\"dig-conversation-seat\"] .dig-pick-row{min-height:0!important}" +
      "[class*=\"dig-conversation-seat\"] .dig-select{display:inline-block!important}" +
      "[class*=\"dig-conversation-seat\"] .dig-empty{display:block!important;grid-column:auto!important}" +
      "[class*=\"dig-conversation-seat\"] .dig-busy{display:inline!important;flex-direction:row!important}" +
      "[class*=\"dig-conversation-seat\"] .dig-settings{height:auto!important;min-height:0!important;overflow:visible!important}" +
      "[class*=\"dig-conversation-seat\"] .dig-settings-list{width:auto!important;flex:0 1 auto!important}" +
      // ── 第三批：跨选择器的污染（绘画用 `.dig-x .dig-y` / 元素选择器命中 git）──
      "[class*=\"dig-conversation-seat\"] .dig-input{height:auto!important;padding:4px 6px!important}" +
      "[class*=\"dig-conversation-seat\"] .dig-search .dig-input{padding-left:6px!important}" +
      "[class*=\"dig-conversation-seat\"] .dig-card{position:static!important;overflow:visible!important}" +
      "[class*=\"dig-conversation-seat\"] .dig-menu button{min-height:0!important}"
      // ═══════════════════════════════════════════════════════════════════
      // 【插件冲突修复 · 结束 · 以上整块可删】
      // ═══════════════════════════════════════════════════════════════════
      : "") +
      ".dst_archToggleInline{display:inline-flex;align-items:center;gap:6px;font-size:12px;line-height:16px;color:var(--dsw-alias-label-tertiary);cursor:pointer;user-select:none;white-space:nowrap;min-width:0}" +
      ".dst_archToggleInline > span{min-width:0;overflow:hidden;text-overflow:ellipsis}" +
      // 会话行收紧：行高 32→21、圆角 12→8。胶囊背景就是行本身（选中/悬停时行背景），
      // 所以行矮了胶囊跟着矮，不会出现"背景比内容大一圈"。
      // 内容行高 20px，21px 只留 0.5px 上下余量——再往下会切字。
      "div[data-row-key^=\"session:\"]{height:21px!important;border-radius:8px!important}";
    document.head.appendChild(tag);
  }

  // ── 删除确认弹窗（shell.overlay）──
  // 请求体：{ sessionIds, description }；确认按钮文案「删除⏎」，打开期间 Enter 直接确认。
  function SessionDeleteConfirmDialog(props) {
    var t = props.t;
    var request = props.useDeleteRequest(function (pending) { return pending; });
    var busyPair = React.useState(false);
    var busy = busyPair[0];
    var setBusy = busyPair[1];
    React.useEffect(function () {
      if (request === null) return;
      var onKey = function (event) {
        if (event.key !== "Enter" || event.isComposing) return;
        var target = event.target;
        if (target && target.closest && target.closest('button, a, input, textarea, select, [contenteditable="true"]')) return;
        event.preventDefault();
        // 点里面的按钮本体：包一层 span 只是为了挂 data 标记，点 span 不会触发 onClick
        var button = document.querySelector("[data-dsh-session-tools-confirm] button");
        if (button !== null) button.click();
      };
      document.addEventListener("keydown", onKey);
      return function () { document.removeEventListener("keydown", onKey); };
    }, [request]);
    if (request === null) return null;
    return (0, react_jsx_runtime.jsx)(_primitives.Modal, {
      open: true,
      onClose: function () {
        if (!busy) props.settleDeleteRequest();
      },
      closeLabel: t("close"),
      title: t("deleteTitle"),
      description: request.description,
      footer: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
        (0, react_jsx_runtime.jsx)(_primitives.Button, {
          variant: "outline",
          disabled: busy,
          onClick: function () { props.settleDeleteRequest(); },
          children: t("cancel")
        }),
        (0, react_jsx_runtime.jsx)("span", { "data-dsh-session-tools-confirm": "1", children: (0, react_jsx_runtime.jsx)(_primitives.Button, {
          variant: "outline",
          className: "dst_dangerBtn",
          disabled: busy,
          onClick: function () {
            setBusy(true);
            props.confirmDelete(request.sessionIds).finally(function () {
              setBusy(false);
              props.settleDeleteRequest();
            });
          },
          children: t("deleteConfirm")
        }) })
      ] }),
      children: busy && (0, react_jsx_runtime.jsx)("div", { role: "status", children: t("deleting") })
    });
  }

  // ── 右键菜单「删除会话」（sidebar.workspaces.session.menu.item）──
  function SessionDeleteMenuItem(props) {
    var t = props.t;
    var statePair = props.useMenuOpenState();
    var setMenuOpen = statePair[1];
    return (0, react_jsx_runtime.jsx)(_primitives.MenuItemButton, {
      icon: (0, react_jsx_runtime.jsx)(_primitives.IconTrashOutlineRegular, { size: 14 }),
      onSelect: function () {
        setMenuOpen(false);
        props.requestSessionDelete(props.sessionId);
      },
      children: t("deleteMenu")
    });
  }

  // ── 批量面板（shell.overlay）──
  function BatchPanel(props) {
    var t = props.t;
    var open = props.useBatchOpen(function (value) { return value; });
    var ids = props.useBatchIds(function (value) { return value; });
    var sessions = props.useSessions(function (state) { return state; });
    var workspaces = props.useWorkspaces(function (state) { return state; });
    var busyPair = React.useState(false);
    var busy = busyPair[0];
    var setBusy = busyPair[1];
    var noticePair = React.useState(null);
    var notice = noticePair[0];
    var setNotice = noticePair[1];
    React.useEffect(function () { installStyles(); }, []);
    if (!open) return null;
    var archived = new Set(workspaces.archivedSessionIds || []);
    var groups = [];
    var seen = new Set();
    (workspaces.items || []).forEach(function (workspace) {
      var rows = [];
      (workspace.sessionIds || []).forEach(function (sessionId) {
        var summary = sessions.byId ? sessions.byId[sessionId] : void 0;
        if (summary === void 0 || summary.blank === true || archived.has(sessionId) || seen.has(sessionId)) return;
        seen.add(sessionId);
        rows.push(summary);
      });
      if (rows.length > 0) groups.push({ key: workspace.workspaceId, label: workspace.title || workspace.path || workspace.workspaceId, rows: rows });
    });
    var ungrouped = [];
    (sessions.ids || []).forEach(function (sessionId) {
      var summary = sessions.byId ? sessions.byId[sessionId] : void 0;
      if (summary === void 0 || summary.blank === true || archived.has(sessionId) || seen.has(sessionId)) return;
      seen.add(sessionId);
      ungrouped.push(summary);
    });
    if (ungrouped.length > 0) groups.push({ key: "ungrouped", label: t("ungrouped"), rows: ungrouped });
    var pinnedIds = workspaces.pinnedSessionIds || [];
    var pinnedSet = new Set(pinnedIds);
    groups = groups.map(function (group) {
      var ordered = sortLikeSidebar(group.rows, pinnedIds);
      return { key: group.key, label: group.label, rows: ordered };
    });
    var selectable = groups.reduce(function (all, group) { return all.concat(group.rows.map(function (row) { return row.id; })); }, []);
    var selected = selectable.filter(function (sessionId) { return ids.has(sessionId); });
    // 「全选」只选非置顶会话：置顶的默认跳过，要动就单独勾
    var selectableUnpinned = selectable.filter(function (sessionId) { return !pinnedSet.has(sessionId); });
    var allSelected = selectableUnpinned.length > 0 && selectableUnpinned.every(function (sessionId) { return ids.has(sessionId); });
    var titleOf = function (row) { return row.blank ? t("newSession") : (row.title || row.displayTitle || row.id); };
    var runAction = function (action) {
      setBusy(true);
      setNotice(null);
      return action(selected).then(function (result) {
        setNotice(t("result", { ok: result.ok, fail: result.fail }));
        props.setBatchIds(selectable.filter(function (sessionId) { return selected.indexOf(sessionId) === -1; }));
      }).finally(function () { setBusy(false); });
    };
    return (0, react_jsx_runtime.jsx)(_primitives.Modal, {
      open: true,
      onClose: function () { if (!busy) props.closeBatch(); },
      closeLabel: t("close"),
      title: t("batch"),
      footer: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
        (0, react_jsx_runtime.jsx)(_primitives.Button, { variant: "outline", disabled: busy, onClick: function () { props.closeBatch(); }, children: t("cancel") }),
        (0, react_jsx_runtime.jsx)(_primitives.Button, { variant: "outline", disabled: busy || selected.length === 0, onClick: function () { runAction(props.archiveSelected); }, children: t("archiveSelected") }),
        (0, react_jsx_runtime.jsx)(_primitives.Button, { variant: "outline", disabled: busy || selected.length === 0, onClick: function () { props.requestBatchDelete(selected); }, children: t("deleteSelected") })
      ] }),
      children: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
        (0, react_jsx_runtime.jsxs)("div", { className: "dst_batchBar", children: [
          (0, react_jsx_runtime.jsx)("span", { children: t("selectedCount", { n: selected.length }) }),
          (0, react_jsx_runtime.jsx)("button", {
            type: "button",
            className: "dst_batchSelectAll",
            disabled: busy || selectable.length === 0,
            onClick: function () { props.setBatchIds(allSelected ? [] : selectableUnpinned); },
            children: t(allSelected ? "clearAll" : "selectAll")
          })
        ] }),
        selectable.length === 0
          ? (0, react_jsx_runtime.jsx)("div", { className: "dst_batchEmpty", children: t("empty") })
          : (0, react_jsx_runtime.jsx)("div", { className: "dst_batchList", children: groups.map(function (group) {
            return (0, react_jsx_runtime.jsxs)("div", { children: [
              (0, react_jsx_runtime.jsx)("div", { className: "dst_batchGroupTitle", children: group.label }),
              group.rows.map(function (row) {
                var pinned = pinnedSet.has(row.id);
                return (0, react_jsx_runtime.jsxs)("label", { className: "dst_batchRow" + (pinned ? " dst_batchRowPinned" : ""), children: [
                  (0, react_jsx_runtime.jsx)("input", {
                    type: "checkbox",
                    checked: ids.has(row.id),
                    disabled: busy,
                    "aria-label": t("selectSession", { name: titleOf(row) }),
                    onChange: function () { props.toggleBatchId(row.id); }
                  }),
                  (0, react_jsx_runtime.jsx)("span", { className: "dst_batchRowTitle", children: titleOf(row) }),
                  (0, react_jsx_runtime.jsx)("span", { className: "dst_batchRowTime", children: relativeTime(t, row.updatedAt) }),
                  pinned ? (0, react_jsx_runtime.jsx)("span", { className: "dst_batchPin", title: t("pinned"), children: (0, react_jsx_runtime.jsx)(_primitives.IconPinFillRegular, { size: 12 }) }) : null
                ] }, row.id);
              })
            ] }, group.key);
          }) }),
        busy && (0, react_jsx_runtime.jsx)("div", { role: "status", children: t("pending") }),
        notice !== null && (0, react_jsx_runtime.jsx)("div", { className: "dst_batchNotice", role: "status", children: notice })
      ] })
    });
  }

  // 会话行的更新时间与体积文案：时间按本地时区 MM-DD HH:mm，体积按 MB（一位小数）。
  function formatStamp(ms) {
    if (typeof ms !== "number" || !isFinite(ms) || ms <= 0) return "--";
    var d = new Date(ms);
    var p = function (n) { return n < 10 ? "0" + n : String(n); };
    return p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function formatSizeMb(bytes) {
    if (typeof bytes !== "number" || !isFinite(bytes) || bytes <= 0) return "--";
    var mb = bytes / (1024 * 1024);
    if (mb < 0.05) return "<0.1MB";
    return mb.toFixed(1) + "MB";
  }

  // ── 设置区「会话管理」（settings.section，order 105）──
  // 两个视图共用一套分组渲染：
  //   · 全部会话：按工作区分组，行内只给「归档」
  //   · 已归档：按工作区分组，行内给「取消归档 / 删除」
  // 工作区名点击 = 全选该组（再点取消），左侧箭头折叠分组。
  // 每行前面显示「MM-DD HH:mm · 体积MB」，体积走 host RPC（sessionPersistence.list 的 sizeBytes）。
  function ArchivedSection(props) {
    var t = props.t;
    var sessions = props.useSessions(function (state) { return state; });
    var workspaces = props.useWorkspaces(function (state) { return state; });
    var viewPair = React.useState("all");
    var view = viewPair[0];
    var setView = viewPair[1];
    var queryPair = React.useState("");
    var query = queryPair[0];
    var setQuery = queryPair[1];
    var selectedPair = React.useState(function () { return new Set(); });
    var selected = selectedPair[0];
    var setSelected = selectedPair[1];
    var collapsedPair = React.useState(function () { return new Set(); });
    var collapsed = collapsedPair[0];
    var setCollapsed = collapsedPair[1];
    var sizesPair = React.useState({});
    var sizes = sizesPair[0];
    var setSizes = sizesPair[1];
    var busyPair = React.useState(false);
    var busy = busyPair[0];
    var setBusy = busyPair[1];
    var noticePair = React.useState(null);
    var notice = noticePair[0];
    var setNotice = noticePair[1];
    // 兼容修复开关（dsh-ide-git × 绘画插件）：真实值存在 host 的 compat.json
    var dedigPair = React.useState(dedigEnabled);
    var dedig = dedigPair[0];
    var setDedig = dedigPair[1];
    var toggleDedig = function (next) {
      setDedig(next);
      dedigEnabled = next;
      installStyles(true);
      wireCall("sessionTools", "setCompat", { enabled: next }).catch(function () { /* 写失败只影响下次启动 */ });
    };
    // 侧栏入口开关：勾选后主界面侧栏出现「会话管理」按钮
    var sidebarPair = React.useState(sidebarBtnEnabled);
    var sidebarOn = sidebarPair[0];
    var setSidebarOn = sidebarPair[1];
    var toggleSidebar = function (next) {
      setSidebarOn(next);
      sidebarBtnEnabled = next;
      ensureSidebarEntry();
      wireCall("sessionTools", "setSidebarButton", { enabled: next }).catch(function () { /* 写失败只影响下次启动 */ });
    };
    var reloadSizes = function () {
      wireCall("sessionTools", "getSessionSizes", {}).then(function (map) {
        if (map && typeof map === "object") setSizes(map);
      }).catch(function () { /* 拿不到大小不影响其它功能 */ });
    };
    React.useEffect(function () {
      installStyles();
      reloadSizes();
      wireCall("sessionTools", "getCompat", {}).then(function (value) {
        setDedig(!(value && value.dedig === false));
        setSidebarOn(value !== null && value !== void 0 && value.sidebarButton === true);
      }).catch(function () { /* 读失败保留默认开 */ });
    }, []);
    var byId = sessions.byId || {};
    var items = workspaces.items || [];
    var archivedSet = new Set(workspaces.archivedSessionIds || []);
    var workspaceOf = function (sessionId) {
      for (var i = 0; i < items.length; i++) {
        if ((items[i].sessionIds || []).indexOf(sessionId) !== -1) return items[i];
      }
      return void 0;
    };
    var needle = query.toLowerCase();
    var rows = [];
    var seen = new Set();
    var push = function (sessionId, workspace) {
      if (seen.has(sessionId)) return;
      var summary = byId[sessionId];
      if (summary === void 0 || summary === null || summary.blank === true) return;
      var isArchived = archivedSet.has(sessionId);
      if (view === "archived" ? !isArchived : isArchived) return;
      var title = summary.title || summary.displayTitle || sessionId;
      if (needle.length > 0 && title.toLowerCase().indexOf(needle) === -1) return;
      seen.add(sessionId);
      rows.push({ id: sessionId, title: title, updatedAt: summary.updatedAt || 0, workspace: workspace });
    };
    items.forEach(function (workspace) {
      (workspace.sessionIds || []).forEach(function (sessionId) { push(sessionId, workspace); });
    });
    (sessions.ids || []).forEach(function (sessionId) { push(sessionId, workspaceOf(sessionId)); });
    var order = [];
    var table = new Map();
    rows.forEach(function (row) {
      var key = row.workspace === void 0 ? "__ungrouped__" : row.workspace.workspaceId;
      if (!table.has(key)) {
        table.set(key, []);
        order.push(key);
      }
      table.get(key).push(row);
    });
    var groups = order.map(function (key) {
      var label = key === "__ungrouped__" ? t("ungrouped") : (function () {
        var hit = items.filter(function (item) { return item.workspaceId === key; })[0];
        return hit === void 0 ? key : (hit.title || hit.path || key);
      })();
      return {
        key: key,
        label: label,
        rows: table.get(key).slice().sort(function (a, b) { return b.updatedAt - a.updatedAt; })
      };
    });
    var visible = rows.map(function (row) { return row.id; });
    var picked = visible.filter(function (sessionId) { return selected.has(sessionId); });
    var allSelected = visible.length > 0 && picked.length === visible.length;
    var runAction = function (action, sessionIds) {
      setBusy(true);
      setNotice(null);
      return action(sessionIds).then(function (result) {
        setNotice(t("result", { ok: result.ok, fail: result.fail }));
        setSelected(new Set());
        reloadSizes();
      }).finally(function () { setBusy(false); });
    };
    var toggle = function (sessionId) {
      var next = new Set(selected);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      setSelected(next);
    };
    var toggleGroup = function (group) {
      var allIn = group.rows.every(function (row) { return selected.has(row.id); });
      var next = new Set(selected);
      group.rows.forEach(function (row) {
        if (allIn) next.delete(row.id);
        else next.add(row.id);
      });
      setSelected(next);
    };
    var toggleCollapse = function (key) {
      var next = new Set(collapsed);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      setCollapsed(next);
    };
    var switchView = function (next) {
      if (next === view) return;
      setView(next);
      setSelected(new Set());
      setNotice(null);
    };
    // 打开会话目录：host 返回会话存储根目录，客户端交给官方 remote.session 打开
    var openSessionDir = function () {
      setNotice(null);
      wireCall("sessionTools", "getSessionsRoot", {}).then(function (root) {
        if (typeof root !== "string" || root.length === 0) throw new Error("sessions root unavailable");
        return props.openSessionsDir(root);
      }).catch(function (reason) {
        setNotice(t("openSessionsDirFailed") + String((reason && reason.message) || reason));
      });
    };
    var tab = function (id, label) {
      return (0, react_jsx_runtime.jsx)("button", {
        type: "button",
        className: "dst_archTab" + (view === id ? " dst_archTabActive" : ""),
        "aria-pressed": view === id,
        onClick: function () { switchView(id); },
        children: label
      }, id);
    };
    var rowActions = function (row) {
      if (view === "archived") {
        return (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
          (0, react_jsx_runtime.jsx)("button", {
            type: "button",
            className: "dst_archAction",
            disabled: busy,
            onClick: function () { runAction(props.restoreSessions, [row.id]); },
            children: t("archRestore")
          }),
          (0, react_jsx_runtime.jsx)("button", {
            type: "button",
            className: "dst_archAction dst_archActionDanger",
            disabled: busy,
            onClick: function () { props.requestDelete([row.id]); },
            children: t("archDelete")
          })
        ] });
      }
      return (0, react_jsx_runtime.jsx)("button", {
        type: "button",
        className: "dst_archAction",
        disabled: busy,
        onClick: function () { runAction(props.archiveSessions, [row.id]); },
        children: t("archArchive")
      });
    };
    return (0, react_jsx_runtime.jsxs)("div", { children: [
      (0, react_jsx_runtime.jsxs)("div", { className: "dst_archHead", children: [
        (0, react_jsx_runtime.jsx)("h2", { className: "dst_archTitle", children: t("archTitle") }),
        (0, react_jsx_runtime.jsxs)("button", {
          type: "button",
          className: "dst_archDirBtn",
          disabled: busy,
          onClick: openSessionDir,
          children: [
            (0, react_jsx_runtime.jsx)(_primitives.IconFolderOpenOutlineRegular, { size: 14 }),
            (0, react_jsx_runtime.jsx)("span", { children: t("openSessionsDir") })
          ]
        }),
        // 兼容修复开关：紧挨「打开会话目录」按钮
        (0, react_jsx_runtime.jsxs)("label", { className: "dst_archToggleInline", children: [
          (0, react_jsx_runtime.jsx)("input", {
            type: "checkbox",
            checked: dedig === true,
            onChange: function (event) { toggleDedig(event.target.checked === true); }
          }),
          (0, react_jsx_runtime.jsx)("span", { children: t("compatDedig") })
        ] }),
        // 侧栏入口开关：勾选后主界面侧栏出现「会话管理」按钮，点它直接跳到本页
        (0, react_jsx_runtime.jsxs)("label", { className: "dst_archToggleInline", children: [
          (0, react_jsx_runtime.jsx)("input", {
            type: "checkbox",
            checked: sidebarOn === true,
            onChange: function (event) { toggleSidebar(event.target.checked === true); }
          }),
          (0, react_jsx_runtime.jsx)("span", { children: t("sidebarButton") })
        ] })
      ] }),
      (0, react_jsx_runtime.jsx)("p", { className: "dst_archDesc", children: t("archDesc") }),
      (0, react_jsx_runtime.jsxs)("div", { className: "dst_archTabs", children: [
        tab("all", t("tabAll")),
        tab("archived", t("tabArchived"))
      ] }),
      (0, react_jsx_runtime.jsx)("input", {
        className: "dst_archSearch",
        type: "text",
        value: query,
        placeholder: t("archSearch"),
        onChange: function (event) { setQuery(event.target.value); }
      }),
      (0, react_jsx_runtime.jsxs)("div", { className: "dst_archBar", children: [
        (0, react_jsx_runtime.jsx)("span", { className: "dst_archMeta", children: t("selectedCount", { n: picked.length }) }),
        (0, react_jsx_runtime.jsx)("button", {
          type: "button",
          className: "dst_archAction",
          disabled: busy || visible.length === 0,
          onClick: function () { setSelected(new Set(allSelected ? [] : visible)); },
          children: t(allSelected ? "clearAll" : "selectAll")
        }),
        view === "archived"
          ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
            (0, react_jsx_runtime.jsx)("button", {
              type: "button",
              className: "dst_archAction",
              disabled: busy || picked.length === 0,
              onClick: function () { runAction(props.restoreSessions, picked); },
              children: t("archRestoreSelected")
            }),
            (0, react_jsx_runtime.jsx)("button", {
              type: "button",
              className: "dst_archAction dst_archActionDanger",
              disabled: busy || picked.length === 0,
              onClick: function () { props.requestDelete(picked); },
              children: t("archDeleteSelected")
            })
          ] })
          : (0, react_jsx_runtime.jsx)("button", {
            type: "button",
            className: "dst_archAction",
            disabled: busy || picked.length === 0,
            onClick: function () { runAction(props.archiveSessions, picked); },
            children: t("archArchiveSelected")
          }),
        busy && (0, react_jsx_runtime.jsx)("span", { className: "dst_archMeta", children: t("pending") }),
        notice !== null && (0, react_jsx_runtime.jsx)("span", { className: "dst_archMeta", role: "status", children: notice })
      ] }),
      rows.length === 0
        ? (0, react_jsx_runtime.jsx)("div", { className: "dst_batchEmpty", children: t("archEmpty") })
        : groups.map(function (group) {
          var isCollapsed = collapsed.has(group.key);
          var allIn = group.rows.length > 0 && group.rows.every(function (row) { return selected.has(row.id); });
          var someIn = group.rows.some(function (row) { return selected.has(row.id); });
          return (0, react_jsx_runtime.jsxs)("div", { className: "dst_archGroup", children: [
            (0, react_jsx_runtime.jsxs)("div", { className: "dst_archGroupTitle", children: [
              (0, react_jsx_runtime.jsx)("input", {
                type: "checkbox",
                className: "dst_archGroupCheck",
                checked: allIn,
                disabled: busy || group.rows.length === 0,
                "aria-label": t("selectAll"),
                ref: function (el) { if (el !== null && el !== void 0) el.indeterminate = someIn && !allIn; },
                onChange: function () { toggleGroup(group); }
              }),
              (0, react_jsx_runtime.jsx)("button", {
                type: "button",
                className: "dst_archCaret",
                disabled: busy,
                "aria-label": isCollapsed ? t("grpExpand") : t("grpCollapse"),
                "aria-expanded": !isCollapsed,
                onClick: function () { toggleCollapse(group.key); },
                children: (0, react_jsx_runtime.jsx)(isCollapsed ? _primitives.IconChevronRightOutlineRegular : _primitives.IconChevronDownOutlineRegular, { size: 12 })
              }),
              (0, react_jsx_runtime.jsx)("button", {
                type: "button",
                className: "dst_archGroupName",
                disabled: busy,
                title: isCollapsed ? t("grpExpand") : t("grpCollapse"),
                onClick: function () { toggleCollapse(group.key); },
                children: group.label
              }),
              (0, react_jsx_runtime.jsx)("span", { className: "dst_archGroupCount", children: "(" + group.rows.length + ")" })
            ] }),
            isCollapsed ? null : group.rows.map(function (row) {
              return (0, react_jsx_runtime.jsxs)("div", { className: "dst_archRow", children: [
                (0, react_jsx_runtime.jsx)("input", {
                  type: "checkbox",
                  checked: selected.has(row.id),
                  disabled: busy,
                  "aria-label": t("selectSession", { name: row.title }),
                  onChange: function () { toggle(row.id); }
                }),
                (0, react_jsx_runtime.jsx)("span", { className: "dst_archRowMeta", children: formatStamp(row.updatedAt) + " · " + formatSizeMb(sizes[row.id]) }),
                (0, react_jsx_runtime.jsx)("span", { className: "dst_archRowTitle", title: row.title, children: row.title }),
                (0, react_jsx_runtime.jsx)("span", { className: "dst_archRowActions", children: rowActions(row) })
              ] }, row.id);
            })
          ] }, group.key);
        })
    ] });
  }

  // ── 会话右键菜单（跟着鼠标位置）──
  // 官方菜单只从行尾「操作」按钮弹出，不走右键；这里在会话行上拦截 contextmenu，
  // 用官方 Menu 的 anchorPoint（视口坐标）把菜单放到鼠标位置弹出。
  // 条目与官方菜单对齐：置顶会话 / 重命名 / 分叉会话 / 归档会话 / 删除会话。
  function SessionContextMenu(props) {
    var t = props.t;
    var request = props.useContextRequest(function (value) { return value; });
    React.useEffect(function () {
      if (request === null) return;
      // 开菜单后 250ms 内的滚动一律忽略：右键那一瞬间列表可能还在惯性滚动、
      // 或被聚焦/布局效应带着动一下，立刻关闭会让菜单"频闪"（长标题更明显，
      // 用户实测：右键压根打不开）。宽限之后再滚动，只有真正发生位移才关。
      var openedAt = Date.now();
      var seen = new Map();
      var onScroll = function (event) {
        if (Date.now() - openedAt < 250) return;
        var target = event.target;
        if (target !== null && target !== void 0 && target !== document && typeof target.scrollTop === "number") {
          // 只看纵向位移：官方侧栏的标题走马灯（hover 时动 title.scrollLeft）会不停
          // 触发 scroll 事件，按 scrollLeft 判断会把刚打开的菜单立刻关掉。
          var last = seen.get(target);
          seen.set(target, target.scrollTop);
          if (last === void 0 || last === target.scrollTop) return;
        }
        props.closeContext();
      };
      var onResize = function () { props.closeContext(); };
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener("resize", onResize);
      return function () {
        window.removeEventListener("scroll", onScroll, true);
        window.removeEventListener("resize", onResize);
      };
    }, [request]);
    if (request === null) return null;
    var items = [];
    if (request.blank !== true) {
      items.push({
        id: request.pinned ? "unpin" : "pin",
        label: t(request.pinned ? "ctxUnpin" : "ctxPin"),
        icon: (0, react_jsx_runtime.jsx)(_primitives.IconPinOutlineRegular, {})
      });
      items.push({
        id: "openExplorer",
        label: t("ctxOpenExplorer"),
        icon: (0, react_jsx_runtime.jsx)(_primitives.IconFolderOpenOutlineRegular, {}),
        disabled: typeof request.path !== "string" || request.path.length === 0
      });
      items.push({
        id: "copyRef",
        label: t("ctxCopyRef"),
        icon: (0, react_jsx_runtime.jsx)(_primitives.IconCopyOutlineRegular, {})
      });
      items.push({
        id: "rename",
        label: t("ctxRename"),
        icon: (0, react_jsx_runtime.jsx)(_primitives.IconEditOutlineRegular, {})
      });
      items.push({
        id: "fork",
        label: t("ctxFork"),
        icon: (0, react_jsx_runtime.jsx)(_primitives.IconBranchOutlineRegular, {})
      });
      items.push({
        id: request.archived ? "unarchive" : "archive",
        label: t(request.archived ? "ctxUnarchive" : "ctxArchive"),
        icon: (0, react_jsx_runtime.jsx)(_primitives.IconArchiveOutlineRegular, {})
      });
    }
    items.push({
      id: "delete",
      label: t("ctxDelete"),
      danger: true,
      icon: (0, react_jsx_runtime.jsx)(_primitives.IconTrashOutlineRegular, {})
    });
    return (0, react_jsx_runtime.jsx)(_primitives.Menu, {
      open: true,
      onClose: function () { props.closeContext(); },
      items: items,
      onSelect: function (id) {
        props.closeContext();
        props.runContextAction(request, id);
      },
      portal: true,
      side: "bottom",
      align: "start",
      // 新版官方 Menu 用 anchorPoint（视口坐标）定位右键菜单；
      // 旧版的 getAnchorRect 在新版本里已不存在（传了会被忽略 → 菜单落到视口左上角）。
      anchorPoint: { x: request.x, y: request.y }
    });
  }

  // ── 重命名弹窗（shell.overlay）──
  // 官方菜单的重命名走它自己的弹窗；这里给右键菜单用一个同款输入框，
  // 提交走官方会话 RPC `remote.session.rename`，成功后刷新标题投影。
  function SessionRenameDialog(props) {
    var t = props.t;
    var request = props.useRenameRequest(function (value) { return value; });
    var draftPair = React.useState("");
    var draft = draftPair[0];
    var setDraft = draftPair[1];
    var busyPair = React.useState(false);
    var busy = busyPair[0];
    var setBusy = busyPair[1];
    React.useEffect(function () {
      if (request !== null) setDraft(request.title);
    }, [request]);
    if (request === null) return null;
    var submit = function () {
      setBusy(true);
      props.confirmRename(request.sessionId, draft).finally(function () {
        setBusy(false);
        props.settleRenameRequest();
      });
    };
    return (0, react_jsx_runtime.jsx)(_primitives.Modal, {
      open: true,
      onClose: function () {
        if (!busy) props.settleRenameRequest();
      },
      closeLabel: t("close"),
      title: t("rnTitle"),
      footer: (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
        (0, react_jsx_runtime.jsx)(_primitives.Button, {
          variant: "outline",
          disabled: busy,
          onClick: function () { props.settleRenameRequest(); },
          children: t("cancel")
        }),
        (0, react_jsx_runtime.jsx)(_primitives.Button, {
          variant: "outline",
          disabled: busy || draft.trim().length === 0,
          onClick: submit,
          children: t("rnSave")
        })
      ] }),
      children: (0, react_jsx_runtime.jsx)("input", {
        className: "dst_archSearch",
        type: "text",
        value: draft,
        autoFocus: true,
        disabled: busy,
        onChange: function (event) { setDraft(event.target.value); },
        onKeyDown: function (event) {
          if (event.key === "Enter" && event.isComposing !== true) {
            event.preventDefault();
            submit();
          }
        }
      })
    });
  }

  function apply(ctx) {
    var t = ctx.locale.bind(NS);
    ctx.effect(function () {
      return ctx.locale.register(NS, { zh: zh, en: en });
    }, "dsh-session-tools: dictionaries");
    // 字典注册之后再取文案（提前取会拿到裸 key）
    sidebarEntryLabelFn = function () { return t("navEntry"); };
    ctx.effect(installStyles, "dsh-session-tools: styles");
    ctx.effect(watchPanelNav, "dsh-session-tools: sidebar nav anchor");
    // 兼容开关：启动时读 host 的 compat.json；关闭时重建样式（不再输出 .dig-* 覆盖）
    wireCall("sessionTools", "getCompat", {}).then(function (value) {
      var on = !(value && value.dedig === false);
      if (on !== dedigEnabled) {
        dedigEnabled = on;
        installStyles(true);
      }
      sidebarBtnEnabled = value !== null && value !== void 0 && value.sidebarButton === true;
      ensureSidebarEntry();
    }).catch(function () { /* 读失败保持默认开 */ });

    var deleteRequest = void 0;
    var batchOpen = void 0;
    var batchIds = void 0;
    var contextRequest = void 0;
    var renameRequest = void 0;
    var toggleBatchId = void 0;
    var setBatchIds = void 0;
    var closeBatch = void 0;
    var archiveSelected = void 0;

    // 删除一个会话：host 侧串起「先归档再删除」，随后客户端本地收尾
    var deleteSession = function (sessionId) {
      return wireCall("sessionTools", "deleteSession", { sessionId: sessionId }).then(function () {
        // 空白草稿（未落盘的"新会话"）只有客户端列表知道，host 的移除帧到不了这里，
        // 所以直接走官方 remove 路径把它从列表里去掉（对已删会话幂等）。
        if (ctx.sessions !== void 0 && typeof ctx.sessions.handleSessionRemoved === "function") {
          try {
            ctx.sessions.handleSessionRemoved(sessionId);
          } catch (error) {
            if (typeof console !== "undefined") console.warn("dsh-session-tools: local removal failed:", error);
          }
        }
        if (ctx.sessions !== void 0 && typeof ctx.sessions.refresh === "function") {
          return ctx.sessions.refresh().then(function () { return true; }, function () { return true; });
        }
        return true;
      });
    };
    var deleteMany = function (sessionIds) {
      var ok = 0;
      var fail = 0;
      var chain = Promise.resolve();
      sessionIds.forEach(function (sessionId) {
        chain = chain.then(function () {
          return deleteSession(sessionId).then(function () { ok += 1; }, function (reason) {
            fail += 1;
            if (typeof console !== "undefined") console.warn("dsh-session-tools: delete failed:", reason);
          });
        });
      });
      return chain.then(function () { return { ok: ok, fail: fail }; });
    };
    var archiveOne = function (sessionId) {
      return ctx.workspaces.archiveSession(sessionId).then(function () { return true; }, function (reason) {
        if (typeof console !== "undefined") console.warn("dsh-session-tools: archive failed:", reason);
        return false;
      });
    };
    var archiveMany = function (sessionIds) {
      var ok = 0;
      var fail = 0;
      var chain = Promise.resolve();
      sessionIds.forEach(function (sessionId) {
        chain = chain.then(function () {
          return archiveOne(sessionId).then(function (done) { if (done) ok += 1; else fail += 1; });
        });
      });
      return chain.then(function () { return { ok: ok, fail: fail }; });
    };
    // 取消归档（官方 API；对已不在归档集的 id 是 no-op）
    var restoreMany = function (sessionIds) {
      var ok = 0;
      var fail = 0;
      var chain = Promise.resolve();
      sessionIds.forEach(function (sessionId) {
        chain = chain.then(function () {
          return ctx.workspaces.unarchiveSession(sessionId).then(function () { ok += 1; }, function (reason) {
            fail += 1;
            if (typeof console !== "undefined") console.warn("dsh-session-tools: unarchive failed:", reason);
          });
        });
      });
      return chain.then(function () { return { ok: ok, fail: fail }; });
    };
    var requestDelete = function (sessionIds) {
      deleteRequest.set({
        sessionIds: sessionIds,
        description: t("deleteBatchDesc", { n: sessionIds.length })
      });
    };
    // 重命名：官方契约 remote.session.rename，成功后刷新该会话的标题投影
    var confirmRename = function (sessionId, title) {
      var trimmed = String(title === null || title === void 0 ? "" : title).trim();
      if (trimmed.length === 0) return Promise.resolve(false);
      var remoteSession = ctx.get("remote.session");
      if (remoteSession === void 0 || typeof remoteSession.rename !== "function") {
        if (typeof console !== "undefined") console.warn("dsh-session-tools: session remote has no rename()");
        return Promise.resolve(false);
      }
      return Promise.resolve(remoteSession.rename({ sessionId: sessionId, title: trimmed })).then(function (result) {
        if (result === void 0 || result.ok !== true) {
          throw new Error(result !== void 0 && result.error !== void 0 ? result.error.message : "rename failed");
        }
        if (typeof ctx.sessions.refreshProjections === "function") {
          return Promise.resolve(ctx.sessions.refreshProjections(sessionId)).then(function () { return true; }, function () { return true; });
        }
        return true;
      }, function (reason) {
        if (typeof console !== "undefined") console.warn("dsh-session-tools: rename failed:", reason);
        return false;
      });
    };

    // 槽位注册（slots 服务在 inject 里声明，这里直接取用）
    var slotsReady = function () {
      ctx.slots.inject("sidebar.workspaces.session.menu.item", function () {
        return ctx.slots.register({
          name: "sidebar.workspaces.session.menu.item",
          id: "delete",
          order: 500,
          locale: NS,
          inject: function () {
            return {
              requestSessionDelete: function (sessionId) {
                var summary = ctx.sessions.list.getSnapshot().byId[sessionId];
                var name = summary === void 0 ? sessionId : (summary.title || summary.displayTitle || sessionId);
                deleteRequest.set({ sessionIds: [sessionId], description: t("deleteDesc", { name: name }) });
              }
            };
          }
        }, SessionDeleteMenuItem);
      });
      // 右键菜单（跟随鼠标）
      ctx.slots.inject("shell.overlay", function () {
        return ctx.slots.register({
          name: "shell.overlay",
          id: "dsh-session-tools.context",
          locale: NS,
          inject: function () {
            return {
              hooks: { contextRequest: contextRequest },
              closeContext: function () { contextRequest.set(null); },
              runContextAction: function (request, actionId) {
                var sessionId = request.sessionId;
                if (actionId === "delete") {
                  requestDelete([sessionId]);
                  return;
                }
                if (actionId === "rename") {
                  var summary = ctx.sessions.list.getSnapshot().byId[sessionId];
                  renameRequest.set({
                    sessionId: sessionId,
                    title: summary === void 0 ? "" : (summary.title || summary.displayTitle || "")
                  });
                  return;
                }
                if (actionId === "copyRef") {
                  var refSummary = ctx.sessions.list.getSnapshot().byId[sessionId];
                  var refLabel = sessionId;
                  if (refSummary !== void 0 && refSummary !== null) {
                    if (typeof refSummary.title === "string" && refSummary.title.length > 0) refLabel = refSummary.title;
                    else if (typeof refSummary.displayTitle === "string" && refSummary.displayTitle.length > 0) refLabel = refSummary.displayTitle;
                  }
                  // 官方规范：@[label](dsh-session:<base64url(UTF-8(JSON.stringify(id)))>)
                  // label 里的 \ 和 ] 要转义，否则 mention 解析会断。
                  var mention = "@[" + refLabel.replace(/[\\\]]/gu, function (m) { return "\\" + m; }) + "](" + sessionReferenceUri(sessionId) + ")";
                  Promise.resolve(_primitives.writeClipboard(mention)).catch(function (reason) {
                    if (typeof console !== "undefined") console.warn("dsh-session-tools: copy ref failed:", reason);
                  });
                  return;
                }
                if (actionId === "openExplorer") {
                  var target = request.path;
                  if (typeof target !== "string" || target.length === 0) return;
                  var remoteSession = ctx.get("remote.session");
                  if (remoteSession === void 0 || typeof remoteSession.openWorkspacePath !== "function") return;
                  Promise.resolve(remoteSession.openWorkspacePath({ path: target, action: "reveal" })).catch(function (reason) {
                    if (typeof console !== "undefined") console.warn("dsh-session-tools: open explorer failed:", reason);
                  });
                  return;
                }
                var uiWorkspace = ctx.get("uiWorkspace");
                var call = null;
                if (actionId === "pin" || actionId === "unpin") {
                  var pin = actionId === "pin" ? "pinSession" : "unpinSession";
                  if (uiWorkspace !== void 0 && typeof uiWorkspace[pin] === "function") call = uiWorkspace[pin](sessionId);
                } else if (actionId === "fork") {
                  if (uiWorkspace !== void 0 && typeof uiWorkspace.forkSession === "function") call = uiWorkspace.forkSession(sessionId);
                } else if (actionId === "archive") call = ctx.workspaces.archiveSession(sessionId);
                else if (actionId === "unarchive") call = ctx.workspaces.unarchiveSession(sessionId);
                if (call === null) return;
                Promise.resolve(call).catch(function (reason) {
                  if (typeof console !== "undefined") console.warn("dsh-session-tools: context action " + actionId + " failed:", reason);
                });
              }
            };
          }
        }, SessionContextMenu);
      });
      // 重命名弹窗
      ctx.slots.inject("shell.overlay", function () {
        return ctx.slots.register({
          name: "shell.overlay",
          id: "dsh-session-tools.rename",
          locale: NS,
          inject: function () {
            return {
              hooks: { renameRequest: renameRequest },
              settleRenameRequest: function () { renameRequest.set(null); },
              confirmRename: confirmRename
            };
          }
        }, SessionRenameDialog);
      });
      ctx.slots.inject("shell.overlay", function () {
        return ctx.slots.register({
          name: "shell.overlay",
          id: "dsh-session-tools.delete",
          locale: NS,
          inject: function () {
            return {
              hooks: { deleteRequest: deleteRequest },
              settleDeleteRequest: function () { deleteRequest.set(null); },
              confirmDelete: deleteMany
            };
          }
        }, SessionDeleteConfirmDialog);
      });
      ctx.slots.inject("shell.overlay", function () {
        return ctx.slots.register({
          name: "shell.overlay",
          id: "dsh-session-tools.batch",
          locale: NS,
          inject: function () {
            return {
              hooks: {
                batchOpen: batchOpen,
                batchIds: batchIds,
                sessions: ctx.sessions.list,
                workspaces: ctx.workspaces.list
              },
              toggleBatchId: toggleBatchId,
              setBatchIds: setBatchIds,
              closeBatch: closeBatch,
              archiveSelected: archiveMany,
              requestBatchDelete: function (sessionIds) {
                deleteRequest.set({ sessionIds: sessionIds, description: t("deleteBatchDesc", { n: sessionIds.length }) });
              }
            };
          }
        }, BatchPanel);
      });
      // 设置区「已归档」：官方只有侧栏筛选，这里给一个归档管理页（分组/筛选/批量恢复/删除）
      // id 用 archived-sessions：官方设置壳的导航图标映射里正好给它备了归档图标。
      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register({
          name: "settings.section",
          id: "archived-sessions",
          order: 105,
          label: function () { return ctx.locale.bind(NS)("archNav"); },
          locale: NS,
          inject: function () {
            return {
              hooks: { sessions: ctx.sessions.list, workspaces: ctx.workspaces.list },
              restoreSessions: restoreMany,
              archiveSessions: archiveMany,
              // 打开会话存储目录：openWorkspacePath 不传 action = 直接打开该目录本身
              //（传 action:"reveal" 会退到上一级、只选中该文件夹，用户实测不要这个）
              openSessionsDir: function (path) {
                var remoteSession = ctx.get("remote.session");
                if (remoteSession === void 0 || typeof remoteSession.openWorkspacePath !== "function") {
                  return Promise.reject(new Error("remote.session.openWorkspacePath unavailable"));
                }
                return remoteSession.openWorkspacePath({ path: path });
              },
              requestDelete: requestDelete
            };
          }
        }, ArchivedSection);
      });
    };

    // 面板/弹窗状态：优先用 client-store 的快照 store；取不到退化成小实现（功能不变）
    var store = function (initial) {
      try {
        var api = require("@deepseek-ai/dsh-client-store");
        if (api && typeof api.createSnapshotStore === "function") return api.createSnapshotStore(initial);
      } catch (error) { /* 旧内核没有这个包，走下面的退化实现 */ }
      var value = initial;
      var listeners = new Set();
      return {
        getSnapshot: function () { return value; },
        subscribe: function (listener) { listeners.add(listener); return function () { listeners.delete(listener); }; },
        set: function (next) { value = next; listeners.forEach(function (listener) { listener(); }); }
      };
    };

    ctx.inject(["slots", "locale", "sessions", "workspaces"], function () {
      deleteRequest = store(null);
      batchOpen = store(false);
      batchIds = store(new Set());
      contextRequest = store(null);
      renameRequest = store(null);
      toggleBatchId = function (sessionId) {
        var next = new Set(batchIds.getSnapshot());
        if (next.has(sessionId)) next.delete(sessionId); else next.add(sessionId);
        batchIds.set(next);
      };
      setBatchIds = function (sessionIds) { batchIds.set(new Set(sessionIds)); };
      closeBatch = function () {
        batchOpen.set(false);
        batchIds.set(new Set());
      };
      slotsReady();
      // 官方侧栏顶部注入「批量」按钮（DOM 旁路，幂等）
      ctx.effect(function () {
        if (typeof document === "undefined" || typeof MutationObserver === "undefined") return function () {};
        var scan = function () {
          var actions = document.querySelector('[class*="_headerActions"]');
          if (actions === null) return;
          // 打上标记类：让插件样式把这一行从 60px 定宽改成按内容撑开（否则第 3 个
          // 按钮会把「添加工作区」挤出容器裁掉）
          if (typeof actions.classList === "object" && !actions.classList.contains("dst_headerActions")) {
            actions.classList.add("dst_headerActions");
          }
          if (actions.querySelector("[" + BATCH_MARK + "]") !== null) return;
          var button = document.createElement("button");
          button.type = "button";
          button.className = "dst_batchTrigger";
          button.setAttribute(BATCH_MARK, "");
          button.setAttribute("aria-label", t("batch"));
          button.title = t("batch");
          button.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke-width="1.2"><rect x="1.75" y="2.75" width="4.5" height="4.5" rx="1.25" stroke="currentColor"/><rect x="1.75" y="8.75" width="4.5" height="4.5" rx="1.25" stroke="currentColor"/><path d="M9 5h5.25M9 11h5.25" stroke="currentColor" stroke-linecap="round"/></svg>';
          button.addEventListener("click", function () {
            if (batchOpen.getSnapshot()) closeBatch(); else batchOpen.set(true);
          });
          // 放在「添加工作区」后面（末尾），不抢官方按钮的位置
          actions.appendChild(button);
        };
        scan();
        var observer = new MutationObserver(function () { scan(); });
        observer.observe(document.body, { childList: true, subtree: true });
        return function () { observer.disconnect(); };
      }, "dsh-session-tools: batch trigger");
      // 会话行右键 → 跟随鼠标的菜单（拦截 contextmenu，锚点放在鼠标坐标）
      ctx.effect(function () {
        if (typeof document === "undefined") return function () {};
        var onContextMenu = function (event) {
          var target = event.target;
          if (target === null || target === void 0 || typeof target.closest !== "function") return;
          var row = target.closest('[data-row-key^="session:"]');
          if (row === null) return;
          event.preventDefault();
          event.stopPropagation();
          var sessionId = String(row.getAttribute("data-row-key") || "").slice("session:".length);
          if (sessionId.length === 0) return;
          var summary = ctx.sessions.list.getSnapshot().byId[sessionId];
          var workspaceState = ctx.workspaces.list.getSnapshot();
          var sessionPath = null;
          if (summary !== void 0 && summary !== null) {
            if (typeof summary.cwd === "string" && summary.cwd.length > 0) sessionPath = summary.cwd;
            else if (typeof summary.workingDirectory === "string" && summary.workingDirectory.length > 0) sessionPath = summary.workingDirectory;
          }
          if (sessionPath === null && workspaceState !== void 0 && workspaceState !== null) {
            var wsList = Array.isArray(workspaceState.workspaces) ? workspaceState.workspaces : [];
            for (var wi = 0; wi < wsList.length; wi++) {
              var ws = wsList[wi];
              if (ws !== null && ws !== void 0 && typeof ws.path === "string" && ws.path.length > 0 && (summary === void 0 || summary.workspaceId === void 0 || summary.workspaceId === ws.id)) {
                sessionPath = ws.path;
                break;
              }
            }
          }
          contextRequest.set({
            sessionId: sessionId,
            x: event.clientX,
            y: event.clientY,
            path: sessionPath,
            blank: summary !== void 0 && summary.blank === true,
            archived: (workspaceState.archivedSessionIds || []).indexOf(sessionId) !== -1,
            pinned: (workspaceState.pinnedSessionIds || []).indexOf(sessionId) !== -1
          });
        };
        document.addEventListener("contextmenu", onContextMenu, true);
        return function () { document.removeEventListener("contextmenu", onContextMenu, true); };
      }, "dsh-session-tools: session context menu");
      // 「展开其余 N 个会话」默认展开：官方每个工作区默认只显示 5 条空闲会话，
      // 溢出折叠成一个 data-row-key="overflow:{组key}" 的按钮，aria-expanded 标记是否全展开。
      // 扫到未全展开的就点一下（点一次 +5 条或一次全展开，重渲染引发的 DOM 变化会级联触发扫描）；
      // 用户手动点「收起」的组进沉默名单，本次运行不再自动展开（不回弹）。
      ctx.effect(function () {
        if (typeof document === "undefined" || typeof MutationObserver === "undefined") return function () {};
        var suppressed = new Set();
        var pending = false;
        var expand = function () {
          pending = false;
          var buttons = document.querySelectorAll('[data-row-key^="overflow:"]');
          for (var i = 0; i < buttons.length; i++) {
            var button = buttons[i];
            var key = button.getAttribute("data-row-key");
            if (suppressed.has(key)) continue;
            if (button.getAttribute("aria-expanded") === "true") continue;
            button.click();
            return;
          }
        };
        var schedule = function () {
          if (pending) return;
          pending = true;
          setTimeout(expand, 0);
        };
        var onClick = function (event) {
          var target = event.target;
          if (target === null || target === void 0 || typeof target.closest !== "function") return;
          var button = target.closest('[data-row-key^="overflow:"]');
          if (button === null) return;
          if (button.getAttribute("aria-expanded") === "true") suppressed.add(button.getAttribute("data-row-key"));
        };
        document.addEventListener("click", onClick, true);
        var observer = new MutationObserver(function () { schedule(); });
        observer.observe(document.body, { childList: true, subtree: true });
        schedule();
        return function () {
          observer.disconnect();
          document.removeEventListener("click", onClick, true);
        };
      }, "dsh-session-tools: session overflow auto expand");
    });
  }

  exports.apply = apply;
  exports.inject = ["slots", "locale", "sessions", "workspaces", "remote", "remote.session"];
  return module.exports;
}});
