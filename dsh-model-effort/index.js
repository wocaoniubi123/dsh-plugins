// dsh-model-vision · host 侧：思考档位记忆 + 供应商启用 + 连通性测试服务。
//
// 只提供 effort-memory.json 的读写（选模型/改档位时记录
// 「厂商:模型ID → 档位」）。不再拉取 models.dev 目录——模型能力
// （思考档位/视觉名单）不再依赖远程数据。
import { Service } from "@deepseek-ai/cordis";
import { bindTypertRemote } from "@deepseek-ai/dsh-typert-protocol";
import { addStrictCodecFactories } from "./typert-compat.js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

var MODULE_DIR = dirname(fileURLToPath(import.meta.url));
var MEMORY_FILE = join(MODULE_DIR, "effort-memory.json");
var effortMemory = null; // { "<provider>:<modelId>": "<effortId>" }
var ENABLED_FILE = join(MODULE_DIR, "provider-enabled.json");
var providerEnabled = null; // { "<providerKey>": false }，缺省/无记录 = 启用

function readMemory() {
	if (effortMemory !== null) return effortMemory;
	try { effortMemory = JSON.parse(readFileSync(MEMORY_FILE, "utf8")); } catch (e) { effortMemory = {}; }
	if (!effortMemory || typeof effortMemory !== "object") effortMemory = {};
	return effortMemory;
}

function writeMemory(map) {
	effortMemory = map;
	try {
		mkdirSync(dirname(MEMORY_FILE), { recursive: true });
		writeFileSync(MEMORY_FILE, JSON.stringify(map));
	} catch (e) { /* 写失败保留内存态 */ }
}

function readEnabled() {
	if (providerEnabled !== null) return providerEnabled;
	try { providerEnabled = JSON.parse(readFileSync(ENABLED_FILE, "utf8")); } catch (e) { providerEnabled = {}; }
	if (!providerEnabled || typeof providerEnabled !== "object") providerEnabled = {};
	return providerEnabled;
}

function writeEnabled(map) {
	providerEnabled = map;
	try {
		mkdirSync(dirname(ENABLED_FILE), { recursive: true });
		writeFileSync(ENABLED_FILE, JSON.stringify(map));
	} catch (e) { /* 写失败保留内存态 */ }
}

var looseSchema = { parse: function (v) { return v; } };

// ── 连通性测试：读 API Key + 发最小请求 ──────────────────────────────
// Key 来源优先级：客户端直传（未保存新卡用户手输的明文）> credentials.yaml
// refs > 进程环境变量。settings.yaml 只存 key 引用名（apiKeyEnv），明文不落
// 该文件，故已保存提供方必须走 credentials/env 取值。
var CRED_FILE = join(homedir(), ".dsh", ".credentials.yaml");
function readCredentialRef(name) {
	if (!name) return null;
	var text;
	try { text = readFileSync(CRED_FILE, "utf8"); } catch (e) { return null; }
	// refs 段是 YAML flow map：`{ KEY: value, KEY2: value2 }`，正则提取目标键。
	var re = new RegExp("(?:^|[{,\\s])" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*:\\s*([^,}\\s]+)");
	var m = text.match(re);
	if (m) return m[1].replace(/^['"]|['"]$/g, "");
	return null;
}
function resolveApiKey(apiKeyDirect, apiKeyEnv) {
	if (typeof apiKeyDirect === "string" && apiKeyDirect.trim()) return apiKeyDirect.trim();
	var fromFile = readCredentialRef(apiKeyEnv);
	if (fromFile) return fromFile;
	if (apiKeyEnv && process.env[apiKeyEnv]) return process.env[apiKeyEnv];
	return null;
}
// 按协议拼测试请求（URL/头/体）。baseURL 已含版本段则不重复加 /v1。
function buildTestRequest(api, baseURL, model, key) {
	var base = String(baseURL || "").replace(/\/+$/, "");
	if (api === "anthropic-messages") {
		var aUrl = /\/v1$/.test(base) ? base + "/messages" : base + "/v1/messages";
		return {
			url: aUrl,
			headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
			body: { model: model, max_tokens: 5, messages: [{ role: "user", content: "ping" }] }
		};
	}
	if (api === "openai-responses") {
		return {
			url: base + "/responses",
			headers: { "content-type": "application/json", "authorization": "Bearer " + key },
			body: { model: model, input: "ping", max_output_tokens: 5 }
		};
	}
	// openai-completions（默认）
	return {
		url: base + "/chat/completions",
		headers: { "content-type": "application/json", "authorization": "Bearer " + key },
		body: { model: model, max_tokens: 5, messages: [{ role: "user", content: "ping" }] }
	};
}
async function probeProvider(args) {
	var key = resolveApiKey(args.apiKey, args.apiKeyEnv);
	if (!key) return { ok: false, error: "未找到 API Key（提供方未保存密钥且环境变量无对应项）" };
	if (!args.baseURL) return { ok: false, error: "API 地址为空" };
	if (!args.model) return { ok: false, error: "模型 ID 为空" };
	var req = buildTestRequest(args.api, args.baseURL, args.model, key);
	var ctrl = new AbortController();
	var timer = setTimeout(function () { ctrl.abort(); }, 10000);
	var t0 = Date.now();
	try {
		var res = await fetch(req.url, {
			method: "POST",
			headers: req.headers,
			body: JSON.stringify(req.body),
			signal: ctrl.signal
		});
		var latency = Date.now() - t0;
		if (res.ok) return { ok: true, latencyMs: latency, status: res.status };
		var snippet = "";
		try { snippet = (await res.text()).slice(0, 160); } catch (e) {}
		return { ok: false, latencyMs: latency, status: res.status, error: "HTTP " + res.status + (snippet ? "：" + snippet : "") };
	} catch (e) {
		var msg = e && e.name === "AbortError" ? "超时（>10s）" : String(e && e.message || e);
		return { ok: false, latencyMs: Date.now() - t0, error: msg };
	} finally {
		clearTimeout(timer);
	}
}

var INVOCATIONS = [
	{
		id: "dsh-ziyong#effortMemory/getEffortMemory",
		service: "model-vision-effort-memory-service",
		namespace: "effortMemory",
		method: "getEffortMemory",
		invocation: { kind: "direct" },
		parameters: [],
		result: { mode: "strict", typeSymbol: "dsh-ziyong/types#EffortMemory", schema: looseSchema },
		sourceLocation: { file: "dsh-ziyong/model-vision/index.js", line: 1, column: 1 }
	},
	{
		id: "dsh-ziyong#effortMemory/setModelEffort",
		service: "model-vision-effort-memory-service",
		namespace: "effortMemory",
		method: "setModelEffort",
		invocation: { kind: "direct" },
		parameters: [
			{ name: "key", wire: "key", source: "json", codec: { mode: "src-json" } },
			{ name: "effort", wire: "effort", source: "json", codec: { mode: "src-json" } }
		],
		result: { mode: "strict", typeSymbol: "dsh-ziyong/types#boolean", schema: looseSchema },
		sourceLocation: { file: "dsh-ziyong/model-vision/index.js", line: 1, column: 1 }
	},
	{
		id: "dsh-ziyong#effortMemory/getProviderEnabled",
		service: "model-vision-effort-memory-service",
		namespace: "effortMemory",
		method: "getProviderEnabled",
		invocation: { kind: "direct" },
		parameters: [],
		result: { mode: "strict", typeSymbol: "dsh-ziyong/types#EffortMemory", schema: looseSchema },
		sourceLocation: { file: "dsh-ziyong/model-vision/index.js", line: 1, column: 1 }
	},
	{
		id: "dsh-ziyong#effortMemory/setProviderEnabled",
		service: "model-vision-effort-memory-service",
		namespace: "effortMemory",
		method: "setProviderEnabled",
		invocation: { kind: "direct" },
		parameters: [
			{ name: "key", wire: "key", source: "json", codec: { mode: "src-json" } },
			{ name: "enabled", wire: "enabled", source: "json", codec: { mode: "src-json" } }
		],
		result: { mode: "strict", typeSymbol: "dsh-ziyong/types#boolean", schema: looseSchema },
		sourceLocation: { file: "dsh-ziyong/model-vision/index.js", line: 1, column: 1 }
	},
	{
		id: "dsh-ziyong#effortMemory/testProvider",
		service: "model-vision-effort-memory-service",
		namespace: "effortMemory",
		method: "testProvider",
		invocation: { kind: "direct" },
		parameters: [
			{ name: "api", wire: "api", source: "json", codec: { mode: "src-json" } },
			{ name: "baseURL", wire: "baseURL", source: "json", codec: { mode: "src-json" } },
			{ name: "model", wire: "model", source: "json", codec: { mode: "src-json" } },
			{ name: "apiKeyEnv", wire: "apiKeyEnv", source: "json", codec: { mode: "src-json" } },
			{ name: "apiKey", wire: "apiKey", source: "json", codec: { mode: "src-json" } }
		],
		result: { mode: "strict", typeSymbol: "dsh-ziyong/types#TestResult", schema: looseSchema },
		sourceLocation: { file: "dsh-ziyong/model-vision/index.js", line: 1, column: 1 }
	}
];
var EFFORT_TYPERT = {
	package: "dsh-ziyong/model-vision",
	face: "host",
	schemas: [],
	model: { services: [], events: [], objects: [] },
	invocations: addStrictCodecFactories(INVOCATIONS)
};
function registerEffortRemote(ctx) {
	var existing = ctx.get("typert");
	if (existing !== void 0) {
		existing.register(EFFORT_TYPERT);
		return;
	}
	ctx.inject(["typert"], function (tctx) {
		tctx.typert.register(EFFORT_TYPERT);
	});
}

var ModelVisionEffortMemoryService = class extends Service {
	static inject = [];
	constructor(ctx) {
		super(ctx, "model-vision-effort-memory-service");
		this.typertRemote = bindTypertRemote(this, "model-vision-effort-memory-service", { namespace: "effortMemory" });
		registerEffortRemote(ctx);
	}
	/** 全量记忆表 { "<provider>:<modelId>": "<effortId>" }。 */
	getEffortMemory() {
		return readMemory();
	}
	/** 记录单个模型的档位，返回是否写入成功。 */
	setModelEffort(key, effort) {
		if (typeof key !== "string" || key.length === 0 || typeof effort !== "string" || effort.length === 0) return false;
		var map = readMemory();
		map[key] = effort;
		writeMemory(map);
		return true;
	}
	/** 全量提供方启用表 { "<providerKey>": false }，无记录 = 启用。 */
	getProviderEnabled() {
		return readEnabled();
	}
	/** 设置提供方启用开关，返回是否写入成功。 */
	setProviderEnabled(key, enabled) {
		if (typeof key !== "string" || key.length === 0) return false;
		var map = readEnabled();
		if (enabled === false) {
			map[key] = false;
		} else {
			delete map[key];
		}
		writeEnabled(map);
		return true;
	}
	/**
	* 测试模型连通性：参数逐字段（typert 协议 args 键=参数名）。
	* apiKey 仅未保存新卡传明文手输值；已保存走 apiKeyEnv → credentials/env。
	*/
	async testProvider(api, baseURL, model, apiKeyEnv, apiKey) {
		return probeProvider({ api: api, baseURL: baseURL, model: model, apiKeyEnv: apiKeyEnv, apiKey: apiKey });
	}
};

// 独立插件入口：按 cordis 插件约定实例化服务（原集合版只导出类，靠 loader 的类插件支持）。
export function apply(ctx) {
	new ModelVisionEffortMemoryService(ctx);
}

export { ModelVisionEffortMemoryService };
export default { apply };
