window.__ModuleLoader__.load({
	id: "dsh-avatar",
	factory: (require) => {

	    const module = { exports: {} }
	    const exports = module.exports
	    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

	    const react = require("react");
	    const jsxRuntime = require("react/jsx-runtime");

	    // ── 对话头像 + 昵称（仿微信）────────────────────────────
	    // host 管图片（assets/*）与昵称（config.json）。
	    // client 干两件事：
	    //   1) DOM 旁路给消息流注入头像行 + 昵称（MutationObserver 幂等重挂）
	    //   2) 注册官方设置区槽位 settings.section → 「对话头像」是一个正规设置页，
	    //      与「通用设置/模型」同级，导航切换由官方设置壳管理（不再自绘图层）
    var NS = "dsh-avatar";
    var AV_MARK = "data-ziyong-avatar";
    var NAME_MARK = "data-ziyong-avatar-name";
    // 方案 B：头像/昵称用「块属性 + CSS 伪元素」渲染（不再建 DOM 节点）。
    // 属性不会被 React 重渲染清掉，稳态下零增删、零布局写入。
    var HOST_ATTR = "data-zy-av";   // "ai" | "user"
    var NAME_ATTR = "data-zy-name"; // 昵称文本（::after content:attr()）
    var RUN_ATTR = "data-zy-run";   // 运行行宿主（撑高 + 状态行贴底）
    var ICON_MARK = "data-dsh-avatar-nav-icon";
    var AI_SHIFT = "data-ziyong-ai-shift";     // 左侧让位（AI 块/技术条目），缩进由 CSS 变量驱动
    var USER_SHIFT = "data-ziyong-user-shift"; // 右侧让位（用户消息），同上
    var observed = false;
    var cfg = null; // { userName, assistantName, avatarSize, userAvatar, assistantAvatar }
    // Ctrl/Cmd+Enter 派发「普通 Enter」合成事件时置 true，防本监听器自己再拦一次。
    var injectingEnter = false;
    var BUBBLE_CSS_MARK = "data-ziyong-avatar-bubblecss";
    // 主界面「资源管理器」按钮：勾选后插到标题栏「更多操作 ...」按钮左边
    var EXPLORER_KEY = "dsh-avatar/explorer-button";
    var explorerEnabled = false;
    var explorerBtnEl = null;
    // 输入框「提示词优化」按钮：勾选后插到模型胶囊左边，点击用当前模型改写输入框文本
    var POLISH_KEY = "dsh-avatar/prompt-polish";
    var polishEnabled = false;
    var polishBtnEl = null;
    var polishToastEl = null;
    var pluginCtx = null;

    function avatarSize() {
      var n = cfg && typeof cfg.avatarSize === "number" ? cfg.avatarSize : 40;
      return Math.max(24, Math.min(96, Math.round(n)));
    }

    // 圆角度 0~100：0=正方形，100=🟠正圆（clip-path inset 圆角半径 = size/2 * v/100，max 50%）
    function avatarRadius() {
      var n = cfg && typeof cfg.avatarRadius === "number" ? cfg.avatarRadius : 100;
      return Math.max(0, Math.min(100, Math.round(n)));
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
	        throw new Error(full && full.result && full.result.error ? full.result.error.message : "avatar rpc failed");
	      });
	    }
	    function loadConfig() {
	      return wireCall("avatar", "getAvatarConfig", {}).then(function (v) {
	        cfg = v || { userName: "我", assistantName: "DeepSeek" };
	        return cfg;
	      }).catch(function () { return cfg; });
	    }
	    // 注入开关的真实状态以 profile 文件为准：config.json 可能和实际不符
	    // （比如用户手改过 cordis.patch.yml，或换过 profile）
	    function loadPersonaState(base) {
	      return wireCall("avatar", "getPersonaInject", {}).then(function (state) {
	        if (base === null || base === void 0) return base;
	        var merged = Object.assign({}, base);
	        merged.personaInject = state !== void 0 && state !== null && state.enabled === true;
	        cfg = merged;
	        return merged;
	      }).catch(function () { return base; });
	    }

	    // ── 消息行注入 ───────────────────────────
    function avatarEl(cfg, which) {
      var url = which === "user" ? cfg.userAvatar : cfg.assistantAvatar;
      // 首字按 code point 切（emoji 是代理对，slice(0,1) 会切坏）
      var ch = Array.from(which === "user" ? (cfg.userName || "") : (cfg.assistantName || ""))[0] || "";
      // 尺寸/圆角/字号写当前值的内联样式；拖动时由 refreshLiveStyles() 原地改写（不重建节点）。
      // 不用 CSS 变量：实测改自定义属性会让整棵树样式重算（~31ms/步），
      // 原地改这些节点的内联样式只失效这些节点（~2ms/步），相差一个数量级。
      var size = avatarSize();
      var rad = avatarRadius();
      var roundR = Math.round(size / 2 * rad / 100 * 10) / 10;
      var box = document.createElement("span");
      // clip-path inset(圆角 R)：该页面环境下 border-radius 会被干扰渲染成大圆角方形（实测 12 方向半径波动 5.8px），
      // clip-path 走独立渲染路径，波动 2.2px 与 SVG 数学圆一致。R = size/2 × 圆角度/100（100 时 R=size/2 即🟠正圆）
      box.style.cssText = "width:" + size + "px;height:" + size + "px;clip-path:inset(0 round " + roundR + "px);flex:none;display:inline-flex;align-items:center;justify-content:center;background:" + (which === "user" ? "var(--dsw-alias-state-success-primary, #2f855a)" : "var(--dsw-alias-state-info-primary, #3182ce)") + ";color:#fff;font-size:" + Math.round(size * 0.45) + "px;font-weight:600";
      if (url) {
        var img = document.createElement("img");
        img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block";
        img.src = url;
        img.alt = "";
        img.setAttribute("draggable", "false");
        box.appendChild(img);
      } else {
        box.textContent = ch;
      }
      return box;
    }

	    function nameEl(text) {
	      var s = document.createElement("span");
	      s.style.cssText = "font-size:12px;color:var(--dsw-alias-label-tertiary);line-height:1";
	      s.textContent = text;
	      return s;
	    }

function nameEl(text, isUser) {
      var s = document.createElement("span");
      // 空昵称也占位：固定 16px 行高，内容位置不因昵称留空而上移
      s.style.cssText = "display:block;height:16px;line-height:16px;font-size:12px;color:var(--dsw-alias-label-tertiary)" + (isUser ? ";text-align:right" : "");
      s.textContent = text;
      return s;
    }

	    // 微信式布局：头像在气泡侧旁（AI 左 / 用户右），昵称在内容区顶部。
	    // 方案 B：头像/昵称不再建 DOM 节点，改为「块属性 + CSS 伪元素」渲染。
	    // 属性 React 重渲染不会清，稳态下零增删、零布局写入 → 不再有周期性抖动。
	    // 让位缩进由 CSS 变量驱动（--zy-size），这里只打标记。
	    function shiftForAvatar(flowItem, isUser) {
	      var mark = isUser ? USER_SHIFT : AI_SHIFT;
	      if (flowItem.getAttribute(mark) === null) flowItem.setAttribute(mark, "");
	      if (flowItem.style.getPropertyValue("--zy-size") === "") {
	        flowItem.style.setProperty("--zy-size", avatarSize() + "px");
	      }
	    }
	    // 拖动滑块时只改 CSS 变量（不删建节点、不写布局属性）
	    function refreshLiveStyles() {
	      var size = avatarSize();
	      var rad = avatarRadius();
	      var roundR = Math.round(size / 2 * rad / 100 * 10) / 10;
	      var font = Math.round(size * 0.45);
	      var hosts = document.querySelectorAll("[" + HOST_ATTR + "]");
	      for (var i = 0; i < hosts.length; i++) {
	        hosts[i].style.setProperty("--zy-size", size + "px");
	        hosts[i].style.setProperty("--zy-round", roundR + "px");
	        hosts[i].style.setProperty("--zy-font", font + "px");
	      }
	      var rows = document.querySelectorAll("[" + AI_SHIFT + "], [" + USER_SHIFT + "]");
	      for (var j = 0; j < rows.length; j++) rows[j].style.setProperty("--zy-size", size + "px");
	    }

	    // 头像参数写到块的 CSS 变量上（只在值变化时写；伪元素消费这些变量）
	    function applyAvatarVars(flowItem, role) {
	      var size = avatarSize();
	      var rad = avatarRadius();
	      var roundR = Math.round(size / 2 * rad / 100 * 10) / 10;
	      var font = Math.round(size * 0.45);
	      var name = role === "user" ? (cfg.userName || "") : (cfg.assistantName || "");
	      var url = role === "user" ? cfg.userAvatar : cfg.assistantAvatar;
	      var vm = flowItem.style;
	      var setVar = function (key, value) {
	        if (vm.getPropertyValue(key) !== value) vm.setProperty(key, value);
	      };
	      setVar("--zy-size", size + "px");
	      setVar("--zy-round", roundR + "px");
	      setVar("--zy-font", font + "px");
	      setVar("--zy-bg", role === "user" ? "var(--dsw-alias-state-success-primary, #2f855a)" : "var(--dsw-alias-state-info-primary, #3182ce)");
	      if (typeof url === "string" && url.length > 0) {
	        setVar("--zy-url", 'url("' + url.replace(/"/g, '\\"') + '")');
	        setVar("--zy-letter", '""');
	      } else {
	        if (vm.getPropertyValue("--zy-url") !== "") vm.removeProperty("--zy-url");
	        var ch = Array.from(name)[0] || "";
	        setVar("--zy-letter", '"' + ch.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"');
	      }
	      if (flowItem.getAttribute(NAME_ATTR) !== name) flowItem.setAttribute(NAME_ATTR, name);
	    }

	    function injectAvatar(flowItem, isUser) {
	      if (!cfg) return;
	      var role = isUser ? "user" : "ai";
	      if (flowItem.getAttribute(HOST_ATTR) !== role) flowItem.setAttribute(HOST_ATTR, role);
	      applyAvatarVars(flowItem, role);
	      shiftForAvatar(flowItem, isUser);
	      // AI 宿主的内容可能直接是文本节点，也可能被 React 换成别的结构：
	      // 一次性量「首个子元素偏移」会在结构变化后失真（实测昵称压到正文上）。
	      // 统一规则：宿主自己留 16px 昵称带，伪元素固定贴在带内，内容始终在带下方。
	      // 运行行宿主：撑到刚好容纳头像、状态行内容贴底（原内联样式改成属性 + CSS）
	      if (flowItem.getAttribute(RUN_MARK) !== null && flowItem.getAttribute(RUN_ATTR) === null) {
	        flowItem.setAttribute(RUN_ATTR, "");
	      }
	    }

	    // 技术条目（系统提示词/上下文注入）不插头像；AI 连续块只给第一个插。
	    // 返回条目类型："system"（系统提示词）/ "context"（上下文注入）/ null
	    function techKindOf(flowItem) {
	      var t = (flowItem.textContent || "").trim();
	      if (t.indexOf("系统提示词") === 0) return "system";
	      if (t.indexOf("上下文注入") === 0) return "context";
	      return null;
	    }

	    // 移除某 AI 块上的头像/昵称（组内只允许头像宿主挂）
	    function removeAvatar(flowItem) {
	      // 属性版：去掉标记，伪元素随之消失
	      if (flowItem.getAttribute(HOST_ATTR) !== null) flowItem.removeAttribute(HOST_ATTR);
	      if (flowItem.getAttribute(NAME_ATTR) !== null) flowItem.removeAttribute(NAME_ATTR);
	      if (flowItem.getAttribute(RUN_ATTR) !== null) flowItem.removeAttribute(RUN_ATTR);
	      // 迁移：清掉旧版本（DOM 节点版）可能留下的头像/昵称节点
	      var av = flowItem.querySelector("[" + AV_MARK + "]");
	      if (av) {
	        av.remove();
	        if (flowItem.getAttribute(RUN_MARK) !== null) {
	          flowItem.style.minHeight = "";
	          flowItem.style.display = "";
	          flowItem.style.flexDirection = "";
	          var rc = flowItem.querySelector('[class*="runningContent"]');
	          if (rc !== null) rc.style.marginTop = "";
	        }
	      }
	      var nm = flowItem.querySelector("[" + NAME_MARK + "]");
	      if (nm) nm.remove();
	    }

	    var BOX_MARK = "data-ziyong-avatar-box";
	    var RUN_MARK = "data-ziyong-runrow";
	    // 容器级缓存：{ n, first, last, hosts }。结构签名一致且头像齐全 → 整段跳过。
	    var containerState = new WeakMap();
	    // 「确认过有可见文字」的块：稳态下不再读 innerText（避免每轮扫描都强制布局）
	    var textSeen = new WeakSet();
	    // 「宿主还没定下来」的容器重试计数：正文常以文本节点形式长出来，
	    // 我们的 observer 只收元素级变动 → 不会重扫。这里补定时重试（最多 3 次）。
	    var recheckLeft = new WeakMap();
	    // ── 视口可见性：只挂屏幕附近的轮次 ──────────────────────────
	    // 切会话时整段历史都在 DOM 里（100 轮很常见），旧实现每轮都读 innerText、
	    // 量 rect、写属性 → 切一次几百毫秒。现在只处理视口 ±400px 预热带内的块：
	    //   · seededLen ：容器子节点数（数量变化才重新二分定位可见区，避免反复量）
	    //   · visSet    ：当前判定「在预热带内」的块；scanContainer 只处理含可见成员的组
	    //   · visObserved / visIO：IntersectionObserver 兜底（折叠/展开、缩放、搜索定位）
	    // 滚到哪挂到哪；离开视口不撤属性，滚回来零成本。
	    var VIS_BUFFER = 400;
	    var visSet = new WeakSet();
	    var visObserved = new WeakSet();
	    var visIO = null;
	    var onVisibilityChange = null;
	    function ensureVisObserver() {
	      if (visIO !== null) return visIO;
	      if (typeof IntersectionObserver !== "function") return null;
	      try {
	        visIO = new IntersectionObserver(function (entries) {
	          var changed = false;
	          for (var i = 0; i < entries.length; i++) {
	            var en = entries[i];
	            if (en.isIntersecting === true && !visSet.has(en.target)) {
	              visSet.add(en.target);
	              changed = true;
	            }
	          }
	          if (changed === true && typeof onVisibilityChange === "function") onVisibilityChange();
	        }, { root: null, rootMargin: VIS_BUFFER + "px 0px", threshold: 0 });
	      } catch (e) {
	        visIO = null;
	      }
	      return visIO;
	    }
	    function observeVis(el) {
	      if (el === null || el === void 0 || el.nodeType !== 1) return;
	      if (visObserved.has(el)) return;
	      var io = ensureVisObserver();
	      if (io === null) return;
	      visObserved.add(el);
	      try { io.observe(el); } catch (e) { /* 观察失败不影响注入 */ }
	    }
	    // 容器子节点是竖向有序的：二分找第一个「没完全滚出视口上方」的块（约 7 次读），
	    // 再顺序补到视口下方边界（通常 2~4 块）→ 与历史长度解耦，100 轮也只读十几次。
	    // 逐个块量 rect 的老写法在 120 轮容器上要 100+ 次，切会话时每次扫描都强制重排。
	    var seededLen = new WeakMap();
	    // 播种按帧合并：挂载期 React 每帧可能提交多次，scanContainer 也会跑多次；
	    // 每帧只量一次可见区（rAF 在绘制前，头像仍与首帧同屏出现）。
	    var seedScheduled = new WeakMap();
	    function scheduleMarkVisible(container) {
	      if (seedScheduled.get(container) === true) return;
	      seedScheduled.set(container, true);
	      requestAnimationFrame(function () {
	        seedScheduled.set(container, false);
	        try { markVisibleRange(container); } catch (eMark) { /* 忽略 */ }
	        if (typeof onVisibilityChange === "function") onVisibilityChange();
	      });
	    }
	    function markVisibleRange(container) {
	      var ch = container.children;
	      var n = ch.length;
	      if (n === 0) return false;
	      var vh = 0;
	      try { vh = window.innerHeight || document.documentElement.clientHeight || 0; } catch (eVh) { vh = 0; }
	      if (vh <= 0) vh = 800;
	      var cr = null;
	      try { cr = container.getBoundingClientRect(); } catch (eCr) { cr = null; }
	      // 容器可能是 display:contents（新会话的 flow 槽实测高度 0），自身没有盒子。
	      // 这时退回视口边界：子节点 rect 仍是视口坐标，二分照常有效。
	      var topEdge;
	      var bottomEdge;
	      if (cr !== null && cr.height > 0) {
	        topEdge = cr.top - VIS_BUFFER;
	        bottomEdge = cr.bottom + VIS_BUFFER;
	      } else {
	        topEdge = -VIS_BUFFER;
	        bottomEdge = vh + VIS_BUFFER;
	      }
	      var rectAt = function (i) {
	        try { return ch[i].getBoundingClientRect(); } catch (e) { return null; }
	      };
	      var lo = 0;
	      var hi = n - 1;
	      var first = n;
	      while (lo <= hi) {
	        var mid = (lo + hi) >> 1;
	        var mr = rectAt(mid);
	        if (mr !== null && mr.bottom < topEdge) lo = mid + 1;
	        else { first = mid; hi = mid - 1; }
	      }
	      var changed = false;
	      for (var i = first; i < n; i++) {
	        var rr = rectAt(i);
	        if (rr === null) continue;
	        if (rr.top > bottomEdge) break;
	        var el = ch[i];
	        if (rr.height > 0 && !visSet.has(el)) { visSet.add(el); changed = true; }
	        // 盒子里的 flowItem 进屏了，盒子本身也要放行（分组是按盒子元素判的）
	        if (typeof el.closest === "function") {
	          var sbox = el.closest("[" + BOX_MARK + "]");
	          if (sbox !== null && !visSet.has(sbox)) visSet.add(sbox);
	        }
	      }
	      return changed;
	    }
	    function scheduleRecheck(container) {
	      try {
	        var n = recheckLeft.get(container) || 0;
	        if (n >= 3) return;
	        recheckLeft.set(container, n + 1);
	        setTimeout(function () {
	          try { scanContainer(container); } catch (e) { /* 忽略 */ }
	        }, 180 + n * 220);
	      } catch (e2) { /* 忽略 */ }
	    }
	    // 读-算-写三段式。背景：DOM 变动后第一次读 offsetHeight 会强制整页重排
	    // （实测 110 条消息 / 4168 节点：28~41ms）。原实现"写 padding → 读高度 →
	    // 再写"交替，一次扫描触发多次重排，平均 55ms/次 DOM 突变。这里把布局读取
	    // 全部收拢到写样式之前，一次扫描最多只强制一次重排。
	    function scanContainer(container) {
	      if (!container || !cfg) return;
	      // 活动盒内部不再重复缩进（盒已整体让位，内部再让一次会变成双倍边距）
	      if (container.closest !== void 0 && container.closest("[" + BOX_MARK + "]") !== null) return;

	      // ── 1. 只读分类：只看 className / querySelector / textContent，不写 DOM、不读布局 ──
	      var plan = [];
	      var children = container.children;
	      for (var c = 0; c < children.length; c++) {
	        var child = children[c];
	        var cls = typeof child.className === "string" ? child.className : "";
	        if (cls.indexOf("flowItem") !== -1) {
	          plan.push({ el: child, kind: "flow" });
	        } else if (/(^|\s)[\w-]*_running(\s|$)/.test(cls) && (child.closest === void 0 || child.closest('[class*="userRow"]') === null)) {
	          // 官方「深度求索中，用时 X 秒」状态行：不是 flowItem，但属于 AI 这一轮。
	          // 运行中还没有 flowItem，它就是这一轮唯一的宿主 —— 头像要挂在它上面，
	          // 否则 AI 回复期间整轮没有头像（用户实测）。
	          plan.push({ el: child, kind: "run" });
	        } else if (typeof child.querySelector === "function" && child.querySelector('[class*="flowItem"]') !== null) {
	          // 2.0.14+ 把「已完成分析 / 思考 / 工具活动」包在非 flowItem 的容器里：当活动盒处理
	          plan.push({ el: child, kind: "box" });
	        }
	      }
	      for (var p = 0; p < plan.length; p++) {
	        var it = plan[p];
	        if (it.kind !== "flow") continue;
	        it.user = it.el.querySelector('[class*="userRow"]') !== null;
	        it.tech = it.user ? null : techKindOf(it.el);
	      }

	      // ── 1.5 可见性播种 ──
	      // 子节点数量变化（新块出现 / 整段重建）才重新二分定位可见区；
	      // 块高变化、折叠展开、缩放由 IntersectionObserver 兜底。
	      // 每块都挂 IO 观察（只 observe，不读布局）；离开视口不撤属性，滚回来零成本。
	      for (var sd = 0; sd < plan.length; sd++) observeVis(plan[sd].el);
	      try {
	        if (seededLen.get(container) !== plan.length) {
	          seededLen.set(container, plan.length);
	          scheduleMarkVisible(container);
	        }
	      } catch (eSeed) { /* 量不到就当屏外 */ }

	      // ── 2. 不再在扫描里预读布局 ──
	      // 旧实现在这里给每个候选块读 offsetHeight（一次强制重排），宿主挑完再写头像，
	      // 写入又让布局失效 → 浏览器为绘制再排一次，等于每次挂载多付一次整页布局
	      //（实测 78 块容器 162ms，切会话整段 +285ms）。
	      // 现在不在扫描里做布局读取；宿主定位在下面用 innerText（可见文字）判断，
	      // 且**每轮只定位一次并锁定**，不做实时搬移（避免流式期间昵称上下跳）。

	      // ── 3. 算：分组 + 每组宿主（纯 JS，不碰 DOM）──
	      var groups = [];
	      var cur = null;
	      for (var i = 0; i < plan.length; i++) {
	        var f = plan[i];
	        if (f.kind === "flow" && f.user) { cur = null; continue; }
	        if (f.kind === "flow" && f.tech !== null) continue; // tech 条目不入组，但也不打断组（与原逻辑一致）
	        if (!cur) { cur = []; groups.push(cur); }
	        cur.push(f);
	      }

	      // ── 4. 写：标记 → 让位 → 注入/移除，全程不再读布局 ──
	      for (var w = 0; w < plan.length; w++) {
	        var m = plan[w];
	        if (m.kind === "run") m.el.setAttribute(RUN_MARK, "");
	        else if (m.kind === "box") m.el.setAttribute(BOX_MARK, "");
	      }
	      for (var u = 0; u < plan.length; u++) {
	        var uu = plan[u];
		        if (uu.kind === "flow" && uu.user) {
		          // 发送瞬间的裸行可能被复用进 flowItem：内部 userRow 已带头像就沿用它，
		          // 否则在外层块上注入（避免同一消息挂两个头像/双倍边距）。
		          var innerRow = uu.el.querySelector('[class*="userRow"]');
		          // 屏外的用户消息本轮跳过：切会话只挂视口 ±400px 内的轮次，滚到再补
		          if (!visSet.has(uu.el) && (innerRow === null || !visSet.has(innerRow))) continue;
	          var userHost = uu.el.getAttribute(HOST_ATTR) !== null
	            ? uu.el
	            : (innerRow !== null && innerRow.getAttribute(HOST_ATTR) !== null ? innerRow : null);
	          if (userHost === null) injectAvatar(uu.el, true);
	          else {
	            // 同一条消息只留一个宿主：外挂在就撤内挂，内挂在就撤外挂（防双头像/双缩进）
	            if (userHost === uu.el && innerRow !== null && innerRow !== uu.el && innerRow.getAttribute(HOST_ATTR) !== null) removeAvatar(innerRow);
	            if (userHost !== uu.el && uu.el.getAttribute(HOST_ATTR) !== null) removeAvatar(uu.el);
	            shiftForAvatar(userHost, true);
	          }
		        } else if (uu.kind === "flow" && uu.tech !== null) {
		          // 技术条目（系统提示词/上下文注入）：不插头像、不改显隐
		          if (!visSet.has(uu.el)) continue;
		          shiftForAvatar(uu.el, false);
		        }
	      }
	      // 宿主定位：每轮只定位一次并锁定；**空块一律不挂**（没文字 = 用户看不见，
	      // 挂上去就是「昵称悬空、中间空一行」）。锁定后不再搬，避免流式期间上下跳。
	      // 稳态零布局读取：确认过「有可见文字」的块记进 textSeen，之后不再读 innerText。
	      var anyUnresolved = false;
	      for (var g = 0; g < groups.length; g++) {
	        // 组内没有任何成员进预热带 → 整组跳过（切会话时屏外那 98 轮在这里被挡掉）
	        var groupVisible = false;
	        for (var gv = 0; gv < groups[g].length; gv++) {
	          if (visSet.has(groups[g][gv].el)) { groupVisible = true; break; }
	        }
	        if (groupVisible !== true) continue;
	        var host = null;
	        var hostIdx = -1;
	        var firstVis = null;
	        var firstVisIdx = -1;
	        var firstBody = null;
	        var firstBodyIdx = -1;
	        for (var hp = 0; hp < groups[g].length; hp++) {
	          var mem = groups[g][hp];
	          var memEl = mem.el;
	          var isRun = memEl.getAttribute(RUN_MARK) !== null;
	          // 必须有**实际盒子**（高度 > 0）才是可挂宿主：
	          // “上下文注入”这类过程包裹层经常 height=0、内容在别处渲染，
	          // 挂上去伪元素会被裁掉 → 整轮看不到头像（实测）。
	          var boxOk = false;
	          try { boxOk = memEl.getBoundingClientRect().height > 0; } catch (eBox) { boxOk = false; }
	          var hasText = textSeen.has(memEl);
	          if (!hasText) {
	            var memText = "";
	            try { memText = (memEl.innerText || "").trim(); } catch (eT) { memText = ""; }
	            if (memText.length > 0) { textSeen.add(memEl); hasText = true; }
	          }
	          if (memEl.getAttribute(HOST_ATTR) !== null && hostIdx === -1) { host = mem; hostIdx = hp; }
	          if (hasText && boxOk && firstVis === null) { firstVis = mem; firstVisIdx = hp; }
	          if (hasText && boxOk && !isRun && firstBody === null) { firstBody = mem; firstBodyIdx = hp; }
	        }
	        // 只允许「向上」修正：锁定的宿主比第一个可见正文块更靠后时，挪到前面那个。
	        // 绝不向下挪 —— 向下会让昵称跟着内容出现往下跳。
	        if (host === null) {
	          host = firstBody !== null ? firstBody : firstVis;
	        } else if (firstBody !== null && firstBodyIdx < hostIdx) {
	          host = firstBody;
	        } else if (host.el.getAttribute(RUN_MARK) !== null && firstBody !== null) {
	          // 运行行只是开场临时宿主：组内出现可见正文块就升级
	          host = firstBody;
	        }
	        if (host === null) { anyUnresolved = true; continue; }
	        for (var k = 0; k < groups[g].length; k++) {
	          var blk = groups[g][k].el;
	          shiftForAvatar(blk, false);
	          var hasAv = blk.getAttribute(HOST_ATTR) !== null;
	          if (host !== null && blk === host.el) {
	            if (!hasAv) injectAvatar(blk, false);
	          } else if (hasAv) {
	            removeAvatar(blk);
	          }
	        }
	      }
	      if (anyUnresolved === true) scheduleRecheck(container);
	    }

	    /**
	    * 导航图标：官方设置壳的图标是照 section id 硬编码映射的（navIcon(id)），
	    * 没映射到的 id 一律给齿轮，也没有开放图标接口。这里只把我们自己那一行
	    * 的 svg 内容原位换成官方人像图标（同 id 幂等；原位改，React 重渲染不打架）。
	    */
	    function patchNavIcon() {
	      try {
	        if (typeof document === "undefined") return;
	        var dialog = document.querySelector('[role="dialog"]');
	        if (dialog === null) return;
	        if (dialog.querySelector("svg[" + ICON_MARK + "]") !== null) return;
	        var nav = dialog.querySelector("nav");
	        if (nav === null) return;
	        var labels = [ZH.nav, EN.nav];
	        var cells = nav.querySelectorAll("button");
	        for (var i = 0; i < cells.length; i++) {
	          if (labels.indexOf((cells[i].textContent || "").trim()) === -1) continue;
	          var icon = cells[i].querySelector("svg");
	          if (icon === null) return;
	          var ns = "http://www.w3.org/2000/svg";
	          while (icon.firstChild) icon.removeChild(icon.firstChild);
	          icon.setAttribute("stroke-width", "1.3");
	          icon.setAttribute(ICON_MARK, "");
	          var head = document.createElementNS(ns, "path");
	          head.setAttribute("d", "M8 8.25C9.51878 8.25 10.75 7.01878 10.75 5.5C10.75 3.98122 9.51878 2.75 8 2.75C6.48122 2.75 5.25 3.98122 5.25 5.5C5.25 7.01878 6.48122 8.25 8 8.25Z");
	          head.setAttribute("stroke", "currentColor");
	          var body = document.createElementNS(ns, "path");
	          body.setAttribute("d", "M2.5 14.5C2.5 11.5 5.25 10.25 8 10.25C10.75 10.25 13.5 11.5 13.5 14.5");
	          body.setAttribute("stroke", "currentColor");
	          icon.appendChild(head);
	          icon.appendChild(body);
	          return;
	        }
	      } catch (e) { /* 图标补丁失败不影响设置区 */ }
	    }

	    // ── 主界面「资源管理器」按钮 ────────────────────────────
	    // 勾选后插在标题栏「更多操作（...）」按钮的左边，点击打开当前工作区目录。
	    // 目录解析顺序：当前选中会话的 workspaceId → 该工作区 path → 会话 cwd → 第一个工作区。
	    function explorerFlag() {
	      try { return localStorage.getItem(EXPLORER_KEY) === "1"; } catch (e) { return false; }
	    }
	    function setExplorerFlag(on) {
	      explorerEnabled = on === true;
	      try { localStorage.setItem(EXPLORER_KEY, explorerEnabled ? "1" : "0"); } catch (e) { /* 忽略 */ }
	      syncExplorerButton();
	    }
	    function activeSessionId() {
	      try {
	        var row = document.querySelector('[data-row-key^="session:"][aria-selected="true"]');
	        if (row !== null) return String(row.getAttribute("data-row-key")).slice("session:".length);
	        // 兜底：窗口标题 = "<会话标题> — DeepSeek Harness"
	        var t = String(document.title || "").split(" — ")[0].trim();
	        if (t.length > 0) {
	          var rows = document.querySelectorAll('[data-row-key^="session:"]');
	          for (var i = 0; i < rows.length; i++) {
	            var txt = (rows[i].textContent || "").replace(/\s+/g, " ").trim();
	            if (txt.indexOf(t) === 0) return String(rows[i].getAttribute("data-row-key")).slice("session:".length);
	          }
	        }
	      } catch (e) { /* 忽略 */ }
	      return "";
	    }
	    function resolveWorkspacePath() {
	      var ctx = pluginCtx;
	      if (ctx === null) return null;
	      try {
	        var items = [];
	        try {
	          var snap = ctx.workspaces.list.getSnapshot();
	          items = snap !== null && snap !== void 0 && Array.isArray(snap.items) ? snap.items : [];
	        } catch (e0) { items = []; }
	        var sid = activeSessionId();
	        var summary = null;
	        try {
	          var sm = ctx.sessions.list.getSnapshot();
	          if (sid.length > 0 && sm !== null && sm !== void 0 && sm.byId !== void 0) summary = sm.byId[sid];
	        } catch (e1) { summary = null; }
	        if (summary !== null && summary !== void 0) {
	          if (typeof summary.workspaceId === "string" && summary.workspaceId.length > 0) {
	            for (var i = 0; i < items.length; i++) {
	              if (items[i] !== null && items[i] !== void 0 && items[i].workspaceId === summary.workspaceId && typeof items[i].path === "string" && items[i].path.length > 0) return items[i].path;
	            }
	          }
	          if (typeof summary.cwd === "string" && summary.cwd.length > 0) return summary.cwd;
	          if (typeof summary.workingDirectory === "string" && summary.workingDirectory.length > 0) return summary.workingDirectory;
	        }
	        for (var j = 0; j < items.length; j++) {
	          if (items[j] !== null && items[j] !== void 0 && typeof items[j].path === "string" && items[j].path.length > 0) return items[j].path;
	        }
	      } catch (e2) { /* 忽略 */ }
	      return null;
	    }
	    function openCurrentWorkspace() {
	      var ctx = pluginCtx;
	      if (ctx === null) return;
	      var path = resolveWorkspacePath();
	      if (path === null) return;
	      try {
	        var svc = ctx.get("remote.session");
	        if (svc === void 0 || svc === null || typeof svc.openWorkspacePath !== "function") return;
	        // 不传 action：直接打开该目录本身（与会话管理里「打开会话目录」一致）
	        Promise.resolve(svc.openWorkspacePath({ path: path })).catch(function () { /* 忽略 */ });
	      } catch (e3) { /* 忽略 */ }
	    }
	    function findMoreActionsButton() {
	      try {
	        var bs = document.querySelectorAll("button");
	        for (var i = 0; i < bs.length; i++) {
	          var label = (bs[i].getAttribute("aria-label") || bs[i].getAttribute("title") || "").trim();
	          if (label === "更多操作" || label === "More actions") {
	            var r = bs[i].getBoundingClientRect();
	            if (r.width > 0) return bs[i];
	          }
	        }
	      } catch (e) { /* 忽略 */ }
	      return null;
	    }
	    function syncExplorerButton() {
	      try {
	        if (explorerEnabled !== true) {
	          if (explorerBtnEl !== null && explorerBtnEl.isConnected === true) explorerBtnEl.remove();
	          explorerBtnEl = null;
	          return;
	        }
	        var more = findMoreActionsButton();
	        if (more === null) return;
	        var wrap = more.parentElement;
	        if (wrap === null) return;
	        if (explorerBtnEl === null || explorerBtnEl.isConnected !== true) {
	          // 插件重启/热更后旧按钮可能还留在 DOM：先认领，避免越插越多
	          var adopted = wrap.querySelector('button[aria-label="资源管理器"]');
	          if (adopted === null) adopted = document.querySelector('button[aria-label="资源管理器"]');
	          if (adopted !== null) {
	            explorerBtnEl = adopted;
	          } else {
	            explorerBtnEl = document.createElement("button");
	            explorerBtnEl.type = "button";
	            explorerBtnEl.className = "zy_explorerBtn";
	            explorerBtnEl.title = "资源管理器";
	            explorerBtnEl.setAttribute("aria-label", "资源管理器");
	            explorerBtnEl.textContent = "📂";
	            explorerBtnEl.addEventListener("click", function (ev) {
	              ev.preventDefault();
	              ev.stopPropagation();
	              openCurrentWorkspace();
	            });
	          }
	        }
	        // 清掉重复的同名按钮（重启/多实例残留），只留当前这一个
	        var allBtns = document.querySelectorAll('button[aria-label="资源管理器"]');
	        for (var bi = 0; bi < allBtns.length; bi++) {
	          if (allBtns[bi] !== explorerBtnEl) allBtns[bi].remove();
	        }
	        if (explorerBtnEl.parentElement !== wrap || explorerBtnEl.nextElementSibling !== more) {
	          wrap.insertBefore(explorerBtnEl, more);
	        }
	      } catch (e) { /* 忽略 */ }
	    }

	    // ── 输入框「提示词优化」按钮 ────────────────────────────
	    // 勾选后插在模型胶囊左边。点击：读输入框文本 + 当前会话模型 →
	    // host 侧一次性调用该模型（带最近上下文）→ 结果写回输入框。
	    function polishFlag() {
	      try { return localStorage.getItem(POLISH_KEY) === "1"; } catch (e) { return false; }
	    }
	    function setPolishFlag(on) {
	      polishEnabled = on === true;
	      try { localStorage.setItem(POLISH_KEY, polishEnabled ? "1" : "0"); } catch (e) { /* 忽略 */ }
	      syncPolishButton();
	    }
	    // 输入框是 Lexical 编辑器（div[data-composer-input][contenteditable]）
	    function findComposerInput() {
	      try {
	        var list = document.querySelectorAll('[data-composer-input][contenteditable="true"]');
	        for (var i = 0; i < list.length; i++) {
	          var r = list[i].getBoundingClientRect();
	          if (r.width > 0 && r.height > 0) return list[i];
	        }
	      } catch (e) { /* 忽略 */ }
	      return null;
	    }
	    function composerText(el) {
	      try { return String(el.innerText || "").replace(/\u00a0/g, " ").trim(); } catch (e) { return ""; }
	    }
	    // 当前会话模型：projectionsBySession[sessionId].values.modelSelection.next ?? lastUsed
	    function projectedRouteSync() {
	      try {
	        if (pluginCtx === null) return null;
	        var snap = pluginCtx.sessions.list.getSnapshot();
	        var bySession = snap !== null && snap !== void 0 ? snap.projectionsBySession : null;
	        if (bySession === null || bySession === void 0) return null;
	        var entry = bySession[activeSessionId()];
	        if (entry === void 0 || entry === null || entry.values === void 0 || entry.values === null) return null;
	        var ms = entry.values.modelSelection;
	        if (ms === void 0 || ms === null) return null;
	        var pick = ms.next !== void 0 && ms.next !== null ? ms.next : ms.lastUsed;
	        if (pick === void 0 || pick === null || typeof pick.model !== "string") return null;
	        return {
	          provider: String(pick.provider),
	          model: String(pick.model),
	          reasoningEffort: typeof pick.reasoningEffort === "string" ? pick.reasoningEffort : ""
	        };
	      } catch (e) { return null; }
	    }
	    // 模型胶囊上显示的模型名（用于投影缺 modelSelection 时反查 provider）
	    function capsuleModelName() {
	      try {
	        var btn = findModelTrigger();
	        if (btn === null) return "";
	        var label = btn.querySelector('span[class*="triggerLabel"]');
	        var text = label !== null ? label.textContent : btn.textContent;
	        return String(text || "").replace(/\s+/g, " ").trim();
	      } catch (e) { return ""; }
	    }
	    // 宿主全局模型目录：remote.session.modelCatalog() → [{ provider, model, name }]
	    function readModelCatalog() {
	      try {
	        if (pluginCtx === null) return Promise.resolve(null);
	        var remote = pluginCtx.get("remote.session");
	        if (remote === void 0 || remote === null || typeof remote.modelCatalog !== "function") return Promise.resolve(null);
	        return Promise.resolve(remote.modelCatalog()).then(function (result) {
	          if (result === void 0 || result === null || result.ok !== true) return null;
	          var groups = result.value !== void 0 && Array.isArray(result.value.groups) ? result.value.groups : [];
	          var out = [];
	          for (var i = 0; i < groups.length; i++) {
	            var group = groups[i];
	            if (group === null || group === void 0) continue;
	            var provider = typeof group.id === "string" ? group.id : (typeof group.provider === "string" ? group.provider : "");
	            var models = Array.isArray(group.models) ? group.models : [];
	            for (var j = 0; j < models.length; j++) {
	              var m = models[j];
	              if (m === null || m === void 0 || typeof m.id !== "string") continue;
	              out.push({ provider: provider, model: m.id, name: typeof m.name === "string" ? m.name : m.id });
	            }
	          }
	          return out;
	        }, function () { return null; });
	      } catch (e) { return Promise.resolve(null); }
	    }
	    // 用胶囊上的文字在目录里反查 provider/model（去掉「Max / High」这类档位后缀）
	    function routeFromCapsuleText() {
	      var text = capsuleModelName();
	      if (text.length === 0) return Promise.resolve(null);
	      return readModelCatalog().then(function (list) {
	        if (list === null || list.length === 0) return null;
	        var cleaned = text.replace(/\s*(Max|High|Medium|Low|Minimal|最高|高|中|低|最低)\s*$/i, "").trim();
	        var hits = [];
	        for (var i = 0; i < list.length; i++) {
	          var item = list[i];
	          if (item.name === cleaned || item.model === cleaned) { hits.push(item); continue; }
	          if (cleaned.indexOf(item.name) === 0 || cleaned.indexOf(item.model) === 0) hits.push(item);
	        }
	        if (hits.length === 0) return null;
	        // 取最长匹配，避免 flash 抢先于 flash-vision 之类的短名
	        hits.sort(function (a, b) { return (b.name.length + b.model.length) - (a.name.length + a.model.length); });
	        return { provider: hits[0].provider, model: hits[0].model, reasoningEffort: "" };
	      });
	    }
	    // 先读投影；投影里没有 modelSelection（新会话/切换中）时用胶囊文本反查
	    function currentModelRoute() {
	      var direct = projectedRouteSync();
	      if (direct !== null) return Promise.resolve(direct);
	      return routeFromCapsuleText();
	    }
	    // 写回 Lexical：优先走编辑器自己的 EditorState（execCommand/input 会被编辑器吞掉），
	    // 拿不到编辑器实例时退回「全选 + insertText」。
	    // 换行用 linebreak 叶子节点而不是多个 paragraph：paragraph 之间的段落间距会让
	    // innerText 把每个 \n 显示成两个，提交内容也随之膨胀。
	    function polishEditorState(text) {
	      var lines = String(text).replace(/\r\n/g, "\n").split("\n");
	      var children = [];
	      for (var i = 0; i < lines.length; i++) {
	        if (i > 0) children.push({ type: "linebreak", version: 1 });
	        if (lines[i].length > 0) {
	          children.push({ detail: 0, format: 0, mode: "normal", style: "", text: lines[i], type: "text", version: 1 });
	        }
	      }
	      return {
	        root: {
	          children: [{
	            children: children,
	            direction: "ltr",
	            format: "",
	            indent: 0,
	            type: "paragraph",
	            version: 1,
	            textFormat: 0,
	            textStyle: ""
	          }],
	          direction: "ltr",
	          format: "",
	          indent: 0,
	          type: "root",
	          version: 1
	        }
	      };
	    }
	    function replaceComposerText(el, text) {
	      try {
	        var editor = el.__lexicalEditor;
	        if (editor !== void 0 && editor !== null &&
	            typeof editor.parseEditorState === "function" &&
	            typeof editor.setEditorState === "function") {
	          var next = editor.parseEditorState(JSON.stringify(polishEditorState(text)));
	          editor.setEditorState(next);
	          try { editor.focus(); } catch (eFocus) { /* 聚焦失败不影响内容 */ }
	          return true;
	        }
	      } catch (eLex) { /* 落到 DOM 兜底 */ }
	      var done = false;
	      try { el.focus(); } catch (e0) { /* 聚焦失败照常尝试 */ }
	      try {
	        var sel = window.getSelection();
	        var range = document.createRange();
	        range.selectNodeContents(el);
	        sel.removeAllRanges();
	        sel.addRange(range);
	        done = document.execCommand("insertText", false, text) === true;
	      } catch (e) { done = false; }
	      return done;
	    }
	    // 失败：按钮红闪 + 气泡提示（气泡是唯一能看到原因的地方，不再只靠 title）
	    function flashPolish(btn, msg) {
	      try {
	        btn.title = msg;
	        btn.setAttribute("data-zy-error", "1");
	        setTimeout(function () {
	          if (btn.isConnected !== true) return;
	          btn.removeAttribute("data-zy-error");
	          btn.title = "优化提示词";
	        }, 3200);
	      } catch (e) { /* 忽略 */ }
	      showPolishToast(btn, msg);
	    }
	    // 失败时的可见提示：按钮上方一个小气泡，带「重试」，7 秒后自动消失
	    function showPolishToast(anchor, message) {
	      try {
	        if (anchor === null || typeof document === "undefined") return;
	        if (polishToastEl !== null && polishToastEl.isConnected === true) polishToastEl.remove();
	        polishToastEl = null;
	        var wrap = anchor.parentElement;
	        if (wrap === null) return;
	        var box = document.createElement("div");
	        box.className = "zy_polishToast";
	        var text = document.createElement("span");
	        text.className = "zy_polishToastText";
	        text.textContent = message;
	        var retry = document.createElement("button");
	        retry.type = "button";
	        retry.className = "zy_polishToastRetry";
	        retry.textContent = "重试";
	        retry.addEventListener("click", function (ev) {
	          ev.preventDefault();
	          ev.stopPropagation();
	          if (box.isConnected === true) box.remove();
	          if (polishToastEl === box) polishToastEl = null;
	          polishCurrentInput(anchor);
	        });
	        box.appendChild(text);
	        box.appendChild(retry);
	        document.body.appendChild(box);
	        polishToastEl = box;
	        // 气泡用 fixed 定位：父容器（模型胶囊 root）只有按钮那么宽，relative 定位会被裁
	        try {
	          var ar = anchor.getBoundingClientRect();
	          var cx = ar.left + ar.width / 2;
	          box.style.left = Math.round(cx) + "px";
	          box.style.transform = "translateX(-50%)";
	          var bw = box.offsetWidth;
	          var bh = box.offsetHeight;
	          var leftEdge = cx - bw / 2;
	          var rightEdge = cx + bw / 2;
	          if (leftEdge < 4) {
	            box.style.transform = "none";
	            box.style.left = "4px";
	          } else if (rightEdge > window.innerWidth - 4) {
	            box.style.transform = "none";
	            box.style.left = Math.round(window.innerWidth - bw - 4) + "px";
	          }
	          box.style.top = Math.round(ar.top - bh - 8) + "px";
	        } catch (ePos) { box.style.left = "8px"; box.style.transform = "none"; }
	        // 10 秒自动消失；点气泡以外任意处也立即消失
	        var closeToast = function () {
	          try { clearTimeout(toastTimer); } catch (e) { /* 忽略 */ }
	          try { document.removeEventListener("mousedown", onOutside, true); } catch (e2) { /* 忽略 */ }
	          if (box.isConnected === true) box.remove();
	          if (polishToastEl === box) polishToastEl = null;
	        };
	        var onOutside = function (ev) {
	          if (box.contains(ev.target) === true) return;
	          closeToast();
	        };
	        var toastTimer = setTimeout(closeToast, 10000);
	        document.addEventListener("mousedown", onOutside, true);
	      } catch (e) { /* 忽略 */ }
	    }
	    function showPolishSpinner(btn) {
	      // 内联 SVG 圆环：2πr ≈ 37.7，dash 26 + 12 露出一段弧；靠 CSS 旋转
	      try {
	        var ns = "http://www.w3.org/2000/svg";
	        var svg = document.createElementNS(ns, "svg");
	        svg.setAttribute("viewBox", "0 0 16 16");
	        svg.setAttribute("width", "14");
	        svg.setAttribute("height", "14");
	        svg.setAttribute("aria-hidden", "true");
	        var track = document.createElementNS(ns, "circle");
	        track.setAttribute("cx", "8");
	        track.setAttribute("cy", "8");
	        track.setAttribute("r", "6");
	        track.setAttribute("fill", "none");
	        track.setAttribute("stroke", "currentColor");
	        track.setAttribute("stroke-width", "2");
	        track.setAttribute("opacity", "0.22");
	        var arc = document.createElementNS(ns, "circle");
	        arc.setAttribute("cx", "8");
	        arc.setAttribute("cy", "8");
	        arc.setAttribute("r", "6");
	        arc.setAttribute("fill", "none");
	        arc.setAttribute("stroke", "currentColor");
	        arc.setAttribute("stroke-width", "2");
	        arc.setAttribute("stroke-linecap", "round");
	        arc.setAttribute("stroke-dasharray", "26 12");
	        svg.appendChild(track);
	        svg.appendChild(arc);
	        btn.textContent = "";
	        btn.appendChild(svg);
	      } catch (e) {
	        btn.textContent = "";
	      }
	    }
	    function polishCurrentInput(btn) {
	      if (btn === null || btn.getAttribute("data-zy-busy") === "1") return;
	      var el = findComposerInput();
	      if (el === null) { flashPolish(btn, "找不到输入框"); return; }
	      // 空草稿也允许：host 会用上下文里最近的助手回复生成下一步指令
	      var text = composerText(el);
	      currentModelRoute().then(function (route) {
	        if (route === null || route === void 0) { flashPolish(btn, "读不到当前模型"); return; }
	        btn.setAttribute("data-zy-busy", "1");
	        showPolishSpinner(btn);
	        btn.title = "正在用 " + route.model + " 优化…";
	        return wireCall("avatar", "polishPrompt", {
	          request: {
	            text: text,
	            provider: route.provider,
	            model: route.model,
	            sessionId: activeSessionId()
	          }
	        }).then(function (result) {
	          btn.removeAttribute("data-zy-busy");
	          btn.textContent = "✨";
	          btn.title = "优化提示词";
	          var next = result !== null && result !== void 0 && typeof result.text === "string" ? result.text : "";
	          if (next.length === 0) { flashPolish(btn, "模型没返回内容"); return; }
	          var ok = replaceComposerText(el, next);
	          if (ok !== true) flashPolish(btn, "写回输入框失败");
	        });
	      }).catch(function (err) {
	        // 路由解析或调用内部抛的异常也接住，统一走气泡
	        btn.removeAttribute("data-zy-busy");
	        btn.textContent = "✨";
	        btn.title = "优化提示词";
	        flashPolish(btn, "出错了：" + String(err && err.message ? err.message : err));
	      });
	    }
	    // 模型胶囊 trigger：优先官方 aria/title「选择模型」；兜底含 data-provider-id 的 label
	    function findModelTrigger() {
	      try {
	        var byLabel = ['button[aria-label="选择模型"]', 'button[title="选择模型"]', 'button[aria-label="Select model"]', 'button[title="Select model"]'];
	        for (var c = 0; c < byLabel.length; c++) {
	          var hits = document.querySelectorAll(byLabel[c]);
	          for (var h = 0; h < hits.length; h++) {
	            var hr = hits[h].getBoundingClientRect();
	            if (hr.width > 0 && hr.height > 0) return hits[h];
	          }
	        }
	        var labels = document.querySelectorAll('button [data-provider-id][data-model-id]');
	        for (var i = 0; i < labels.length; i++) {
	          var btn = labels[i].closest("button");
	          if (btn === null) continue;
	          var r = btn.getBoundingClientRect();
	          if (r.width > 0 && r.height > 0) return btn;
	        }
	      } catch (e) { /* 忽略 */ }
	      return null;
	    }
	    function syncPolishButton() {
	      try {
	        if (polishEnabled !== true) {
	          if (polishBtnEl !== null && polishBtnEl.isConnected === true) polishBtnEl.remove();
	          polishBtnEl = null;
	          return;
	        }
	        var trigger = findModelTrigger();
	        if (trigger === null) return;
	        var wrap = trigger.parentElement;
	        if (wrap === null) return;
	        if (polishBtnEl === null || polishBtnEl.isConnected !== true) {
	          // 插件重启/热更后旧按钮可能还留在 DOM：先认领，避免越插越多
	          var adopted = wrap.querySelector('button[aria-label="优化提示词"]');
	          if (adopted === null) adopted = document.querySelector('button[aria-label="优化提示词"]');
	          if (adopted !== null) {
	            polishBtnEl = adopted;
	          } else {
	            polishBtnEl = document.createElement("button");
	            polishBtnEl.type = "button";
	            polishBtnEl.className = "zy_polishBtn";
	            polishBtnEl.title = "优化提示词";
	            polishBtnEl.setAttribute("aria-label", "优化提示词");
	            polishBtnEl.textContent = "✨";
	            polishBtnEl.addEventListener("click", function (ev) {
	              ev.preventDefault();
	              ev.stopPropagation();
	              polishCurrentInput(polishBtnEl);
	            });
	          }
	        }
	        // 清掉重复的同名按钮（重启/多实例残留），只留当前这一个
	        var allBtns = document.querySelectorAll('button[aria-label="优化提示词"]');
	        for (var bi = 0; bi < allBtns.length; bi++) {
	          if (allBtns[bi] !== polishBtnEl) allBtns[bi].remove();
	        }
	        if (polishBtnEl.parentElement !== wrap || polishBtnEl.nextElementSibling !== trigger) {
	          wrap.insertBefore(polishBtnEl, trigger);
	        }
	      } catch (e) { /* 忽略 */ }
	    }

	    // 插件停用/卸载时清理本插件写进 DOM 的东西：头像属性、缩进标记、内联变量、
	    // 资源管理器按钮、导航图标标记、插件样式。只认本插件标记，不碰 React 属主节点。
	    function disposeAvatarDom() {
	      try {
	        if (typeof document === "undefined") return;
	        var marked = document.querySelectorAll("[" + HOST_ATTR + "], [" + AI_SHIFT + "], [" + USER_SHIFT + "], [" + RUN_ATTR + "], [" + RUN_MARK + "], [" + BOX_MARK + "], [" + AV_MARK + "], [" + NAME_MARK + "]");
	        for (var i = 0; i < marked.length; i++) {
	          var el = marked[i];
	          el.removeAttribute(HOST_ATTR);
	          el.removeAttribute(NAME_ATTR);
	          el.removeAttribute(RUN_ATTR);
	          el.removeAttribute(AI_SHIFT);
	          el.removeAttribute(USER_SHIFT);
	          el.removeAttribute(RUN_MARK);
	          el.removeAttribute(BOX_MARK);
	          el.removeAttribute(AV_MARK);
	          el.removeAttribute(NAME_MARK);
	          if (el.style !== void 0 && el.style !== null && typeof el.style.removeProperty === "function") {
	            el.style.removeProperty("--zy-size");
	            el.style.removeProperty("--zy-round");
	            el.style.removeProperty("--zy-font");
	            el.style.removeProperty("--zy-url");
	            el.style.removeProperty("--zy-letter");
	            el.style.removeProperty("--zy-dy");
	          }
	        }
	        var icons = document.querySelectorAll("svg[" + ICON_MARK + "]");
	        for (var j = 0; j < icons.length; j++) icons[j].removeAttribute(ICON_MARK);
	        if (explorerBtnEl !== null && explorerBtnEl.isConnected === true) explorerBtnEl.remove();
	        explorerBtnEl = null;
	        if (polishBtnEl !== null && polishBtnEl.isConnected === true) polishBtnEl.remove();
	        polishBtnEl = null;
	        if (polishToastEl !== null && polishToastEl.isConnected === true) polishToastEl.remove();
	        polishToastEl = null;
	        var styles = document.querySelectorAll('style[data-plugin="dsh-avatar"]');
	        for (var k = 0; k < styles.length; k++) styles[k].remove();
	      } catch (e) { /* 清理失败不阻塞停用流程 */ }
	    }

	    // 消息流头像的全局样式：**提前在场**，让「运行中」状态行的位置第一帧就是最终位置
	    //（此前靠 JS 注入 flex 会先按官方默认位置渲染一帧再跳到底部，视觉上"跳一下"）
	    function installFlowStyles() {
	      if (typeof document === "undefined") return;
	      if (document.querySelector("style[data-plugin-css=" + JSON.stringify("dsh-avatar/flow.css") + "]") !== null) return;
	      var tag = document.createElement("style");
	      tag.dataset.plugin = "dsh-avatar";
	      tag.dataset.pluginCss = "dsh-avatar/flow.css";
	      tag.textContent = "[data-chat-running]{display:flex;flex-direction:column;min-height:calc(var(--dsh-avatar-size,40px) + 2px)}" +
	        "[data-chat-running] [class*=\"runningContent\"]{margin-top:auto}" +
	        // ── 方案 B：头像/昵称全靠属性 + 伪元素渲染，不建 DOM 节点 ──
	        // 让位缩进（属性驱动，React 重渲染不会清属性）
	        "[data-ziyong-ai-shift]{position:relative;padding-left:calc(var(--zy-size,40px) + 12px)}" +
	        "[data-ziyong-user-shift]{position:relative;padding-right:calc(var(--zy-size,40px) + 12px)}" +
	        // 通用宿主（默认给昵称留 16px，用户消息用）
	        "[data-zy-av]{position:relative;padding-top:16px}" +
	        "[data-zy-av]::before{content:var(--zy-letter,\"\");position:absolute;top:2px;width:var(--zy-size,40px);height:var(--zy-size,40px);display:flex;align-items:center;justify-content:center;background-color:var(--zy-bg,transparent);background-image:var(--zy-url,none);background-size:cover;background-position:center;clip-path:inset(0 round var(--zy-round,20px));color:#fff;font-size:var(--zy-font,18px);font-weight:600;overflow:hidden}" +
	        "[data-zy-av]::after{content:attr(data-zy-name);position:absolute;top:0;left:0;right:0;height:16px;line-height:16px;font-size:12px;color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-sizing:border-box;pointer-events:none}" +
	        // AI：昵称画在块上方的 16px 间距里，不额外占块内高度（避免多出一条空白）
	        "[data-zy-av=\"ai\"]::before{top:2px;left:0}" +
	        "[data-zy-av=\"ai\"]::after{top:0;text-align:left;padding-left:calc(var(--zy-size,40px) + 12px)}" +
	        // 用户：昵称在块内顶部 16px 预留区，头像贴右
	        "[data-zy-av=\"user\"]::before{top:2px;right:0}" +
	        "[data-zy-av=\"user\"]::after{text-align:right;padding-right:calc(var(--zy-size,40px) + 12px)}" +
	        // 运行行宿主：撑到容纳头像，状态行内容贴底
	        "[data-zy-run]{display:flex;flex-direction:column;min-height:calc(var(--zy-size,40px) + 2px)}" +
	        "[data-zy-run] [class*=\"runningContent\"]{margin-top:auto}" +
	        // 用户消息气泡去掉背景（原内联样式改 CSS，React 重渲染也不丢）
	        "[data-zy-av=\"user\"] [class*=\"bubble\"]{background:transparent!important;border:none!important;border-radius:0!important;padding:0!important}" +
		        // 主界面资源管理器图标按钮：尺寸/圆角与官方 ghost 小按钮一致
		        ".zy_explorerBtn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;flex:none;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font-size:15px;line-height:1;cursor:pointer;padding:0}" +
		        ".zy_explorerBtn:hover{background:var(--dsw-alias-interactive-bg-hover)}" +
		        // 输入框提示词优化图标按钮：与模型胶囊同高，紧凑一点
		        ".zy_polishBtn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;flex:none;margin-right:2px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-primary);font-size:14px;line-height:1;cursor:pointer;padding:0;transition:background .12s}" +
		        ".zy_polishBtn:hover{background:var(--dsw-alias-interactive-bg-hover)}" +
		        // 优化中转圈：用内联 SVG 圆（该环境 border-radius 50% 会被渲染成圆角方块）
		        ".zy_polishBtn[data-zy-busy=\"1\"]{cursor:progress;opacity:.9}" +
		        ".zy_polishBtn[data-zy-busy=\"1\"] svg{display:block;animation:zy_polish_spin .8s linear infinite}" +
		        "@keyframes zy_polish_spin{to{transform:rotate(360deg)}}" +
		        ".zy_polishBtn[data-zy-error=\"1\"]{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#e5484d) 22%,transparent)}" +
		        // 失败提示气泡：贴在按钮上方，带「重试」
		        ".zy_polishToast{position:fixed;left:0;top:0;transform:translateX(-50%);display:flex;align-items:center;gap:8px;width:max-content;max-width:340px;padding:7px 8px 7px 10px;border-radius:9px;background:var(--dsw-alias-bg-layer-3,#2a2a2c);border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.14));box-shadow:0 8px 24px rgba(0,0,0,.38);font-size:12px;line-height:1.45;color:var(--dsw-alias-label-primary);z-index:40}" +
		        ".zy_polishToastText{flex:1;min-width:0;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere}" +
		        ".zy_polishToastRetry{flex:none;border:0;border-radius:6px;padding:3px 9px;background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.1));color:inherit;font:inherit;font-size:12px;cursor:pointer}" +
		        ".zy_polishToastRetry:hover{background:var(--dsw-alias-interactive-bg-active,rgba(255,255,255,.16))}";
		      document.head.appendChild(tag);
		    }
	    /** 头像尺寸写进 CSS 变量：只作「运行中状态行第一帧」的 min-height 兜底。
	     *  低频调用（加载/保存），拖动路径不经过这里（改变量会触发全文档样式重算）。 */
	    function applySizeVar() {
	      try {
	        document.documentElement.style.setProperty("--dsh-avatar-size", avatarSize() + "px");
	      } catch (e) { /* 忽略 */ }
	    }

	    // 宽屏模式（锁定最大）：把 --dsh-chat-user-width 锁到官方「手柄拉到最大」的值，并随窗口自动跟随。
	    // 官方机制（源码实测 resolveContentWidth）：max = max(640, 列宽 - 176)，列宽 = --dsh-conversation-column-width（随窗口变）。
	    // 官方在拖动手柄 / 窗口变化时会重写这两个变量：开启时用 observer 幂等顶回（锁定最大）；
	    // 关闭时只在切换那一刻恢复一次 localStorage 偏好、之后不干预（否则会和官方拖动互相覆盖，拖动发卡）。
	    var wideObserver = null;
	    var wideObservedEl = null;
	    function wideTarget() {
	      var el = wideObservedEl !== null && wideObservedEl.isConnected === true
	        ? wideObservedEl
	        : document.querySelector("[style*='--dsh-conversation-column-width']");
	      if (el === null || el === void 0 || el.isConnected !== true) return null;
	      // 只读内联变量（官方就是写在内联 style 上），不走 getComputedStyle，避免拖动时强制样式刷新
	      var col = parseFloat(el.style.getPropertyValue("--dsh-conversation-column-width"));
	      if (!isFinite(col) || col <= 0) return null;
	      return { el: el, max: Math.max(640, Math.round(col - 176)) };
	    }
	    function applyWideChatLock() {
	      try {
	        var t = wideTarget();
	        if (t === null) return;
	        if (parseFloat(t.el.style.getPropertyValue("--dsh-chat-user-width")) !== t.max) {
	          t.el.style.setProperty("--dsh-chat-user-width", t.max + "px");
	        }
	      } catch (e) { /* 忽略 */ }
	    }
	    function restoreWideChat() {
	      try {
	        var t = wideTarget();
	        if (t === null) return;
	        var pref = NaN;
	        try { pref = Number(localStorage.getItem("dsh.conversation.contentWidth")); } catch (e2) { pref = NaN; }
	        if (isFinite(pref) && pref > 0) {
	          var want = Math.min(Math.max(pref, 640), t.max);
	          if (parseFloat(t.el.style.getPropertyValue("--dsh-chat-user-width")) !== want) {
	            t.el.style.setProperty("--dsh-chat-user-width", want + "px");
	          }
	        } else {
	          t.el.style.removeProperty("--dsh-chat-user-width");
	        }
	      } catch (e) { /* 忽略 */ }
	    }
	    function ensureWideObserver() {
	      try {
	        var t = wideTarget();
	        if (t === null) return;
	        if (wideObservedEl === t.el) return;
	        if (wideObserver !== null) wideObserver.disconnect();
	        wideObservedEl = t.el;
	        wideObserver = new MutationObserver(function () {
	          if (cfg !== null && cfg !== void 0 && cfg.wideChat === true) applyWideChatLock();
	        });
	        wideObserver.observe(t.el, { attributes: true, attributeFilter: ["style"] });
	        // 挂到新元素后立刻锁一次：切页签回来/窗口刚放大时，官方可能还没写列宽，
	        // 所以下一帧再补一次（否则要等官方或消息渲染改 style 才跟随，用户实测「慢半拍」）。
	        if (cfg !== null && cfg !== void 0 && cfg.wideChat === true) {
	          applyWideChatLock();
	          requestAnimationFrame(function () {
	            if (cfg !== null && cfg !== void 0 && cfg.wideChat === true) applyWideChatLock();
	          });
	        }
	      } catch (e) { /* 忽略 */ }
	    }

    function start() {
      if (observed || typeof MutationObserver === "undefined" || typeof document === "undefined" || !document.body) return;
	      observed = true;
      installFlowStyles();
      // Enter 换行模式（设置面板勾选后）：capture 阶段接管输入框的回车。
      //   · 纯 Enter：拦下官方「回车发送」，改成插入一个换行；
      //   · Ctrl/Cmd+Enter：发送（点一下发送按钮；dsh-file-drop 的 click 守卫会接力插附件路径）。
      // Shift/Alt+Enter 与输入法组合键（isComposing）一律放行。
      // 插入换行必须走 Lexical 自己的命令：输入框是 Lexical 编辑器，
      // document.execCommand 改 DOM 它不认（内容会被吞），合成 Shift+Enter 也不可信。
      // 挂在 window 捕获阶段 + stopImmediatePropagation：dsh-file-drop 的提交守卫也在
      // document 捕获拦回车（拖入文件后它会把回车变成"塞路径并发送"），同在 document
      // 层谁先注册谁赢；window 捕获先于 document 捕获，这里先手拦下，换行模式才不会被它抢走。
      // 想发送：Ctrl+Enter 或点发送按钮（file-drop 的 click 守卫会先把附件路径塞进消息）。
      window.addEventListener("keydown", function (ev) {
        if (injectingEnter === true) return;
        if (cfg === null || cfg === void 0 || cfg.enterNewline !== true) return;
        if (ev.key !== "Enter" || ev.isComposing === true) return;
        var el = ev.target;
        if (el === null || el === void 0 || el.isContentEditable !== true) return;
        if ((ev.ctrlKey === true || ev.metaKey === true) && ev.shiftKey !== true && ev.altKey !== true) {
          // Ctrl/Cmd+Enter = 发送：向编辑器派发一个「普通 Enter」的合成 keydown。
          // 不点发送按钮的原因（DSH 2.0.19+）：官方新增「繁忙时的发送行为」设置
          // （busyEnter: queue|steer），Enter/发送按钮用该模式，而 Ctrl/Cmd+Enter
          // 固定走互补模式（resolveSubmitMode 的 accelerated 分支）；繁忙时按钮还会
          // 变成「停止生成」或被禁用，点击可能落空。派发普通 Enter 让官方按 enter
          // 手势解析 → 用你设置的模式（如插话发送）提交；dsh-file-drop 的 Enter
          // 守卫照常接力（拖入附件时先塞真实路径）。
          ev.preventDefault();
          ev.stopImmediatePropagation();
          ev.stopPropagation();
          injectingEnter = true;
          try {
            el.dispatchEvent(new KeyboardEvent("keydown", {
              key: "Enter",
              code: "Enter",
              keyCode: 13,
              which: 13,
              bubbles: true,
              cancelable: true,
              composed: true
            }));
          } catch (e3) { /* 合成失败：本次按键只做拦截，不发送 */ }
          injectingEnter = false;
          return;
        }
        if (ev.shiftKey || ev.ctrlKey || ev.altKey || ev.metaKey) return;
        ev.preventDefault();
        ev.stopImmediatePropagation();
        ev.stopPropagation();
        var editor = el.__lexicalEditor;
        var done = false;
        if (editor !== void 0 && editor !== null && typeof editor.dispatchCommand === "function") {
          try {
            var cmd = null;
            editor._commands.forEach(function (v, k) {
              if (String(k && k.type) === "INSERT_LINE_BREAK_COMMAND") cmd = k;
            });
            if (cmd !== null) { editor.dispatchCommand(cmd, void 0); done = true; }
          } catch (e) { /* 落到下面的兜底 */ }
        }
        if (!done) {
          try { document.execCommand("insertLineBreak"); } catch (e2) { /* 插入失败不阻塞输入 */ }
        }
      }, true);
      // 窗口尺寸变化：官方在 resize 时重写 --dsh-conversation-column-width（可能带节流，
      // 也可能在页面切回来时才补写）。这里下一帧 + 140ms 各锁一次，保证「放大窗口 → 立刻铺满」，
      // 不用等下一次消息渲染（用户实测：原来要等窗口里有输出才跟随）。
      window.addEventListener("resize", function () {
        if (cfg === null || cfg === void 0 || cfg.wideChat !== true) return;
        requestAnimationFrame(function () {
          ensureWideObserver();
          applyWideChatLock();
        });
        setTimeout(function () {
          if (cfg !== null && cfg !== void 0 && cfg.wideChat === true) applyWideChatLock();
        }, 140);
      });
      loadConfig().then(function () {
	        applySizeVar();
	        // ── 增量扫描 ──────────────────────────────────────────
	        // 每个 token 都会触发 mutation，但容器"子节点结构"通常没变。这里先做
	        // 廉价校验（签名 + 头像是否还在），没变就整段跳过，避免每次突变都读
	        // offsetHeight 强制整页重排（实测 28~41ms/次）。
	        var knownContainers = [];
	        var rememberContainer = function (el) {
	          if (el === null || el === void 0) return;
	          if (knownContainers.indexOf(el) === -1) knownContainers.push(el);
	        };
	        var containerFor = function (target) {
	          if (target === null || target === void 0 || target.nodeType !== 1) return null;
	          if (typeof target.closest !== "function") return null;
	          // 消息块 → 取它的直接父容器（可能是主列表，也可能是活动盒）
	          var f = target.closest('[class*="flowItem"]');
	          if (f !== null && f.parentElement !== null) return f.parentElement;
	          // 新消息通常是直接 append 进 [data-slot=conversation.chat.flow] 这个容器
	          var slot = target.closest('[data-slot="conversation.chat.flow"]');
	          if (slot !== null) return slot;
	          return null;
	        };
	        var hostsValid = function (state) {
	          var hosts = state.hosts;
	          for (var i = 0; i < hosts.length; i++) {
	            var h = hosts[i];
	            if (h === null || h.isConnected !== true) return false;
	            if (h.getAttribute(HOST_ATTR) === null) return false;
	          }
	          return true;
	        };
	        var scanContainerCached = function (container, strict) {
	          if (container === null || container === void 0 || !cfg) return;
	          if (container.closest !== void 0 && container.closest("[" + BOX_MARK + "]") !== null) return;
	          var st = containerState.get(container);
	          var ch = container.children;
	          var first = ch.length > 0 ? ch[0] : null;
	          var last = ch.length > 0 ? ch[ch.length - 1] : null;
	          var same = st !== void 0 && st.n === ch.length && st.first === first && st.last === last;
	          if (same) {
	            // 热路径只做一次计数比对（1 次 querySelectorAll）；严格模式（低频对账）
	            // 才逐个校验宿主是否还在、头像是否还在——那边每 2s 才跑一次。
	            var ok = strict === true
	              ? hostsValid(st)
	              : container.isConnected === true && container.querySelectorAll("[" + HOST_ATTR + "]").length === st.hosts.length;
	            if (ok) return;
	          }
	          scanContainer(container);
	          containerState.set(container, {
	            n: ch.length,
	            first: first,
	            last: last,
	            hosts: Array.prototype.slice.call(container.querySelectorAll("[" + HOST_ATTR + "]"))
	          });
	        };
	        // 整块挂载兜底：切会话 / 从插件页切回 时，整个会话树是一次性插入的，
	        // 插入根在 flow 容器「之上」，containerFor 的 closest 找不到宿主 → 头像不注入，
	        // 要等下一次站内变动（新消息、懒加载历史）才补上（用户实测：切回来头像区域空一段）。
	        // 这里检测新增子树里有没有 flowItem，有就立刻同步补一次全量 scan：
	        // MutationObserver 回调时 React 这一批提交已经落 DOM，同步扫能与消息同帧出图；
	        // 靠 scanQueued 防重入（scan 注入头像会再触发 observer，但那批走的是廉价缓存校验）。
	        var scanQueued = false;
	        var queueScan = function () {
	          if (scanQueued === true) return;
	          scanQueued = true;
	          try { scan(); } catch (e) { /* 忽略 */ }
	          scanQueued = false;
	        };
	        // 新用户消息的直通补头像：认「用户行」本身，不依赖容器分类/缓存。
	        // 发送时 DSH 先往 flow 槽里插一个裸 userRow（还没有 flowItem 包裹），
	        // 之后才换成 flowItem；这两步都可能被容器签名缓存/分组判断跳过，
	        // 结果要等 2s 对账才补头像（用户实测：发出去第一眼是原生气泡）。
	        // 注意：不要在这里顺手处理 turn-process（AI 状态行）——
	        // 那类节点会被分组逻辑反复 remove/注入，和本回调形成死循环，主线程会被打死。
	        var ensureRowAvatar = function (node) {
	          try {
	            if (node === null || node === void 0 || node.nodeType !== 1) return;
	            var row = null;
	            var kind = typeof node.getAttribute === "function" ? node.getAttribute("data-chat-flow-kind") : null;
	            if (kind === "user") row = node;
	            // 发送瞬间 DSH 先往 flow 槽里插一个「裸 userRow」（还没有 flowItem 包裹），
	            // 这一帧就是用户看到的原生气泡。这里直接按类名认行并补头像/昵称。
	            else if (typeof node.matches === "function" && node.matches('[class*="userRow"]')) row = node;
	            else if (typeof node.closest === "function") {
	              row = node.closest('[data-chat-flow-kind="user"]');
	              if (row === null || row === void 0) row = node.closest('[class*="userRow"]');
	            }
	            if (row === null || row === void 0) return;
	            if (row.getAttribute(HOST_ATTR) !== null) return;
	            // 外层块里已经有带宿主的内部 userRow（裸行先挂、随后被 flowItem 包起来）：
	            // 只让位，不再给外层重复挂——否则一条消息两个头像/两倍缩进。
	            var innerPrev = null;
	            try { innerPrev = typeof row.querySelector === "function" ? row.querySelector('[class*="userRow"]') : null; } catch (ePrev) { innerPrev = null; }
	            if (innerPrev !== null && innerPrev !== row && innerPrev.getAttribute(HOST_ATTR) !== null) {
	              shiftForAvatar(innerPrev, true);
	              return;
	            }
	            injectAvatar(row, true);
	          } catch (e) { /* 补头像失败不影响其余 */ }
	        };
	        // 新增子树里夹带的裸 userRow（整块挂载时 added 可能是外层包裹层，
	        // closest 只往上找，抓不到里面的行）——这类节点同步补头像。
	        // 只在子树里没有 flowItem 时处理：带 flowItem 的是历史/会话整段挂载，
	        // 走容器扫描按可见性挑，避免把屏外轮次也挂上。
	        var ensureRowsIn = function (root) {
	          try {
	            if (root === null || root === void 0 || root.nodeType !== 1) return;
	            if (typeof root.querySelector !== "function") return;
	            // 外层已经是宿主（flowItem 先挂上了）：里面再挂就是双倍缩进/双头像
	            if (typeof root.closest === "function" && root.closest("[" + HOST_ATTR + "]") !== null) return;
	            if (root.querySelector('[class*="flowItem"]') !== null) return;
	            var rows = root.querySelectorAll('[class*="userRow"], [data-chat-flow-kind="user"]');
	            for (var ri = 0; ri < rows.length && ri < 4; ri++) {
	              if (rows[ri].getAttribute(HOST_ATTR) !== null) continue;
	              if (typeof rows[ri].closest === "function" && rows[ri].closest("[" + HOST_ATTR + "]") !== null) continue;
	              injectAvatar(rows[ri], true);
	            }
	          } catch (eRows) { /* 忽略 */ }
	        };
	        var scanDirty = function (records) {
	          var dirty = null;
	          var needScan = false;
	          for (var i = 0; i < records.length; i++) {
	            var rec = records[i];
	            // 只关心"元素级"结构变动：纯文本节点增删（流式 token）对头像没有任何影响，
	            // 直接丢——这一步让流式期间的扫描次数归零。
	            if (rec.type !== "childList") continue;
	            var added = rec.addedNodes;
	            var removed = rec.removedNodes;
	            var structural = false;
	            for (var s1 = 0; added !== null && s1 < added.length; s1++) {
	              if (added[s1].nodeType === 1) { structural = true; break; }
	            }
	            if (!structural) {
	              for (var s2 = 0; removed !== null && s2 < removed.length; s2++) {
	                if (removed[s2].nodeType === 1) { structural = true; break; }
	              }
	            }
	            if (!structural) continue;
            lastStructMutationAt = Date.now();
	            // 新发出的用户消息：直接补头像，不依赖容器分类/缓存。
	            // 裸 userRow / flowItem 两步插入都走这里；React 之后重渲染抹掉的，
	            // 下一批 mutation 会再补一次。
	            if (cfg !== null && cfg !== void 0) {
	              ensureRowAvatar(rec.target);
	              for (var fa = 0; added !== null && fa < added.length; fa++) ensureRowAvatar(added[fa]);
	              for (var fb = 0; added !== null && fb < added.length; fb++) ensureRowsIn(added[fb]);
	            }
	            var cont = containerFor(rec.target);
	            if (cont === null) {
	              for (var a = 0; added !== null && a < added.length; a++) {
	                if (added[a].nodeType !== 1) continue;
	                cont = containerFor(added[a]);
	                if (cont !== null) break;
	              }
	            }
	            if (cont === null) {
	              // 整块挂载：新增根在 flow 容器之上。看新增子树里有没有 flowItem，
	              // 有就排队一次全量扫描（换页签 / 换会话 / 换工作区都会走这里）。
	              if (needScan === false) {
	                for (var a3 = 0; added !== null && a3 < added.length; a3++) {
	                  var an = added[a3];
	                  if (an.nodeType !== 1 || typeof an.querySelector !== "function") continue;
	                  if (an.querySelector('[class*="flowItem"]') !== null) { needScan = true; break; }
	                }
	              }
	              continue;
	            }
	            if (dirty === null) dirty = [];
	            if (dirty.indexOf(cont) === -1) dirty.push(cont);
	          }
	          if (needScan === true) queueScan();
	          if (dirty !== null) {
	            for (var d = 0; d < dirty.length; d++) {
	              rememberContainer(dirty[d]);
	              try { scanContainerCached(dirty[d]); } catch (e) { /* 单容器失败不影响其余 */ }
	            }
	          }
	          // 设置页图标：只在弹窗存在时才可能命中（内部有幂等短路）
	          if (document.querySelector('[role="dialog"]') !== null) patchNavIcon();
	          if (cfg !== null && cfg !== void 0 && cfg.wideChat === true) {
	            ensureWideObserver();
	            applyWideChatLock();
	          }
	        };
	        // 低频对账：纯缓存校验（不读布局），兜住任何漏网的边界情况；
	        // 顺带重挂工具栏按钮——模型胶囊重建不一定进 MutationObserver 的扫描分支
	        setInterval(function () {
	          if (typeof document !== "undefined" && document.hidden === true) return;
	          for (var i = 0; i < knownContainers.length; i++) {
	            var el = knownContainers[i];
	            if (el.isConnected !== true) continue;
	            try { scanContainerCached(el, true); } catch (e) { /* 跳过 */ }
	          }
	          try { syncExplorerButton(); } catch (e2) { /* 跳过 */ }
	          try { syncPolishButton(); } catch (e3) { /* 跳过 */ }
	        }, 2000);
	          var scan = function () {
	          try {
	            // 消息流容器：flowItem 的直接父（运行中状态行也可能单独占一个容器）
	            var flows = document.querySelectorAll('[class*="flowItem"], [' + RUN_MARK + '], [class*="running"]');
	            var seen = {};
	            for (var i = 0; i < flows.length; i++) {
	              var parent = flows[i].parentElement;
		              if (!parent || seen[parent]) continue;
		              seen[parent] = true;
		              // 单个容器出错不影响其余容器（否则一个异常会让后面的块全部失去对齐）
		              try { scanContainerCached(parent); rememberContainer(parent); } catch (e) { /* 该容器跳过 */ }
		            }
		          } catch (e) { /* 注入失败不拖垮页面 */ }
	          patchNavIcon();
	          syncExplorerButton();
	          syncPolishButton();
	          if (cfg !== null && cfg !== void 0 && cfg.wideChat === true) applyWideChatLock();
	          ensureWideObserver();
	        };
	        scan();
	        new MutationObserver(scanDirty).observe(document.body, { childList: true, subtree: true });
	        // ── 可见性驱动补挂（滚动 / IO 命中）────────────────────
	        // 作废容器缓存 + 同步重扫，让新进屏的轮次当帧补挂。
	        onVisibilityChange = function () {
	          try {
	            for (var ci = 0; ci < knownContainers.length; ci++) containerState.delete(knownContainers[ci]);
	            queueScan();
	          } catch (eVis) { /* 忽略 */ }
	        };
	        // 滚动同步补挂：scroll 事件在绘制前触发，同一帧里挂好 →
	        // 拖动滚动条跳到最早一轮 / Ctrl+Home / 引用跳转都赶得上。
	        // rAF 合并同帧多次滚动。注意：这里**不做全量 rect 扫描**——120 轮全量读一次
	        // 就吃掉 200ms+（切会话时每帧都扫更狠）。改成在容器子节点上二分定位：
	        // 先二分找到第一个「没完全滚出视口上方」的块（约 7 次读），再顺序补到视口
	        // 下方边界（通常 2~4 块）→ 与历史长度解耦，跳多远都是十几次读。
	        var scrollScheduled = false;
	        // 结构变动静默期：切会话/整段重建时，每帧都有新块落 DOM，
	        // 这时候跑二分补挂会在「刚写完样式」的脏布局上反复强制重排（实测吃 200ms+）。
	        // 挂载期交给播种（同帧完成），等 250ms 没有结构变动再恢复滚动补挂。
	        var lastStructMutationAt = 0;
	        var syncVisibleFromScroll = function () {
	          // 挂载风暴期间不补挂：新块由播种同帧处理，避免在脏布局上反复量 rect
	          if (Date.now() - lastStructMutationAt < 250) return;
	          var changed = false;
	          for (var ci2 = 0; ci2 < knownContainers.length; ci2++) {
	            var cont2 = knownContainers[ci2];
	            if (cont2 === null || cont2.isConnected !== true) continue;
	            try { if (markVisibleRange(cont2)) changed = true; } catch (eC) { /* 单容器失败不影响其余 */ }
	          }
	          if (changed === true && typeof onVisibilityChange === "function") onVisibilityChange();
	        };
	        document.addEventListener("scroll", function (event) {
	          var t = event.target;
	          // 只认聊天滚动容器：输入框等内部滚动直接丢，避免每帧白跑
	          if (t !== document && t !== document.documentElement && t !== document.body) {
	            if (typeof t.querySelector !== "function" || t.querySelector('[data-slot="conversation.chat.flow"]') === null) return;
	          }
	          if (scrollScheduled === true) return;
	          scrollScheduled = true;
	          requestAnimationFrame(function () {
	            scrollScheduled = false;
	            try { syncVisibleFromScroll(); } catch (eScroll) { /* 忽略 */ }
	          });
	        }, { passive: true, capture: true });
	        // 启动竞态兜底：会话树可能在观察者挂上之前就已经挂载（插件加载慢于界面首帧），
	        // 首扫会扫到空容器、之后又没有 mutation 触发 → 整屏没有头像。
	        // 这里补两次延迟扫描：一次覆盖首屏渲染，一次覆盖懒加载历史。
	        setTimeout(function () { try { scan(); } catch (eDelay) { /* 忽略 */ } }, 600);
	        setTimeout(function () { try { scan(); } catch (eDelay2) { /* 忽略 */ } }, 2000);
	      });
	    }

	    // ── 设置区「对话头像」────────────────────────
	    // 走官方 settings.section 槽位：与「通用设置/模型」同级，导航高亮、内容切换、
	    // 滚动容器全部由设置壳管理（旧版自绘图层会残留上一个页面的内容）。
	    var ZH = {
	      nav: "对话头像",
	      title: "对话头像",
	      intro: "头像与昵称显示在对话消息上方（你的消息在右侧，AI 消息在左侧）。头像直接上传，保存后立即生效。",
	      mine: "我的头像",
	      theirs: "AI 头像",
	      pick: "选择照片",
	      size: "头像大小",
	      radius: "圆角度",
	      myName: "我的昵称",
	      aiName: "AI 昵称",
	      save: "保存昵称",
	      saved: "已保存 ✓",
	      loadFailed: "读取配置失败: ",
	      saveFailed: "保存失败: ",
	      uploadFailed: "上传失败: ",
	      uploadRejected: "图片过大或格式不支持（≤5MB，png/jpg/gif/webp/svg）",
	      enterNewline: "Enter 回车换行（发送：Ctrl+Enter 或点发送按钮）",
	      wideChat: "对话宽度跟随窗口（锁定为最大）",
	      explorerButton: "主界面添加资源管理器",
	      polishButton: "主界面添加提示词优化（输入框左侧 ✨）",
	      personaInject: "全局指令注入系统提示词",
	      personaInjectOn: "已开启，新建会话立即生效",
	      personaInjectOff: "已关闭",
	      personaInjectRisk: "⚠️ 但文件里有未知插值变量（{samples}），可能导致 DSH 启动失败，请检查"
	    };
	    var EN = {
	      nav: "Avatars",
	      title: "Avatars",
	      intro: "Avatars and nicknames appear above each message (yours on the right, the assistant's on the left). Images upload directly and take effect at once.",
	      mine: "My avatar",
	      theirs: "Assistant avatar",
	      pick: "Choose image",
	      size: "Avatar size",
	      radius: "Corner radius",
	      myName: "My nickname",
	      aiName: "Assistant nickname",
	      save: "Save nicknames",
	      saved: "Saved ✓",
	      loadFailed: "Failed to load configuration: ",
	      saveFailed: "Save failed: ",
	      uploadFailed: "Upload failed: ",
	      uploadRejected: "Image too large or unsupported (≤5MB, png/jpg/gif/webp/svg)",
	      enterNewline: "Enter inserts a newline (send with Ctrl+Enter or the send button)",
	      wideChat: "Chat width follows the window (locked to max)",
	      explorerButton: "Explorer button on main UI",
	      polishButton: "Prompt polish button on main UI (✨ beside the model pill)",
	      personaInject: "Inject global directives into the system prompt",
	      personaInjectOn: "Enabled. Applies to new sessions immediately.",
	      personaInjectOff: "Disabled",
	      personaInjectRisk: "⚠️ But the file has unknown template variables ({samples}); DSH may fail to start."
	    };
	    // 设置区样式（只装一次，容器与官方 options 区对齐，不画背景）
	    function installSectionStyles() {
	      if (typeof document === "undefined") return;
	      if (document.querySelector("style[data-plugin-css=" + JSON.stringify("dsh-avatar/section.css") + "]") !== null) return;
	      var tag = document.createElement("style");
	      tag.dataset.plugin = "dsh-avatar";
	      tag.dataset.pluginCss = "dsh-avatar/section.css";
	      tag.textContent = ".dshav_title{margin:0 0 12px;font-size:20px;font-weight:650;letter-spacing:-.2px}" +
	        ".dshav_intro{margin:0 0 20px;max-width:42em;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}" +
	        ".dshav_avatars{display:flex;gap:32px;flex-wrap:wrap;margin-bottom:20px}" +
	        ".dshav_avatarBox{display:flex;flex-direction:column;align-items:center;gap:8px}" +
	        ".dshav_preview{overflow:hidden}" +
	        ".dshav_sliders{display:flex;flex-direction:column;gap:12px;justify-content:center;flex:1;min-width:200px}" +
	        ".dshav_sliderRow{display:flex;align-items:center;gap:10px}" +
	        ".dshav_sliderRow label{font-size:13px;font-weight:600;flex:none;min-width:56px}" +
	        ".dshav_sliderRow input[type=range]{flex:1;max-width:200px;accent-color:var(--dsw-alias-state-info-primary,#3182ce)}" +
	        ".dshav_value{font-size:13px;color:var(--dsw-alias-label-tertiary);min-width:44px}" +
	        ".dshav_field{margin-bottom:14px}" +
	        ".dshav_field label{display:block;margin-bottom:6px;font-size:13px;font-weight:600}" +
	        ".dshav_input{box-sizing:border-box;width:min(100%,360px);height:32px;padding:0 10px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-button-elevated-fill));border:1px solid var(--dsw-alias-border-l2);border-radius:8px;font:inherit;font-size:13px;outline:0}" +
	        ".dshav_toggles{margin-bottom:14px;display:flex;align-items:center;gap:20px;flex-wrap:wrap}" +
	        ".dshav_toggle{display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer}" +
	        ".dshav_toggle input{width:16px;height:16px;flex:none;accent-color:var(--dsw-alias-state-info-primary,#3182ce);cursor:pointer}" +
	        ".dshav_status{margin:10px 0;font-size:12px;color:var(--dsw-alias-label-tertiary);min-height:16px}" +
	        ".dshav_avatarRow{display:flex;gap:32px;margin-bottom:20px;flex-wrap:wrap}";
	      document.head.appendChild(tag);
	    }
	    /**
	    * 设置区「对话头像」：预览 + 选择照片 + 尺寸/圆角滑杆 + 昵称 + 显示开关。
	    * 任意改动都会回写 host 配置（config.json）并立刻刷新消息流头像行。
	    */
	    function AvatarSection(props) {
	      var t = props.t;
	      var [config, setConfig] = react.useState(null);
	      var [draft, setDraft] = react.useState({ userName: "", assistantName: "" });
	      var [notice, setNotice] = react.useState("");
	      var [busy, setBusy] = react.useState(false);
	      var [explorerOn, setExplorerOn] = react.useState(explorerFlag());
	      var [polishOn, setPolishOn] = react.useState(polishFlag());
	      var userFile = react.useRef(null);
	      var assistantFile = react.useRef(null);
	      var adopt = react.useCallback(function (next) {
	        cfg = next;
	        setConfig(next);
	        setDraft({
	          userName: typeof next.userName === "string" ? next.userName : "",
	          assistantName: typeof next.assistantName === "string" ? next.assistantName : ""
	        });
	        applySizeVar();
	        refreshLines();
	        if (cfg !== null && cfg !== void 0 && cfg.wideChat === true) applyWideChatLock();
	        else restoreWideChat();
	      }, []);
	      react.useEffect(function () {
	        installSectionStyles();
	        loadConfig().then(function (base) {
	          return loadPersonaState(base);
	        }).then(adopt, function (reason) {
	          setNotice(t("loadFailed") + String((reason && reason.message) || reason));
	        });
	      }, []);
	      var save = function (part, okText) {
	        setBusy(true);
	        setNotice("");
	        return wireCall("avatar", "setAvatarConfig", { patch: part }).then(function (next) {
	          adopt(next);
	          setNotice(okText || "");
	        }, function (reason) {
	          setNotice(t("saveFailed") + String((reason && reason.message) || reason));
	        }).then(function () {
	          setBusy(false);
	        });
	      };
	      // 全局指令注入：改 profile 的 cordis.patch.yml，需要重启 DSH 才生效
	      var togglePersonaInject = function (enabled) {
	        setBusy(true);
	        setNotice("");
	        return wireCall("avatar", "setPersonaInject", { enabled: enabled }).then(function (state) {
	          // 状态以服务端为准（文件里是否真有标记块）
	          setConfig(function (prev) {
	            if (prev === null || prev === void 0) return prev;
	            var next = Object.assign({}, prev);
	            next.personaInject = state !== void 0 && state !== null && state.enabled === true;
	            return next;
	          });
	          if (cfg !== null && cfg !== void 0) cfg.personaInject = state !== void 0 && state !== null && state.enabled === true;
	          var base = enabled ? t("personaInjectOn") : t("personaInjectOff");
	          // 目标文件含未知 {{...}} 时，系统提示词插值会在启动阶段抛错
	          if (enabled && state !== void 0 && state !== null && state.interpolationRisk === true) {
	            var samples = Array.isArray(state.interpolationSamples) ? state.interpolationSamples.join("、") : "";
	            base += " " + t("personaInjectRisk", { samples: samples });
	          }
	          setNotice(base);
	        }, function (reason) {
	          setNotice(t("saveFailed") + String((reason && reason.message) || reason));
	        }).then(function () {
	          setBusy(false);
	        });
	      };
	      var upload = function (which, file) {
	        if (!file) return;
	        var reader = new FileReader();
	        reader.onload = function () {
	          setBusy(true);
	          setNotice("");
	          wireCall("avatar", "uploadAvatar", { which: which, dataUrl: reader.result }).then(function (ok) {
	            if (ok !== true) {
	              setNotice(t("uploadRejected"));
	              return null;
	            }
	            return loadConfig().then(adopt);
	          }, function (reason) {
	            setNotice(t("uploadFailed") + String((reason && reason.message) || reason));
	          }).then(function () {
	            setBusy(false);
	          });
	        };
	        reader.readAsDataURL(file);
	      };
	      if (config === null) return (0, jsxRuntime.jsx)("div", { className: "dshav_status", children: t("nav") + "…" });
	      var size = typeof config.avatarSize === "number" ? config.avatarSize : 40;
	      var radius = typeof config.avatarRadius === "number" ? config.avatarRadius : 100;
	      var stage = function (part) {
	        // 拖动：只改内存配置 + 原地更新已注入节点的内联样式。
	        // 不调 refreshLines()（全量重建 ~100-200ms/步），也不改 CSS 变量（全文档样式重算 ~31ms/步）。
	        // 各条路径的实测成本对比见 refreshLiveStyles 注释；落盘仍等 mouseup 的 save()。
	        cfg = Object.assign({}, cfg, part);
	        setConfig(cfg);
	        refreshLiveStyles();
	      };
	      // 预览与消息流共用同一套画法：该页面环境下 border-radius 会被渲染成
	      // 「大圆角方形」（实测半径波动 5.8px），必须用 clip-path: inset(0 round R px)，
	      // R = size/2 × 圆角度/100（100 时 R=size/2 即正圆）——与 avatarEl 保持一致。
	      var previewBoxStyle = function (which) {
	        var roundR = Math.round(size / 2 * radius / 100 * 10) / 10;
	        return {
	          width: size + "px",
	          height: size + "px",
	          clipPath: "inset(0 round " + roundR + "px)",
	          flex: "none",
	          display: "inline-flex",
	          alignItems: "center",
	          justifyContent: "center",
	          background: which === "user" ? "var(--dsw-alias-state-success-primary, #2f855a)" : "var(--dsw-alias-state-info-primary, #3182ce)",
	          color: "#fff",
	          fontSize: Math.round(size * 0.45) + "px",
	          fontWeight: 600
	        };
	      };
	      var preview = function (which) {
	        var url = which === "user" ? config.userAvatar : config.assistantAvatar;
	        var fallback = which === "user" ? (draft.userName || "我") : (draft.assistantName || "AI");
	        var inner = typeof url === "string" && url.length > 0
	          ? (0, jsxRuntime.jsx)("img", { alt: "", src: url, draggable: false, style: { width: "100%", height: "100%", objectFit: "cover", display: "block" } })
	          : (Array.from(fallback)[0] || "");
	        return (0, jsxRuntime.jsx)("span", { className: "dshav_preview", style: previewBoxStyle(which), children: inner });
	      };
	      var pickButton = function (which, ref) {
	        return (0, jsxRuntime.jsxs)(react.Fragment, { children: [
	          (0, jsxRuntime.jsx)("button", {
	            type: "button",
	            className: "dshav_pick",
	            disabled: busy,
	            style: { cursor: "pointer", minHeight: "28px", padding: "0 12px", color: "var(--dsw-alias-label-primary)", background: "var(--dsw-alias-button-elevated-fill)", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: "8px", font: "inherit", fontSize: "12px" },
	            onClick: function () {
	              if (ref.current) ref.current.click();
	            },
	            children: t("pick")
	          }),
	          (0, jsxRuntime.jsx)("input", {
	            ref: ref,
	            type: "file",
	            accept: "image/*",
	            style: { display: "none" },
	            onChange: function (ev) {
	              upload(which, ev.target.files && ev.target.files[0]);
	              ev.target.value = "";
	            }
	          })
	        ] });
	      };
	      var slider = function (labelText, valueText, value, min, max, step, onInput, onCommit) {
	        return (0, jsxRuntime.jsxs)("div", { className: "dshav_sliderRow", children: [
	          (0, jsxRuntime.jsx)("label", { children: labelText }),
	          (0, jsxRuntime.jsx)("input", {
	            type: "range",
	            min: String(min),
	            max: String(max),
	            step: String(step),
	            value: String(value),
	            disabled: busy,
	            onChange: function (ev) { onInput(Number(ev.target.value)); },
	            onMouseUp: onCommit,
	            onKeyUp: onCommit,
	            onBlur: onCommit
	          }),
	          (0, jsxRuntime.jsx)("span", { className: "dshav_value", children: valueText })
	        ] });
	      };
	      return (0, jsxRuntime.jsxs)(react.Fragment, { children: [
	        (0, jsxRuntime.jsx)("h2", { className: "dshav_title", children: t("title") }),
	        (0, jsxRuntime.jsx)("p", { className: "dshav_intro", children: t("intro") }),
	        (0, jsxRuntime.jsxs)("div", { className: "dshav_avatarRow", children: [
	          (0, jsxRuntime.jsxs)("div", { className: "dshav_avatars", children: [
	            (0, jsxRuntime.jsxs)("div", { className: "dshav_avatarBox", children: [preview("user"), (0, jsxRuntime.jsx)("span", { className: "dshav_label", style: { fontSize: "13px", fontWeight: 600 }, children: t("mine") }), pickButton("user", userFile)] }),
	            (0, jsxRuntime.jsxs)("div", { className: "dshav_avatarBox", children: [preview("assistant"), (0, jsxRuntime.jsx)("span", { className: "dshav_label", style: { fontSize: "13px", fontWeight: 600 }, children: t("theirs") }), pickButton("assistant", assistantFile)] })
	          ] }),
	          (0, jsxRuntime.jsxs)("div", { className: "dshav_sliders", children: [
	            slider(t("size"), size + "px", size, 24, 96, 2, function (next) {
	              stage({ avatarSize: next });
	            }, function () {
	              save({ avatarSize: size }, "");
	            }),
	            slider(t("radius"), String(radius), radius, 0, 100, 1, function (next) {
	              stage({ avatarRadius: next });
	            }, function () {
	              save({ avatarRadius: radius }, "");
	            })
	          ] })
	        ] }),
	        (0, jsxRuntime.jsxs)("div", { className: "dshav_field", children: [
	          (0, jsxRuntime.jsx)("label", { children: t("myName") }),
	          (0, jsxRuntime.jsx)("input", {
	            className: "dshav_input",
	            type: "text",
	            value: draft.userName,
	            disabled: busy,
	            onChange: function (ev) { setDraft(Object.assign({}, draft, { userName: ev.target.value })); }
	          })
	        ] }),
	        (0, jsxRuntime.jsxs)("div", { className: "dshav_field", children: [
	          (0, jsxRuntime.jsx)("label", { children: t("aiName") }),
	          (0, jsxRuntime.jsx)("input", {
	            className: "dshav_input",
	            type: "text",
	            value: draft.assistantName,
	            disabled: busy,
	            onChange: function (ev) { setDraft(Object.assign({}, draft, { assistantName: ev.target.value })); }
	          })
	        ] }),
		        (0, jsxRuntime.jsx)("div", { className: "dshav_status", children: notice }),
	        (0, jsxRuntime.jsx)("button", {
	          type: "button",
	          className: "dshav_save",
	          disabled: busy,
	          style: { cursor: "pointer", minHeight: "32px", padding: "0 14px", color: "var(--dsw-alias-label-primary)", background: "var(--dsw-alias-bg-layer-3,var(--dsw-alias-button-elevated-fill))", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: "8px", font: "inherit", fontSize: "13px" },
	          onClick: function () {
	            save({ userName: draft.userName.trim(), assistantName: draft.assistantName.trim() }, t("saved"));
	          },
	          children: t("save")
	        }),
	        (0, jsxRuntime.jsxs)("label", { className: "dshav_toggle", style: { margin: "16px 0 6px" }, children: [
	          (0, jsxRuntime.jsx)("input", {
	            type: "checkbox",
	            checked: config.enterNewline === true,
	            disabled: busy,
	            onChange: function (ev) { save({ enterNewline: ev.target.checked === true }, t("saved")); }
	          }),
	          (0, jsxRuntime.jsx)("span", { children: t("enterNewline") })
	        ] }),
	        (0, jsxRuntime.jsxs)("label", { className: "dshav_toggle", style: { margin: "10px 0 6px" }, children: [
	          (0, jsxRuntime.jsx)("input", {
	            type: "checkbox",
	            checked: config.wideChat === true,
	            disabled: busy,
	            onChange: function (ev) { save({ wideChat: ev.target.checked === true }, t("saved")); }
	          }),
	          (0, jsxRuntime.jsx)("span", { children: t("wideChat") })
	        ] }),
	        // 主界面「资源管理器」按钮：勾选后标题栏「更多操作 ...」左边出现 📂
	        (0, jsxRuntime.jsxs)("label", { className: "dshav_toggle", style: { margin: "10px 0 6px" }, children: [
	          (0, jsxRuntime.jsx)("input", {
	            type: "checkbox",
	            checked: explorerOn === true,
	            onChange: function (ev) {
	              var on = ev.target.checked === true;
	              setExplorerOn(on);
	              setExplorerFlag(on);
	            }
	          }),
	          (0, jsxRuntime.jsx)("span", { children: t("explorerButton") })
	        ] }),
	        // 输入框「提示词优化」按钮：勾选后模型胶囊左边出现 ✨
	        (0, jsxRuntime.jsxs)("label", { className: "dshav_toggle", style: { margin: "10px 0 6px" }, children: [
	          (0, jsxRuntime.jsx)("input", {
	            type: "checkbox",
	            checked: polishOn === true,
	            onChange: function (ev) {
	              var on = ev.target.checked === true;
	              setPolishOn(on);
	              setPolishFlag(on);
	            }
	          }),
	          (0, jsxRuntime.jsx)("span", { children: t("polishButton") })
	        ] }),
	        // 全局指令注入：把 ~/.dsh/AGENTS.md 挂进每个 agent 的系统提示词 section，
	        // 每轮请求都带、压缩吃不掉。开关只写插件自己的 config.json，新建会话生效。
	        (0, jsxRuntime.jsxs)("label", { className: "dshav_toggle", style: { margin: "10px 0 6px" }, children: [
	          (0, jsxRuntime.jsx)("input", {
	            type: "checkbox",
	            checked: config.personaInject === true,
	            disabled: busy,
	            onChange: function (ev) { togglePersonaInject(ev.target.checked === true); }
	          }),
	          (0, jsxRuntime.jsx)("span", { children: t("personaInject") })
	        ] })
	      ] });
	    }
	    // 昵称/头像变化后刷新所有已注入行（头像+昵称+让位样式一起清）
	    function refreshLines() {
	      // 方案 B：先摘掉属性标记（伪元素随之消失），再整体重扫重建
	      var marked = document.querySelectorAll("[" + HOST_ATTR + "], [" + AI_SHIFT + "], [" + USER_SHIFT + "]");
	      for (var mi = 0; mi < marked.length; mi++) {
	        marked[mi].removeAttribute(HOST_ATTR);
	        marked[mi].removeAttribute(NAME_ATTR);
	        marked[mi].removeAttribute(RUN_ATTR);
	        marked[mi].removeAttribute(AI_SHIFT);
	        marked[mi].removeAttribute(USER_SHIFT);
	      }
	      var nodes = document.querySelectorAll("[" + AV_MARK + "], [" + NAME_MARK + "]");
	      for (var i = 0; i < nodes.length; i++) nodes[i].remove();
	      var boxes = document.querySelectorAll("[" + BOX_MARK + "]");
	      for (var bx = 0; bx < boxes.length; bx++) {
	        boxes[bx].style.position = "";
	        boxes[bx].style.paddingLeft = "";
	        boxes[bx].style.paddingRight = "";
	        // 标记保留：重扫时靠它判断「盒内不再重复缩进」，清掉会导致盒内块被双倍内边距
	      }
	      var flows = document.querySelectorAll('[class*="flowItem"]');
	      var runs = document.querySelectorAll('[class*="running"]');
	      for (var rj = 0; rj < runs.length; rj++) {
	        runs[rj].style.paddingLeft = "";
	        runs[rj].style.paddingRight = "";
	        runs[rj].style.minHeight = "";
	        runs[rj].style.display = "";
	        runs[rj].style.flexDirection = "";
	        var rcj = runs[rj].querySelector('[class*="runningContent"]');
	        if (rcj !== null) rcj.style.marginTop = "";
	      }
	      for (var j = 0; j < flows.length; j++) {
	        flows[j].style.position = "";
	        flows[j].style.paddingLeft = "";
	        flows[j].style.paddingRight = "";
	        flows[j].style.display = "";
	        var bubbles = flows[j].querySelectorAll("[" + BUBBLE_CSS_MARK + "]");
	        for (var b = 0; b < bubbles.length; b++) {
	          bubbles[b].removeAttribute(BUBBLE_CSS_MARK);
	          bubbles[b].style.background = "";
	          bubbles[b].style.border = "";
	          bubbles[b].style.borderRadius = "";
	          bubbles[b].style.padding = "";
	        }
	      }
      // 头像/昵称全部重建 → 容器缓存作废，下一次扫描重新建立
      containerState = new WeakMap();
      var seen = {};
      for (var k = 0; k < flows.length; k++) {
        var parent = flows[k].parentElement;
        if (!parent || seen[parent]) continue;
        seen[parent] = true;
        scanContainer(parent);
      }
	    }

	    function apply(ctx) {
	      pluginCtx = ctx;
	      explorerEnabled = explorerFlag();
	      polishEnabled = polishFlag();
	      start();
	      // 官方设置区槽位：与「通用设置/模型」同级，导航高亮与内容切换由设置壳管理。
	      ctx.effect(function () {
	        return ctx.locale.register(NS, { zh: ZH, en: EN });
	      }, "dsh-avatar: dictionaries");
	      // 停用/卸载时撤掉本插件插入的节点与属性（含 📂 按钮与样式）
	      ctx.effect(function () { return disposeAvatarDom; }, "dsh-avatar: dom cleanup");
	      ctx.slots.inject("settings.section", function () {
	        return ctx.slots.register({
	          name: "settings.section",
	          id: "avatar",
	          order: 120,
	          label: function () { return ctx.locale.bind(NS)("nav"); },
	          locale: NS,
	          inject: function () { return { t: ctx.locale.bind(NS) }; }
	        }, AvatarSection);
	      });
	    }

	    exports.apply = apply
	    // 严格注入：设置区需要 slots（注册槽位）与 locale（词条）；
	    // 资源管理器按钮需要会话/工作区/远程服务
	    exports.inject = ["slots", "locale", "sessions", "workspaces", "remote", "remote.session"]
	    return module.exports

	    return module.exports;
	}
});
