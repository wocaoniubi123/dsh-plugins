// dsh-avatar · host 侧：对话头像/昵称配置服务（独立插件版，原 dsh-ziyong 子模块）。
//
// 资源约定（用户可自定义）：
//   dsh-avatar/assets/user.png       我的头像（缺省用首字圆形占位）
//   dsh-avatar/assets/assistant.png  AI 头像
//   dsh-avatar/config.json           { userName, assistantName, avatarSize, avatarRadius, 显示开关 }
// client 通过 wire 取配置与头像 data URL；头像走直接上传（uploadAvatar）。
import { Service } from "@deepseek-ai/cordis";
import { bindTypertRemote } from "@deepseek-ai/dsh-typert-protocol";
import { addStrictCodecFactories } from "./typert-compat.js";
import { mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

var MODULE_DIR = dirname(fileURLToPath(import.meta.url));
var ASSETS_DIR = join(MODULE_DIR, "assets");
var CONFIG_FILE = join(MODULE_DIR, "config.json");
var AVATAR_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "svg"];

// 按 which 找 assets 里的头像文件（任意受支持扩展名），找不到返回 null。
function findAvatarFile(which) {
	try {
		var files = readdirSync(ASSETS_DIR);
		for (var i = 0; i < files.length; i++) {
			var dot = files[i].lastIndexOf(".");
			if (dot <= 0) continue;
			var base = files[i].slice(0, dot).toLowerCase();
			var ext = files[i].slice(dot + 1).toLowerCase();
			if (base === which && AVATAR_EXTS.indexOf(ext) !== -1) return files[i];
		}
	} catch (e) { /* 目录不存在 */ }
	return null;
}

function defaultConfig() {
	return { userName: "我", assistantName: "DeepSeek", avatarSize: 40, avatarRadius: 100, showSystemPrompt: false, showContextInjection: false, showHeaderOpenWorkspace: true, enterNewline: false, wideChat: false, personaInject: false };
}
function loadConfig() {
	try {
		var raw = JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
		var base = defaultConfig();
		if (raw && typeof raw === "object") {
			// 昵称允许留空（"" 保留，不渲染昵称只显示头像）
			if (typeof raw.userName === "string") base.userName = raw.userName;
			if (typeof raw.assistantName === "string") base.assistantName = raw.assistantName;
			if (typeof raw.avatarSize === "number" && raw.avatarSize >= 24 && raw.avatarSize <= 96) base.avatarSize = Math.round(raw.avatarSize);
			if (typeof raw.avatarRadius === "number" && raw.avatarRadius >= 0 && raw.avatarRadius <= 100) base.avatarRadius = Math.round(raw.avatarRadius);
			if (typeof raw.showSystemPrompt === "boolean") base.showSystemPrompt = raw.showSystemPrompt;
			if (typeof raw.showContextInjection === "boolean") base.showContextInjection = raw.showContextInjection;
			if (typeof raw.showHeaderOpenWorkspace === "boolean") base.showHeaderOpenWorkspace = raw.showHeaderOpenWorkspace;
			if (typeof raw.enterNewline === "boolean") base.enterNewline = raw.enterNewline;
			if (typeof raw.wideChat === "boolean") base.wideChat = raw.wideChat;
			if (typeof raw.personaInject === "boolean") base.personaInject = raw.personaInject;
		}
		return base;
	} catch (e) {
		return defaultConfig();
	}
}
function saveConfig(cfg) {
	try {
		mkdirSync(dirname(CONFIG_FILE), { recursive: true });
		writeFileSync(CONFIG_FILE, JSON.stringify(cfg));
	} catch (e) { /* 写失败保留内存态 */ }
}

// ── 全局指令注入系统提示词 ──
// 系统提示词每轮请求都完整发送，所以压缩（compaction）吃不掉它。
// 实现：监听 agent/created，给每个 agent 注册一个独立 section。
//   · 名字用 dsh-avatar: 前缀，避开官方 deployment:persona-prefix ——
//     实测 profile patch 里改 personaPrefix 不会进提示词（被 agent 作用域遮蔽），
//     而 agent 自己的 section 一定生效。
//   · text 用函数：每次组装重新读文件 → 改完 md 立即生效，不用重启 DSH。
//   · interpolate: false：文件里的 {{...}} 按字面保留，不会因未知变量抛错让 DSH 起不来。
var INJECT_TARGET = "C:/Users/Administrator/.dsh/AGENTS.md";
var INJECT_SECTION = "dsh-avatar:global-directives";

/** 读全局指令文件；读不到返回空串（空 section 会被 renderPrompt 丢弃）。 */
function readDirectives() {
	try {
		var text = readFileSync(INJECT_TARGET, "utf8").trim();
		return text.length > 0 ? text : "";
	} catch (e) {
		return "";
	}
}

// 图片 → data URL；不存在/读失败 → null（client 用首字占位）。
// 按「文件名 + mtime」缓存：设置面板每次打开都会拉一次配置，大图重复读盘 +
// base64（1MB 图 ≈ 1.37MB base64）是面板加载慢的主因；上传覆盖后 mtime 变化自动失效。
var avatarUrlCache = {};
function avatarDataUrl(which) {
	try {
		var file = findAvatarFile(which);
		if (!file) return null;
		var full = join(ASSETS_DIR, file);
		var mtimeMs = 0;
		try { mtimeMs = statSync(full).mtimeMs; } catch (e) { /* 拿不到时间戳就照常重建缓存 */ }
		var hit = avatarUrlCache[which];
		if (hit !== void 0 && hit.file === file && hit.mtimeMs === mtimeMs) return hit.url;
		var buf = readFileSync(full);
		var ext = file.split(".").pop().toLowerCase();
		var mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "svg" ? "image/svg+xml" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : "image/png";
		var url = "data:" + mime + ";base64," + buf.toString("base64");
		avatarUrlCache[which] = { file: file, mtimeMs: mtimeMs, url: url };
		return url;
	} catch (e) {
		return null;
	}
}
// 解析 data URL 的 mime 与 base64 字节；返回 { mime, ext, buf } 或 null。
function parseDataUrl(dataUrl) {
	if (typeof dataUrl !== "string") return null;
	var m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
	if (!m) return null;
	var mime = m[1].toLowerCase();
	var ext = mime === "image/jpeg" ? "jpg" : mime === "image/svg+xml" ? "svg" : mime === "image/gif" ? "gif" : mime === "image/webp" ? "webp" : "png";
	return { mime: mime, ext: ext, buf: Buffer.from(m[2], "base64") };
}

// ── 提示词补全（一次性辅助模型调用）──
// 输入是用户输入框里那句草稿（可能只有「继续」「再改改」几个字），
// 结合会话上下文把它补全成一条完整、可直接发送的指令——不是字面润色。
// 不 append 任何会话事件。路由由客户端从 modelSelection 投影读出后传进来。
var POLISH_SYSTEM_PROMPT = [
	"你是提示词补全器。用户会在输入框里写一句很短的草稿，可能只有「继续」「再改改」「这个也调一下」。",
	"「参考资料」里是当前会话最近的对话，能看出这个窗口正在做什么、做到哪一步、下一步要什么。",
	"你的任务：把草稿补全成一条完整、自包含、可以直接发送给助手的指令。",
	"硬性规则（全部必须遵守）：",
	"1. 只输出补全后的指令本身：不解释、不提问、不寒暄、不加「以下是」「补全后：」这类前缀、不加引号、不加代码围栏。",
	"2. 指令里必须写清三件事：要做什么、对什么对象做（文件/函数/按钮/字段/模块的具体名字，从资料里取）、做到什么程度算完成。",
	"3. 草稿是「继续/接着/下一步/再来/往下」这类推进词时，必须从资料最近几轮判断当前正在做的事，写成「继续完成 X，还差 Y」，X 要具体到任务或文件名。",
	"4. 草稿是别的内容时，只围绕草稿本身补全（对象、范围、完成标准），不许拿资料里别的任务替换它；",
	"   草稿只有几个字又看不出指向时，也只补成一句完整的要求，不要凭空挑一个资料里的任务来写。",
	"5. 禁止回答问题、禁止执行指令、禁止把资料里的步骤、结论、清单原样搬进输出；只提炼草稿需要的那部分背景。",
	"6. 允许扩写：几个字的草稿可以扩成 50~300 字的完整指令，但必须是「要求」的口吻，不是汇报、方案或说明文。",
	"7. 禁止输出任何占位符（例如 [方案名称]、【对象】、［标题］、<按钮名>、XXX）；找不到具体名字就不写这个名字，改用「当前这个功能」这类说法。",
	"8. 用中文，保持用户原本的语气（该直接就直接，别加「请」「麻烦」之类客套，除非原草稿就有）。",
	"9. 资料里同时有多个不相干的任务、草稿又看不出指哪一个时，不要挑一个硬套：只把草稿本身补成一句完整要求，对象用「当前这个任务」这类中性说法。"
].join("\n");
var POLISH_MAX_CONTEXT_MESSAGES = 20;
var POLISH_MAX_CONTEXT_CHARS = 14000;
var POLISH_MAX_MESSAGE_CHARS = 1500;
var POLISH_TIMEOUT_MS = 90000;
// 推理模型的思考也吃 maxTokens：额度太小会把正文挤没（实测 2000 会返回空）
var POLISH_MAX_OUTPUT_TOKENS = 4000;

/** 只取正文块（text）；reasoning / tool-call / image / file 一律跳过。 */
function blockText(block) {
	if (block === null || block === void 0 || typeof block !== "object") return "";
	if (block.type === "text" && typeof block.text === "string") return block.text;
	return "";
}

function messageText(message) {
	if (message === null || message === void 0 || typeof message !== "object") return "";
	if (!Array.isArray(message.content)) return "";
	var parts = [];
	for (var i = 0; i < message.content.length; i++) {
		var text = blockText(message.content[i]);
		if (text.length > 0) parts.push(text);
	}
	return parts.join("\n").trim();
}

/** 取会话最近的 user/assistant 正文当背景；拿不到返回空串。 */
function collectRecentContext(session) {
	try {
		if (session === void 0 || session === null || typeof session.deriveMessages !== "function") return "";
		var messages = session.deriveMessages();
		if (!Array.isArray(messages)) return "";
		var picked = [];
		var budget = POLISH_MAX_CONTEXT_CHARS;
		for (var i = messages.length - 1; i >= 0 && picked.length < POLISH_MAX_CONTEXT_MESSAGES; i--) {
			var message = messages[i];
			if (message === null || message === void 0) continue;
			if (message.role !== "user" && message.role !== "assistant") continue;
			var text = messageText(message);
			if (text.length === 0) continue;
			if (text.length > POLISH_MAX_MESSAGE_CHARS) text = text.slice(0, POLISH_MAX_MESSAGE_CHARS) + "…";
			if (text.length > budget) break;
			budget -= text.length;
			picked.unshift((message.role === "user" ? "用户：" : "助手：") + text);
		}
		return picked.join("\n\n");
	} catch (e) {
		return "";
	}
}

/** 去掉模型带上的标题行、代码围栏、「指令：」前缀，以及开头的「继续。」复读。 */
function cleanPolishedText(text) {
	var out = String(text).trim();
	// 开头的 markdown 标题（## 可直接发送的指令 / ### 补全结果）
	out = out.replace(/^(#{1,6}[^\n]*\n+)+/, "").trim();
	// 外层代码围栏（可能包住整段）
	var fence = /^```[a-zA-Z0-9_-]*\r?\n([\s\S]*?)\r?\n```\s*$/.exec(out);
	if (fence !== null) out = fence[1].trim();
	out = out.replace(/^(以下是|下面是)?\s*\*{0,2}(润色后|优化后|改写后|补全后|指令|补全结果|优化结果|polished|revised)\*{0,2}\s*[:：]\s*/i, "");
	out = out.replace(/^["“]([\s\S]*)["”]$/, "$1").trim();
	out = out.replace(/^继续\s*[：:。.！!]\s*/, "").trim();
	// 模型爱加「补全结果（可直接发送）：」标题、「> 」引用和「补全逻辑：」尾巴
	// 模型爱加的标题行：「**可直接发送的指令：**」「补全结果（可直接发送）：」之类
	out = out.replace(/^\*{0,2}[^\n]{0,24}?(指令|结果|补全)[^\n]{0,12}?\s*[:：]\s*\*{0,2}\s*/i, "").trim();
	out = out.replace(/^>\s?/gm, "").trim();
	var logic = out.search(/\n\s*\*{0,2}(补全逻辑|补全说明|改动说明)\*{0,2}\s*[:：]/);
	if (logic > 0) out = out.slice(0, logic).trim();
	// 模型常加一句元话术（「把『继续』补成下面这条，直接发：」/「请把下面这条当作我下一步的完整指令：」）
	out = out.replace(/^把[「“"'][^」”"']{0,30}[」”"']?\s*补成[^\n]{0,40}[:：]\s*/i, "").trim();
	out = out.replace(/^请?把(下面|以下)?[^\n]{0,40}(当作|当成|作为)[^\n]{0,20}[:：]?\s*/i, "").trim();
	var sep = out.indexOf("---");
	if (sep !== -1 && sep < 120) out = out.slice(sep + 3).trim();
	return out;
}

/** 非空行数。 */
function countLines(text) {
	var lines = String(text).split("\n");
	var n = 0;
	for (var i = 0; i < lines.length; i++) {
		if (lines[i].trim().length > 0) n++;
	}
	return n;
}

/**
 * 解析「指代：… / 改写：…」两行格式：只保留「改写：」之后的内容。
 * 模型没按格式输出时原样返回（去掉可能存在的「指代：」行）。
 */
function parsePolishOutput(text) {
	var raw = String(text).trim();
	var lines = raw.split(/\r?\n/);
	var start = -1;
	for (var i = 0; i < lines.length; i++) {
		if (/^\s*(改写|润色结果|优化结果)\s*[:：]/.test(lines[i])) { start = i; break; }
	}
	if (start !== -1) {
		var head = lines[start].replace(/^\s*(改写|润色结果|优化结果)\s*[:：]\s*/, "");
		var rest = lines.slice(start + 1);
		return [head].concat(rest).join("\n").trim();
	}
	var kept = [];
	for (var j = 0; j < lines.length; j++) {
		if (/^\s*(指代|指代对象|映射)\s*[:：]/.test(lines[j])) continue;
		kept.push(lines[j]);
	}
	return kept.join("\n").trim();
}

/** 输出里是否带模型编的占位符：全角方括号，或半角方括号（markdown 链接除外）。 */
function hasPlaceholder(text) {
	if (/［[^］\n]{1,30}］/.test(text)) return true;
	var re = /\[[^\]\n]{1,40}\]/g;
	var m = re.exec(text);
	while (m !== null) {
		// [文本](url) 是 markdown 链接，不算占位符
		var after = text.slice(m.index + m[0].length, m.index + m[0].length + 1);
		if (after !== "(") return true;
		m = re.exec(text);
	}
	return false;
}

/**
 * 输出里是否有连续的 80 字片段出现在背景中。
 * 命中说明模型在复述资料（抄袭），而不是补全草稿。
 */
function copiesContext(output, context) {
	var span = 80;
	if (output.length < span || context.length < span) return false;
	for (var i = 0; i + span <= output.length; i += 5) {
		if (context.indexOf(output.slice(i, i + span)) !== -1) return true;
	}
	return false;
}

var looseSchema = { parse: function (v) { return v; } };
var AVATAR_INVOCATIONS = [
	{
		id: "dsh-ziyong#avatar/getAvatarConfig",
		service: "dsh-avatar-service",
		namespace: "avatar",
		method: "getAvatarConfig",
		invocation: { kind: "direct" },
		parameters: [],
		result: { mode: "strict", typeSymbol: "dsh-ziyong/types#AvatarConfig", schema: looseSchema },
		sourceLocation: { file: "dsh-ziyong/dsh-avatar/index.js", line: 1, column: 1 }
	},
	{
		id: "dsh-ziyong#avatar/setAvatarConfig",
		service: "dsh-avatar-service",
		namespace: "avatar",
		method: "setAvatarConfig",
		invocation: { kind: "direct" },
		parameters: [
			{ name: "patch", wire: "patch", source: "json", codec: { mode: "src-json" } }
		],
		result: { mode: "strict", typeSymbol: "dsh-ziyong/types#AvatarConfig", schema: looseSchema },
		sourceLocation: { file: "dsh-ziyong/dsh-avatar/index.js", line: 1, column: 1 }
	},
	{
		id: "dsh-ziyong#avatar/getPersonaInject",
		service: "dsh-avatar-service",
		namespace: "avatar",
		method: "getPersonaInject",
		invocation: { kind: "direct" },
		parameters: [],
		result: { mode: "strict", typeSymbol: "dsh-ziyong/types#PersonaInjectState", schema: looseSchema },
		sourceLocation: { file: "dsh-ziyong/dsh-avatar/index.js", line: 1, column: 1 }
	},
	{
		id: "dsh-ziyong#avatar/setPersonaInject",
		service: "dsh-avatar-service",
		namespace: "avatar",
		method: "setPersonaInject",
		invocation: { kind: "direct" },
		parameters: [
			{ name: "enabled", wire: "enabled", source: "json", codec: { mode: "src-json" } }
		],
		result: { mode: "strict", typeSymbol: "dsh-ziyong/types#PersonaInjectState", schema: looseSchema },
		sourceLocation: { file: "dsh-ziyong/dsh-avatar/index.js", line: 1, column: 1 }
	},
		{
			id: "dsh-ziyong#avatar/uploadAvatar",
			service: "dsh-avatar-service",
			namespace: "avatar",
			method: "uploadAvatar",
			invocation: { kind: "direct" },
			parameters: [
				{ name: "which", wire: "which", source: "json", codec: { mode: "src-json" } },
				{ name: "dataUrl", wire: "dataUrl", source: "json", codec: { mode: "src-json" } }
			],
			result: { mode: "strict", typeSymbol: "dsh-ziyong/types#boolean", schema: looseSchema },
			sourceLocation: { file: "dsh-ziyong/dsh-avatar/index.js", line: 1, column: 1 }
		},
		{
			// 用当前会话选中的模型把输入框文本改写成提示词（一次性辅助调用，不写会话事件）
			id: "dsh-ziyong#avatar/polishPrompt",
			service: "dsh-avatar-service",
			namespace: "avatar",
			method: "polishPrompt",
			invocation: { kind: "direct" },
			parameters: [
				{ name: "request", wire: "request", source: "json", codec: { mode: "src-json" } }
			],
			result: { mode: "strict", typeSymbol: "dsh-ziyong/types#PromptPolishResult", schema: looseSchema },
			sourceLocation: { file: "dsh-ziyong/dsh-avatar/index.js", line: 1, column: 1 }
		}
	];
var AVATAR_TYPERT = {
	package: "dsh-ziyong/dsh-avatar",
	face: "host",
	schemas: [],
	model: { services: [], events: [], objects: [] },
	invocations: addStrictCodecFactories(AVATAR_INVOCATIONS)
};
function registerAvatarRemote(ctx) {
	var existing = ctx.get("typert");
	if (existing !== void 0) {
		existing.register(AVATAR_TYPERT);
		return;
	}
	ctx.inject(["typert"], function (tctx) {
		tctx.typert.register(AVATAR_TYPERT);
	});
}

var AvatarService = class extends Service {
	static inject = [];
	/** llm / sessions 就绪后的上下文（提示词优化用）；未就绪为 null。 */
	readyCtx = null;
	constructor(ctx) {
		super(ctx, "dsh-avatar-service");
		this.typertRemote = bindTypertRemote(this, "dsh-avatar-service", { namespace: "avatar" });
		registerAvatarRemote(ctx);
	// 提示词优化：等 llm（一次性模型调用）与会话（取背景片段）就绪
	ctx.inject(["llm", "sessions"], (readyCtx) => {
		this.readyCtx = readyCtx;
	});
		// 全局指令注入：每个 agent 建好时挂一段自己的系统提示词 section。
		// 开关状态读 config.json，text 是函数（每次组装重新读文件）。
		ctx.inject(["systemPrompt"], (readyCtx) => {
			try {
				readyCtx.on("agent/created", (payload) => {
					this.attachDirectives(payload !== null && payload !== void 0 ? payload.agent : void 0);
				});
			} catch (error) {
				this.warn("could not hook agent/created: " + String(error && error.message ? error.message : error));
			}
		});
	}

	/** 给一个 agent 挂全局指令 section（开关关闭或文件为空时什么都不做）。 */
	attachDirectives(agent) {
		try {
			if (agent === void 0 || agent === null || agent.ctx === void 0) return;
			var cfg = loadConfig();
			if (cfg.personaInject !== true) return;
			var text = readDirectives();
			if (text.length === 0) return;
			var prompt = agent.ctx.get("systemPrompt");
			if (prompt === void 0 || typeof prompt.section !== "function") return;
			agent.ctx.effect(function () {
				return prompt.section({
					name: INJECT_SECTION,
					// 紧跟开场白、在各类策略之前，权威性最高
					order: -500,
					// 关掉模板插值：文件里的 {{...}} 按字面保留，不会让组装抛错
					interpolate: false,
					// 函数形式：每次组装重新读文件，改完 md 立即生效
					text: function () { return readDirectives(); }
				});
			}, "dsh-avatar: global directives section");
		} catch (error) {
			this.warn("attach directives failed: " + String(error && error.message ? error.message : error));
		}
	}

	warn(message) {
		if (this.ctx.logger !== void 0 && typeof this.ctx.logger.warn === "function") this.ctx.logger.warn("dsh-avatar: " + message);
	}
	info(message) {
		if (this.ctx.logger !== void 0 && typeof this.ctx.logger.info === "function") this.ctx.logger.info("dsh-avatar: " + message);
	}
	/** 配置 + 头像 data URL（缺图 null）。 */
		getAvatarConfig() {
			var cfg = loadConfig();
			return {
				userName: cfg.userName,
				assistantName: cfg.assistantName,
				avatarSize: cfg.avatarSize,
				avatarRadius: cfg.avatarRadius,
				showSystemPrompt: cfg.showSystemPrompt,
				showContextInjection: cfg.showContextInjection,
				showHeaderOpenWorkspace: cfg.showHeaderOpenWorkspace,
				enterNewline: cfg.enterNewline === true,
				wideChat: cfg.wideChat === true,
				personaInject: cfg.personaInject === true,
				userAvatar: avatarDataUrl("user"),
				assistantAvatar: avatarDataUrl("assistant")
			};
		}
		/** 合并昵称/头像大小字段，返回新配置（昵称允许留空）。 */
		setAvatarConfig(patch) {
			var cfg = loadConfig();
			if (patch && typeof patch === "object") {
				if (typeof patch.userName === "string") cfg.userName = patch.userName;
				if (typeof patch.assistantName === "string") cfg.assistantName = patch.assistantName;
				if (typeof patch.avatarSize === "number" && patch.avatarSize >= 24 && patch.avatarSize <= 96) cfg.avatarSize = Math.round(patch.avatarSize);
				if (typeof patch.avatarRadius === "number" && patch.avatarRadius >= 0 && patch.avatarRadius <= 100) cfg.avatarRadius = Math.round(patch.avatarRadius);
				if (typeof patch.showSystemPrompt === "boolean") cfg.showSystemPrompt = patch.showSystemPrompt;
				if (typeof patch.showContextInjection === "boolean") cfg.showContextInjection = patch.showContextInjection;
				if (typeof patch.showHeaderOpenWorkspace === "boolean") cfg.showHeaderOpenWorkspace = patch.showHeaderOpenWorkspace;
				if (typeof patch.enterNewline === "boolean") cfg.enterNewline = patch.enterNewline;
				if (typeof patch.wideChat === "boolean") cfg.wideChat = patch.wideChat;
			}
			saveConfig(cfg);
			return {
				userName: cfg.userName,
				assistantName: cfg.assistantName,
				avatarSize: cfg.avatarSize,
				avatarRadius: cfg.avatarRadius,
				showSystemPrompt: cfg.showSystemPrompt,
				showContextInjection: cfg.showContextInjection,
			showHeaderOpenWorkspace: cfg.showHeaderOpenWorkspace,
			enterNewline: cfg.enterNewline === true,
			wideChat: cfg.wideChat === true,
			personaInject: cfg.personaInject === true,
			userAvatar: avatarDataUrl("user"),
			assistantAvatar: avatarDataUrl("assistant")
		};
		}

	/** 读注入开关状态（只读 config.json + 目标文件是否存在）。 */
	getPersonaInject() {
		var cfg = loadConfig();
		var fileExists = false;
		try { fileExists = statSync(INJECT_TARGET).isFile(); } catch (e) { fileExists = false; }
		return {
			enabled: cfg.personaInject === true,
			path: INJECT_TARGET,
			fileExists: fileExists,
			section: INJECT_SECTION,
			restartRequired: false
		};
	}

	/**
	 * 开/关全局指令注入。
	 * 只改插件自己的 config.json —— 每个 agent 创建时读它决定要不要挂 section，
	 * text 是函数所以改完 md 立即生效，新会话立刻带上（不用重启 DSH）。
	 */
	setPersonaInject(enabled) {
		var want = enabled === true;
		var cfg = loadConfig();
		cfg.personaInject = want;
		saveConfig(cfg);
		var fileExists = false;
		try { fileExists = statSync(INJECT_TARGET).isFile(); } catch (e) { fileExists = false; }
		return {
			enabled: want,
			path: INJECT_TARGET,
			fileExists: fileExists,
			section: INJECT_SECTION,
			// 已存在的 agent 不补挂 section；新会话/新子代理立即生效
			restartRequired: false
		};
	}

	/**
	 * 把输入框里的草稿补全成一条完整指令（结合会话上下文判断当前在做什么）。
	 * 草稿为空时，根据上下文里最近的助手回复生成一条下一步指令。
	 * 一次性辅助调用：不 append 会话事件、不进对话历史。
	 * @param request {{ text: string, provider: string, model: string, reasoningEffort?: string, sessionId?: string }}
	 * @returns {{ text: string, provider: string, model: string }}
	 */
	async polishPrompt(request) {
		var source = request !== null && request !== void 0 ? request.text : void 0;
		if (typeof source !== "string") throw new TypeError("text must be a string");
		var provider = request.provider;
		var model = request.model;
		if (typeof provider !== "string" || provider.length === 0) throw new TypeError("provider must be a non-empty string");
		if (typeof model !== "string" || model.length === 0) throw new TypeError("model must be a non-empty string");
		var draft = source.trim();
		var baseCtx = this.readyCtx !== null && this.readyCtx !== void 0 ? this.readyCtx : this.ctx;
		var llm = null;
		try { llm = baseCtx.get("llm"); } catch (eLlm) { llm = null; }
		if (llm === void 0 || llm === null || typeof llm.prepareCall !== "function") throw new Error("llm service is unavailable");
		// 背景片段：只取正文。放进 system 当「资料」，不放 user——user 里出现对话记录
		// 会让模型进入助手模式（实测会直接接着回答）
		var contextText = "";
		try {
			var sessionId = request.sessionId;
			if (typeof sessionId === "string" && sessionId.length > 0) {
				var sessions = baseCtx.get("sessions");
				if (sessions !== void 0 && sessions !== null && typeof sessions.get === "function") {
					contextText = collectRecentContext(sessions.get(sessionId));
				}
			}
		} catch (eCtx) { contextText = ""; }
		var controls = { provider: provider, model: model, maxTokens: POLISH_MAX_OUTPUT_TOKENS };
		if (typeof request.reasoningEffort === "string" && request.reasoningEffort.length > 0) controls.reasoningEffort = request.reasoningEffort;
		// 单次调用；system / user 由调用方拼
		var self = this;
		var runOnce = async function (systemText, userText) {
			var call = await llm.prepareCall(controls, void 0);
			var options = Object.assign({}, call.config, {
				// 直接给 adapter 一条无身份的 user 输入（不走会话历史，不写任何事件）
				messages: [{ role: "user", content: [{ type: "text", text: userText }] }],
				system: systemText,
				signal: AbortSignal.timeout(POLISH_TIMEOUT_MS)
			});
			var out = "";
			var failure = null;
			for await (var chunk of call.stream(options)) {
				if (chunk === null || chunk === void 0 || typeof chunk !== "object") continue;
				if (chunk.type === "text-delta" && typeof chunk.text === "string") out += chunk.text;
				else if (chunk.type === "finish" && chunk.reason !== null && chunk.reason !== void 0) {
					if (chunk.reason.kind === "error" && chunk.reason.failure !== void 0) failure = chunk.reason.failure;
					else if (chunk.reason.kind === "aborted") failure = { message: "aborted" };
				}
			}
			if (failure !== null && failure !== void 0) throw new Error("模型调用失败（" + String(failure.message || failure.code || "unknown") + "）");
			return out;
		};
		// 第一轮：带上下文。资料放在 user 的 <reference> 块里——放 system 时模型基本不看；
		// 用标签和明确说明把它和「待接的对话」隔开，跑偏由后面的守卫兜底
		var systemText = POLISH_SYSTEM_PROMPT;
		self.info("polish: session=" + String(request.sessionId === void 0 ? "" : request.sessionId) + " contextChars=" + contextText.length + " draftChars=" + draft.length + " systemChars=" + systemText.length + " head=" + contextText.slice(0, 160).replace(/\s+/g, " "));
		var contextBlock = contextText.length > 0 ? "<reference>\n" + contextText + "\n</reference>\n\n" : "";
		// 推进词（继续/接着/下一步）单独给强指令：必须落到具体任务，不许写「继续执行当前任务」这种空话
		var isContinue = /^\s*(继续|接着|下一步|再来|往下)/.test(draft);
		var contextUser;
		if (draft.length === 0) {
			// 输入框是空的：从上下文里最近一轮的助手回复出发，生成下一步指令
			if (contextText.length === 0) throw new Error("输入框是空的，这个会话也没有可参考的对话内容");
			contextUser = "输入框是空的。\n" +
				"看 <reference> 里最近一轮助手回复做到哪、还差什么，据此生成一条可以直接发送给助手的下一步指令：\n" +
				"写清要做什么、对什么对象做、做到什么程度算完成；不要复述对话，不要写成汇报或方案，不要提「输入框」「草稿」。\n\n" +
				contextBlock;
		} else if (isContinue === true && contextText.length > 0) {
			contextUser = "草稿是推进词「" + draft + "」。\n" +
				"从 <reference> 最近几轮里找出这个窗口正在做的具体任务（任务名、仓库/文件/按钮名、还差哪一步），补成一条可以直接发送的具体指令。\n" +
				"禁止写成「继续执行当前任务」「接着往下做」这种空话；指令里必须出现具体的任务对象名。\n\n" +
				contextBlock +
				"<draft>\n" + draft + "\n</draft>";
		} else {
			contextUser = "下面 <reference> 是当前窗口最近的历史，用来判断这个窗口在做什么、做到哪一步。\n" +
				"<draft> 是用户刚写的草稿，可能只有几个字。把它补全成一条可以直接发送的完整指令：\n" +
				"写清要做什么、对什么对象做、做到什么程度算完成。\n\n" +
				contextBlock +
				"<draft>\n" + draft + "\n</draft>";
		}
		// 校验：通过返回 null，不通过返回给用户看的一句话（不带内部术语）
		var draftHasBracket = draft.indexOf("[") !== -1 || draft.indexOf("［") !== -1;
		var draftLines = countLines(draft);
		var limit = Math.max(2000, draft.length * 10);
		var checkPolish = function (text, background) {
			if (text.length === 0) return "模型没返回内容，这次没改";
			if (text.length > limit) return "模型写得太长，这次没改（输出 " + text.length + " 字，上限 " + limit + " 字）";
			var lines = countLines(text);
			var lineLimit = Math.max(40, draftLines * 3 + 10);
			if (lines > lineLimit) return "模型写成了多段内容，不是一条指令，这次没改（输出 " + lines + " 行，上限 " + lineLimit + " 行）";
			if (draft.indexOf("```") === -1 && text.indexOf("```") !== -1) return "模型写了代码块，这次没改";
			if (draftHasBracket !== true && hasPlaceholder(text)) {
				var hit = /[\[［][^\]］\n]{1,30}[\]］]/.exec(text);
				return "没找到能对上的东西，这次没改（模型留了空壳：" + (hit === null ? "［…］" : hit[0]) + "）";
			}
			if (background.length > 0 && copiesContext(text, background)) return "模型在复述对话内容，这次没改";
			return null;
		};

		// 第一轮：带上下文
		var polished = cleanPolishedText(parsePolishOutput(await runOnce(systemText, contextUser)));
		self.info("polish: raw1 len=" + polished.length + " check=" + String(checkPolish(polished, contextText)) + " head=" + polished.slice(0, 120).replace(/\s+/g, " "));
		var firstProblem = checkPolish(polished, contextText);

		// 空草稿没有「通顺化」可做：失败了直接报错
		if (firstProblem !== null && draft.length === 0) throw new Error(firstProblem);

		// 其他不通过自动重试一次：只做「通顺化」，不许补背景、不许编对象（无上下文时最容易编）
		if (firstProblem !== null) {
			self.info("polish: retry without context, reason=" + firstProblem);
			var retryUser = "只把下面 <draft> 里的草稿改成一句通顺、完整的要求。\n" +
				"这里没有背景信息：不要添加背景、不要指定文件或模块、不要编造对象和位置、不要分点、不要编时间。\n" +
				"<draft>\n" + draft + "\n</draft>";
			polished = cleanPolishedText(parsePolishOutput(await runOnce(POLISH_SYSTEM_PROMPT, retryUser)));
			var secondProblem = checkPolish(polished, "");
			// 通顺化的结果不该比原话长太多，也不该出现文件路径
			if (secondProblem === null && polished.length > Math.max(300, draft.length * 6)) secondProblem = "模型没找到对应内容，这次没改（把话写具体点再试）";
			if (secondProblem === null && /[A-Za-z]:\\|\.(tsx|ts|js|json|md|py)\b/.test(polished)) secondProblem = "模型凭空写了文件，这次没改";
			self.info("polish: raw2 len=" + polished.length + " check=" + String(secondProblem) + " head=" + polished.slice(0, 120).replace(/\s+/g, " "));
			if (secondProblem !== null) throw new Error(secondProblem);
		}
		return { text: polished, provider: provider, model: model };
	}

	/** 上传头像（data URL → assets/<which>.<ext>），覆盖旧图，≤5MB。 */
	uploadAvatar(which, dataUrl) {
		try {
			if (which !== "user" && which !== "assistant") return false;
			var parsed = parseDataUrl(dataUrl);
			if (!parsed || !/^image\//.test(parsed.mime)) return false;
			if (parsed.buf.length === 0 || parsed.buf.length > 5 * 1024 * 1024) return false;
			mkdirSync(ASSETS_DIR, { recursive: true });
			var old = findAvatarFile(which);
			var target = which + "." + parsed.ext;
			if (old && old !== target) {
				try { unlinkSync(join(ASSETS_DIR, old)); } catch (e) { /* 旧图删不掉不阻塞 */ }
			}
			writeFileSync(join(ASSETS_DIR, target), parsed.buf);
			return true;
		} catch (e) {
			return false;
		}
	}
};

function apply(ctx, config) {
	new AvatarService(ctx);
}

export { AvatarService, apply };
export default { apply };
