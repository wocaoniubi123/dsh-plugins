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
	constructor(ctx) {
		super(ctx, "dsh-avatar-service");
		this.typertRemote = bindTypertRemote(this, "dsh-avatar-service", { namespace: "avatar" });
		registerAvatarRemote(ctx);
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
