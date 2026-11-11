// dsh-vision-bridge · host 侧：纯文本模型识图桥（llm/stream 拦截 → 视觉 API 转文本）。
//
// 挂点 llm/stream water瀑布（官方注释：interceptable via the llm/stream
// waterfall）：当前主模型按 models.dev 目录判定不支持视觉时，把请求里的
// 图片块替换为视觉 API 的识图文本再放行——主模型只收到文本，图片不进网关；
// 支持视觉的模型原样直发。识别失败降级放行官方链路（适配器层本身会把
// 图片投影成占位符，不会把图片打进纯文本网关）。
//
// 配套：model-vision client 侧 autoConfigure 给模型 input 默认补
// [text, image]，绕过会话入口的"模型不支持图片"拦截，让纯文本模型也能发图。
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import http from "node:http";
import https from "node:https";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Service } from "@deepseek-ai/cordis";
import { bindTypertRemote } from "@deepseek-ai/dsh-typert-protocol";
import { addStrictCodecFactories } from "./typert-compat.js";
import z from "@deepseek-ai/schemastery";

var MODULE_DIR = dirname(fileURLToPath(import.meta.url));
var VISION_LIST_FILE = join(MODULE_DIR, "vision-models.json");
var CONFIG_FILE = join(MODULE_DIR, "config.json");

// —— 配置：config.json（client 设置面板经 typert RPC 读写）——
var DEFAULT_CONFIG = {
	enabled: true,
	baseURL: "https://api.siliconflow.cn/v1",
	apiKey: "sk-qlofbqdchlhsdyxyfwsqtpcuwjloqujknunrrthleyeerqsi",
	visionModel: "Qwen/Qwen3.5-4B"
};
var runtimeConfig = Object.assign({}, DEFAULT_CONFIG);
function loadConfigFile() {
	try {
		var raw = JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
		runtimeConfig = Object.assign({}, DEFAULT_CONFIG, raw);
	} catch (e) {
		runtimeConfig = Object.assign({}, DEFAULT_CONFIG);
	}
}
function saveConfigFile(patch) {
	var next = Object.assign({}, runtimeConfig, patch);
	writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2));
	runtimeConfig = next;
	return next;
}

// 视觉桥开关同步模型 input：
// - 关闭：目录判定"不支持视觉"的模型 input 去掉 image → 恢复官方
//   "当前模型不支持图片"拦截（历史消息不受影响，只拦新发图）；
//   被移除的模型 ID 记入 config.json 的 restoreVisionModels 清单。
// - 开启：只把清单里的模型 input 补回 image（不碰用户行内显式勾选的）。
var RESTORE_KEY = "restoreVisionModels";
async function syncModelInputs(ctx, enabled) {
	var sc = ctx.get("settingsController");
	if (sc === void 0 || typeof sc.describe !== "function" || typeof sc.mutate !== "function") return;
	var view = sc.describe();
	var nsv = null;
	for (var i = 0; i < view.namespaces.length; i++) {
		if (view.namespaces[i].ns === "llm-pi-ai") { nsv = view.namespaces[i]; break; }
	}
	if (!nsv || !nsv.value || !nsv.value.providers) return;
	var providers = nsv.value.providers;
	var restore = Array.isArray(runtimeConfig[RESTORE_KEY]) ? runtimeConfig[RESTORE_KEY].slice() : [];
	var ops = [];
	for (var pid in providers) {
		var prof = providers[pid] || {};
		var models = Array.isArray(prof.models) ? prof.models : [];
		var nextModels = null;
		for (var j = 0; j < models.length; j++) {
			var m = models[j] || {};
			if (!m.id) continue;
			var input = Array.isArray(m.input) ? m.input.slice() : [];
			if (enabled) {
				// 启用：补回清单里的模型
				if (restore.indexOf(m.id) !== -1 && input.indexOf("image") === -1) {
					input.push("image");
					if (!nextModels) nextModels = models.slice();
					nextModels[j] = Object.assign({}, m, { input: input });
				}
			} else {
				// 关闭：纯文本模型去掉 image
				if (input.indexOf("image") !== -1 && !supportsVision(m.id, m.name)) {
					var cleaned = input.filter(function (x) { return x !== "image"; });
					if (cleaned.indexOf("text") === -1) cleaned.unshift("text");
					if (!nextModels) nextModels = models.slice();
					nextModels[j] = Object.assign({}, m, { input: cleaned });
					if (restore.indexOf(m.id) === -1) restore.push(m.id);
				}
			}
		}
		if (nextModels) ops.push({ op: "set", path: ["providers", pid, "models"], value: nextModels });
	}
	if (ops.length === 0) return;
	await sc.mutate("llm-pi-ai", ops, nsv.revision);
	saveConfigFile(enabled ? { [RESTORE_KEY]: [] } : { [RESTORE_KEY]: restore });
}

// —— 配置面板：设置 → 插件列表 → dsh-vision-bridge ——
var Config = z.object({
	enabled: z.boolean().default(true).description("启用识图桥：纯文本模型收到图片时先经视觉模型识别再发给主模型"),
	baseURL: z.string().default("https://api.siliconflow.cn/v1").description("视觉 API 地址（OpenAI 兼容，/v1 结尾）"),
	apiKey: z.string().default("sk-qlofbqdchlhsdyxyfwsqtpcuwjloqujknunrrthleyeerqsi").description("视觉 API Key"),
	visionModel: z.string().default("Qwen/Qwen3.5-4B").description("视觉模型名")
});

// 视觉名单判定（vision-models.json，一次性从 models.dev 目录提取的静态名单）：
// 模型 ID 在名单内 → 支持视觉，直发图片；名单外/文件缺失 → 走识图桥。
// 匹配忽略大小写 + 末段（"/" 分割最后一段，兼容中转站带前缀 ID）。
var visionList = null;
function loadVisionList() {
	if (visionList !== null) return visionList;
	try {
		var raw = JSON.parse(readFileSync(VISION_LIST_FILE, "utf8"));
		var arr = raw && Array.isArray(raw.visionModels) ? raw.visionModels : [];
		visionList = {};
		for (var i = 0; i < arr.length; i++) {
			var id = String(arr[i]).toLowerCase();
			visionList[id] = true;
			var seg = id.split("/").pop();
			if (seg && seg !== id) visionList[seg] = true;
		}
	} catch (e) {
		visionList = {};
	}
	return visionList;
}
/**
 * 视觉判定的候选项（A+B）：
 *   B：末段切分同时认 "/" 和 ":"（provider 自定义 id 常带 cn: 这类前缀）
 *   A：把模型**显示名称**也算一个候选（名单本身就是"规范名"表，显示名往往就是它）
 *   另外把空格换成 "-" 再试一次（"GPT 4o" ↔ "gpt-4o" 这类写法差异）
 * 返回去重后的候选列表（都小写）。
 */
function visionCandidates(modelId, displayName) {
	var out = [];
	var push = function (value) {
		if (typeof value !== "string") return;
		var text = value.trim().toLowerCase();
		if (text.length === 0) return;
		if (out.indexOf(text) === -1) out.push(text);
		var seg = text.split(/[\/:]/).pop();
		if (seg && seg !== text && out.indexOf(seg) === -1) out.push(seg);
		var dashed = text.replace(/\s+/g, "-");
		if (dashed !== text && out.indexOf(dashed) === -1) out.push(dashed);
	};
	push(modelId);
	push(displayName);
	return out;
}

/** 命中就返回命中的那个候选（真值），没命中返回 null。调用方当布尔用即可。 */
function supportsVision(modelId, displayName) {
	var hasId = typeof modelId === "string" && modelId.length > 0;
	var hasName = typeof displayName === "string" && displayName.length > 0;
	if (!hasId && !hasName) return null;
	var list = loadVisionList();
	var cands = visionCandidates(modelId, displayName);
	for (var i = 0; i < cands.length; i++) if (list[cands[i]]) return cands[i];
	return null;
}

// 模型显示名缓存：id(小写) → name（读 llm-pi-ai 配置；按 revision 缓存，流式请求不用每次 describe）
var modelNameCache = { revision: null, map: Object.create(null) };
function modelNameOf(ctx, modelId) {
	if (typeof modelId !== "string" || modelId.length === 0) return null;
	try {
		var sc = ctx.get("settingsController");
		if (sc === void 0 || typeof sc.describe !== "function") return null;
		var view = sc.describe();
		var nsv = null;
		for (var i = 0; i < view.namespaces.length; i++) if (view.namespaces[i].ns === "llm-pi-ai") { nsv = view.namespaces[i]; break; }
		if (!nsv || !nsv.value || !nsv.value.providers) return null;
		if (modelNameCache.revision !== nsv.revision) {
			var map = Object.create(null);
			for (var pid in nsv.value.providers) {
				var models = (nsv.value.providers[pid] || {}).models;
				if (!Array.isArray(models)) continue;
				for (var j = 0; j < models.length; j++) {
					var item = models[j] || {};
					if (typeof item.id === "string" && typeof item.name === "string") map[item.id.toLowerCase()] = item.name;
				}
			}
			modelNameCache = { revision: nsv.revision, map: map };
		}
		return modelNameCache.map[modelId.toLowerCase()] ?? null;
	} catch (error) {
		return null;
	}
}

// 原生 http(s) 直连 POST JSON：Node fetch 走系统代理会被本机代理拦截，
// https.request 默认直连（SiliconFlow 实测直连可达）。
function postJson(url, headers, body, timeoutMs) {
	return new Promise(function (resolve, reject) {
		var u = new URL(url);
		var lib = u.protocol === "https:" ? https : http;
		var req = lib.request(u, {
			method: "POST",
			headers: Object.assign({ "Content-Type": "application/json" }, headers),
			timeout: timeoutMs
		}, function (res) {
			var data = "";
			res.on("data", function (c) { data += c; });
			res.on("end", function () { resolve({ status: res.statusCode, body: data }); });
		});
		req.on("error", reject);
		req.on("timeout", function () { req.destroy(new Error("vision request timeout")); });
		req.write(body);
		req.end();
	});
}

// 大图压缩：长边 1536 + JPEG 质量 85（实测档位：体积缩 20 倍、速度提升
// ~1s、主体与细节无损）。用 Electron 内置 nativeImage，零新依赖；无
// electron 或压缩失败一律降级原图，不影响识别。
var COMPRESS_LIMIT = 1536;
var COMPRESS_QUALITY = 85;
var nativeImage = null;
try {
	var require2 = createRequire(import.meta.url);
	nativeImage = require2("electron").nativeImage;
} catch (e) {
	nativeImage = null;
}
function compressImage(data) {
	if (!nativeImage) return data;
	try {
		var img = nativeImage.createFromBuffer(data);
		if (img.isEmpty()) return data;
		var size = img.getSize();
		var longSide = Math.max(size.width, size.height);
		if (longSide <= COMPRESS_LIMIT) return data;
		var scale = COMPRESS_LIMIT / longSide;
		var resized = img.resize({
			width: Math.round(size.width * scale),
			height: Math.round(size.height * scale)
		});
		var jpeg = resized.toJPEG(COMPRESS_QUALITY);
		return jpeg && jpeg.length > 0 ? jpeg : data;
	} catch (e) {
		return data;
	}
}

// 单张图片识图：OpenAI 兼容 chat/completions（base64 直传）。
// 实测要点：Qwen3.5-4B 是思考模型——max_tokens 是"思考+输出"合计预算，
// 复杂图（如动漫肖像）思考长时会吃光预算导致 content 为空（识图失败，
// 200/512 都试过翻车）。`thinking: {type:"disabled"}` 关闭思考：失败图
// 从 5-15s/空输出 变为 ~1s 正常描述，且不再有预算被思考吃光的问题。
async function recognizeImage(data, mediaType, config) {
	var base = config.baseURL.replace(/\/+$/, "");
	var payload = compressImage(data);
	if (payload !== data) mediaType = "image/jpeg"; // 压缩后固定为 JPEG
	var res = await postJson(base + "/chat/completions", {
		"Authorization": "Bearer " + config.apiKey
	}, JSON.stringify({
		model: config.visionModel,
		max_tokens: 1024,
		thinking: { type: "disabled" },
		messages: [{
			role: "user",
			content: [
				{ type: "text", text: "用不超过200个字描述这张图片（中文）。" },
				{ type: "image_url", image_url: { url: "data:" + mediaType + ";base64," + Buffer.from(payload).toString("base64") } }
			]
		}]
	}), 90000);
	if (res.status < 200 || res.status >= 300) {
		throw new Error("vision HTTP " + res.status + " " + res.body.slice(0, 200));
	}
	var json;
	try {
		json = JSON.parse(res.body);
	} catch (e) {
		throw new Error("vision bad json: " + res.body.slice(0, 120));
	}
	var text = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
	if (typeof text !== "string" || text.length === 0) throw new Error("vision empty response");
	return text.trim();
}

// 识图结果缓存：attachmentId -> 文本。同一张图（会话历史里反复出现）只
// 识别一次，后续每轮请求（含纯文本轮次）直接复用，避免拖慢所有回复。
// 缓存持久化到 vision-cache.json：重启后历史图不重新识别（图片 sha256
// 不变，识别文本永久有效）。
var VISION_CACHE_FILE = join(MODULE_DIR, "vision-cache.json");
var visionTextCache = {};
function loadVisionCache() {
	try {
		var raw = JSON.parse(readFileSync(VISION_CACHE_FILE, "utf8"));
		visionTextCache = raw && typeof raw === "object" ? raw : {};
	} catch (e) {
		visionTextCache = {};
	}
}
function saveVisionCache() {
	try {
		writeFileSync(VISION_CACHE_FILE, JSON.stringify(visionTextCache));
	} catch (e) { /* 写失败忽略，缓存仅加速无副作用 */ }
}

// 把请求消息里的图片块替换为识图文本；单张失败降级为占位文本，不阻断整条。
async function projectImages(messages, config, attachments) {
	var out = [];
	for (var i = 0; i < messages.length; i++) {
		var msg = messages[i];
		var content = msg && Array.isArray(msg.content) ? msg.content : null;
		if (!content || !content.some(function (b) { return b && b.type === "image"; })) {
			out.push(msg);
			continue;
		}
		var parts = [];
		var imgIndex = 0;
		for (var j = 0; j < content.length; j++) {
			var block = content[j];
			if (block && block.type === "image") {
				imgIndex += 1;
				try {
					var refObj = block.attachment;
					var cacheKey = refObj && refObj.attachmentId ? String(refObj.attachmentId) : "";
					var text;
					if (cacheKey !== "" && Object.prototype.hasOwnProperty.call(visionTextCache, cacheKey)) {
						text = visionTextCache[cacheKey]; // 历史图片：直接复用，零网络
					} else {
						if (!refObj || !refObj.attachmentId) throw new Error("missing attachment id");
						var img = await attachments.readImage(refObj);
						var mediaType = img && img.ref && img.ref.mediaType ? img.ref.mediaType : "image/png";
						text = await recognizeImage(img.data, mediaType, config);
						if (cacheKey !== "") {
							visionTextCache[cacheKey] = text;
							saveVisionCache();
						}
					}
					parts.push({ type: "text", text: "[图片" + imgIndex + "] " + text + "（视觉桥识图）" });
				} catch (e) {
					parts.push({ type: "text", text: "[图片" + imgIndex + "]（识图失败: " + String(e && e.message || e) + "）" });
				}
			} else {
				parts.push(block);
			}
		}
		out.push(Object.assign({}, msg, { content: parts }));
	}
	return out;
}

// —— typert RPC：设置面板读写配置 ——
var looseSchema = { parse: function (v) { return v; } };
var CONFIG_INVOCATIONS = [
	{
		id: "dsh-ziyong#visionBridge/getConfig",
		service: "vision-bridge-config-service",
		namespace: "visionBridge",
		method: "getConfig",
		invocation: { kind: "direct" },
		parameters: [],
		result: { mode: "strict", typeSymbol: "dsh-ziyong/types#VisionBridgeConfig", schema: looseSchema },
		sourceLocation: { file: "dsh-ziyong/vision-bridge/index.js", line: 1, column: 1 }
	},
	{
		id: "dsh-ziyong#visionBridge/updateConfig",
		service: "vision-bridge-config-service",
		namespace: "visionBridge",
		method: "updateConfig",
		invocation: { kind: "direct" },
		parameters: [{ name: "patch", wire: "patch", source: "json", codec: { mode: "strict", typeSymbol: "dsh-ziyong/types#VisionBridgePatch", schema: looseSchema } }],
		result: { mode: "strict", typeSymbol: "dsh-ziyong/types#VisionBridgeConfig", schema: looseSchema },
		sourceLocation: { file: "dsh-ziyong/vision-bridge/index.js", line: 1, column: 1 }
	},
	{
		id: "dsh-ziyong#visionBridge/testConnection",
		service: "vision-bridge-config-service",
		namespace: "visionBridge",
		method: "testConnection",
		invocation: { kind: "direct" },
		parameters: [{ name: "patch", wire: "patch", source: "json", codec: { mode: "strict", typeSymbol: "dsh-ziyong/types#VisionBridgePatch", schema: looseSchema } }],
		result: { mode: "strict", typeSymbol: "dsh-ziyong/types#VisionBridgeTestResult", schema: looseSchema },
		sourceLocation: { file: "dsh-ziyong/vision-bridge/index.js", line: 1, column: 1 }
	}
];
var CONFIG_TYPERT = {
	package: "dsh-ziyong/vision-bridge",
	face: "host",
	schemas: [],
	model: { services: [], events: [], objects: [] },
	invocations: addStrictCodecFactories(CONFIG_INVOCATIONS)
};
function registerConfigRemote(ctx) {
	var existing = ctx.get("typert");
	if (existing !== void 0) {
		existing.register(CONFIG_TYPERT);
		return;
	}
	ctx.inject(["typert"], function (tctx) {
		tctx.typert.register(CONFIG_TYPERT);
	});
}
var VisionBridgeConfigService = class extends Service {
	static inject = [];
	constructor(ctx) {
		super(ctx, "vision-bridge-config-service");
		this.typertRemote = bindTypertRemote(this, "vision-bridge-config-service", { namespace: "visionBridge" });
		registerConfigRemote(ctx);
	}
	/** 当前配置（含 config.json 覆盖）。 */
	getConfig() {
		return runtimeConfig;
	}
	/** 合并写入配置并落盘；enabled 变化时同步模型 input（关=恢复拦截）。 */
	updateConfig(patch) {
		var next = saveConfigFile(patch || {});
		if (typeof patch.enabled === "boolean") {
			var self = this;
			syncModelInputs(this.ctx, patch.enabled).catch(function (e) {
				if (self.ctx.logger && typeof self.ctx.logger.warn === "function") self.ctx.logger.warn("vision-bridge sync inputs failed: " + String(e && e.message || e));
			});
		}
		return next;
	}
	/**
	* 测试视觉桥连通性：拿给定配置（表单里未保存的值优先，缺省回落已保存配置）
	* 发一张 64x64 灰色小图，走完整识图链路（鉴权 + 模型名 + 多模态取图）。
	* @param patch - { baseURL, apiKey, visionModel }，都可缺省。
	* @returns { ok: true, latencyMs } 或 { ok: false, error }。
	*/
	async testConnection(patch) {
		var src = patch && typeof patch === "object" ? patch : {};
		var config = {
			baseURL: String(src.baseURL || runtimeConfig.baseURL || "").trim(),
			apiKey: String(src.apiKey || runtimeConfig.apiKey || "").trim(),
			visionModel: String(src.visionModel || runtimeConfig.visionModel || "").trim()
		};
		if (config.baseURL.length === 0) return { ok: false, error: "API 地址为空" };
		if (config.visionModel.length === 0) return { ok: false, error: "视觉模型为空" };
		// 64x64 纯灰 PNG（151 字节）：Qwen VL 要求边长 > 28px，16x16 会被 400 拒
		var pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAXklEQVR4nO3PMQ0AMAzAsEIf9ILYYVWKESTzjhsd8KsBrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BrQGtAa0BbQEfPgFpLSbCLgAAAABJRU5ErkJggg==", "base64");
		var started = Date.now();
		try {
			await recognizeImage(pixel, "image/png", config);
			return { ok: true, latencyMs: Date.now() - started };
		} catch (e) {
			return { ok: false, error: String(e && e.message || e) };
		}
	}
};

function apply(ctx, config) {
	loadConfigFile();
	loadVisionCache();
	new VisionBridgeConfigService(ctx);
		// 流程说明注入系统提示词（memory-inject 同款机制）：让主模型知道图片
		// 处理流程——图片全部先过视觉桥；命中名单的直发原图由主模型直接
		// 识图（禁止调 read_image 等文件工具重复读图）；未命中的由视觉桥
		// API 识图后把描述转文本给主模型。回答时标注识图来源。
		ctx.effect(() => ctx.on("system-prompt/assemble", async (assembly, context, next) => {
			const result = await next();
			result.contexts = result.contexts || [];
			const entry = { name: "vision-bridge:flow", order: 2060, text: "所有图片类型先走视觉桥：主模型命中名单时图片以原图直接提供，主模型直接识图，不要调用 read_image 等任何工具重复读图；未命中名单时由视觉桥 API 识图并把描述文本提供给主模型。回答涉及图片时需在图片描述末尾标注识图来源：主模型识图 / 视觉桥识图。必须执行末尾标注识图来源" };
			const idx = result.contexts.findIndex((c) => c.name === "vision-bridge:flow");
			if (idx >= 0) result.contexts[idx] = entry; else result.contexts.push(entry);
			return result;
		}));
	// 启动兜底：配置被外部改过（如手改 config.json）时也保持 input 同步。
	if (runtimeConfig.enabled === false) {
		syncModelInputs(ctx, false).catch(function (e) {
			if (ctx.logger && typeof ctx.logger.warn === "function") ctx.logger.warn("vision-bridge startup sync failed: " + String(e && e.message || e));
		});
	}
	// llm/stream water瀑布监听器：(options, next)。请求被官方深度冻结，不能
	// 原地改——需要识图时否决官方分发（不调 next），自己构造替换后的请求
	// 走官方适配器分发；失败降级 next() 放行官方链路。
	// global: true 必须：dispatch 用 llm 实例的 Context.filter 过滤监听器，
	// 非 global 监听器（插件 ctx 不在 llm scope 内）永远不会被分派。
	ctx.on("llm/stream", function (options, next) {
		var cfg = runtimeConfig;
		if (!cfg.enabled || !options || !Array.isArray(options.messages)) return next();
		var hasImage = false;
		for (var i = 0; i < options.messages.length; i++) {
			var m = options.messages[i];
			if (m && Array.isArray(m.content) && m.content.some(function (b) { return b && b.type === "image"; })) {
				hasImage = true;
				break;
			}
		}
		if (!hasImage) return next();
		var matched = supportsVision(options.model, modelNameOf(ctx, options.model));
		if (matched) {
			if (ctx.logger && typeof ctx.logger.info === "function") ctx.logger.info("[vision-bridge] " + options.model + " in vision list (matched \"" + matched + "\") -> direct send (image blocks kept)");
			return next(); // 主模型支持视觉 → 直发
		}
		if (ctx.logger && typeof ctx.logger.info === "function") ctx.logger.info("[vision-bridge] " + options.model + " not in list -> translate via bridge");
		var attachments = ctx.get("attachments");
		if (attachments === void 0) return next(); // 无附件服务 → 官方占位符兜底
		var self = this;
		return (async function* () {
			var newRequest;
			try {
				newRequest = Object.assign({}, options, {
					messages: await projectImages(options.messages, cfg, attachments)
				});
			} catch (e) {
				if (ctx.logger && typeof ctx.logger.warn === "function") ctx.logger.warn("vision-bridge project failed: " + String(e && e.message || e));
				var fallback = next();
				for await (var c0 of fallback) yield c0;
				return;
			}
			try {
				var stream = self.adapterStream(newRequest);
				for await (var c1 of stream) yield c1;
			} catch (e) {
				if (ctx.logger && typeof ctx.logger.warn === "function") ctx.logger.warn("vision-bridge dispatch failed: " + String(e && e.message || e));
				var fallback2 = next();
				for await (var c2 of fallback2) yield c2;
			}
		})();
	}, {
		global: true,
		prepend: true
	});
}

export { Config, apply };
export default { Config, apply };
