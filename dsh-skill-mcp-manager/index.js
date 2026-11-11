// dsh-skill-mcp-manager · host 侧：技能文件与 MCP 服务器的读写。
//
// 技能：官方技能根是 <项目>/.dsh/skills、<项目>/.agents/skills、<DSH_HOME>/skills、
//   ~/.agents/skills；每个技能要么是含 SKILL.md 的目录，要么是单个 .md 文件。
//   这里只做文件级读写，且所有路径都必须在某个技能根内（防越界写）。
// MCP：服务器 = 一条 @deepseek-ai/dsh-mcp-client 的 loader 条目。列表走 loader 实时读
//   （含状态），增删改写成 profile 的 cordis.patch.yml 标记块，重启后生效。
import { Service } from "@deepseek-ai/cordis";
import { bindTypertRemote } from "@deepseek-ai/dsh-typert-protocol";
import { addStrictCodecFactories } from "./typert-compat.js";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

var looseSchema = { parse: function (v) { return v; } };
var MCP_PLUGIN = "@deepseek-ai/dsh-mcp-client";
var MCP_BEGIN = "# >>> dsh-skill-mcp-manager:mcp:begin";
var MCP_END = "# <<< dsh-skill-mcp-manager:mcp:end";
var PROBE_TIMEOUT_MS = 20000;

function errorText(error) {
	return String((error && error.message) || error);
}

/** JSON-RPC 错误对象 → 一行可读文本。 */
function describeRpcError(error) {
	if (error === void 0 || error === null) return "未知错误";
	var code = error.code === void 0 ? "" : "(" + error.code + ") ";
	return code + String(error.message ?? JSON.stringify(error));
}

/** 从响应文本取第一条 JSON-RPC 消息：兼容裸 JSON 与 SSE（data: {...}）两种帧。 */
function firstRpcMessage(text) {
	var trimmed = String(text ?? "").trim();
	if (trimmed.length === 0) return null;
	if (trimmed.charAt(0) === "{") {
		try { return JSON.parse(trimmed); } catch (error) { return null; }
	}
	for (const line of trimmed.split(/\r?\n/)) {
		var body = line.indexOf("data:") === 0 ? line.slice(5).trim() : "";
		if (body.length === 0 || body.charAt(0) !== "{") continue;
		try { return JSON.parse(body); } catch (error) { /* 下一行 */ }
	}
	return null;
}

function toolSummary(result) {
	var tools = result !== void 0 && result !== null && Array.isArray(result.tools) ? result.tools : [];
	return {
		ok: true,
		tools: tools.length,
		toolNames: tools.slice(0, 8).map(function (tool) { return String(tool && tool.name); })
	};
}

/** Windows 上 npx 这类 .cmd 壳要走 shell，带空格的参数要自己加引号。 */
function shellCommandLine(command, args) {
	var quote = function (value) { return /[\s"]/.test(value) ? "\"" + value.replace(/"/g, "\\\"") + "\"" : value; };
	return [quote(command)].concat(args.map(quote)).join(" ");
}

/**
 * stdio 探活：真的把 MCP 服务器拉起来走一遍 initialize → tools/list，然后杀掉。
 * 只做握手，不调工具，不改任何配置。
 */
function probeStdio(entry) {
	return new Promise(function (resolve) {
		var command = String(entry.command ?? "").trim();
		var args = Array.isArray(entry.args) ? entry.args.map(String) : [];
		if (command.length === 0) { resolve({ ok: false, error: "没有 command" }); return; }
		var env = Object.assign({}, process.env);
		if (entry.env !== void 0 && typeof entry.env === "object" && !Array.isArray(entry.env)) {
			for (const key of Object.keys(entry.env)) env[key] = String(entry.env[key]);
		}
		var cwd = String(entry.cwd ?? "").trim();
		var useShell = process.platform === "win32" && !/(\.exe|\.cmd|\.bat|\.com)$/i.test(command);
		var child;
		try {
			child = useShell
				? spawn(shellCommandLine(command, args), { shell: true, env: env, cwd: cwd.length > 0 ? cwd : void 0, windowsHide: true })
				: spawn(command, args, { env: env, cwd: cwd.length > 0 ? cwd : void 0, windowsHide: true });
		} catch (error) { resolve({ ok: false, error: "启动失败：" + errorText(error) }); return; }
		var done = false;
		var buffer = "";
		var stderr = "";
		var started = Date.now();
		var finish = function (result) {
			if (done) return;
			done = true;
			clearTimeout(timer);
			try { child.kill(); } catch (error) { /* 已退出 */ }
			resolve(result);
		};
		var timer = setTimeout(function () {
			finish({ ok: false, error: "超时 " + Math.round(PROBE_TIMEOUT_MS / 1000) + "s 没握手成功" + (stderr.length > 0 ? "；stderr: " + stderr.slice(-200).trim() : "") });
		}, PROBE_TIMEOUT_MS);
		var send = function (message) {
			try { child.stdin.write(JSON.stringify(message) + "\n"); } catch (error) { /* 进程没了，交给 exit 处理 */ }
		};
		child.on("error", function (error) { finish({ ok: false, error: "启动失败：" + errorText(error) }); });
		child.on("exit", function (code, signal) {
			finish({ ok: false, error: "进程退出（" + (signal !== null ? "signal " + signal : "code " + code) + "）" + (stderr.length > 0 ? "；stderr: " + stderr.slice(-200).trim() : "") });
		});
		child.stderr.on("data", function (chunk) { stderr += String(chunk); if (stderr.length > 8000) stderr = stderr.slice(-4000); });
		child.stdout.on("data", function (chunk) {
			buffer += String(chunk);
			var at;
			while ((at = buffer.indexOf("\n")) !== -1) {
				var line = buffer.slice(0, at).trim();
				buffer = buffer.slice(at + 1);
				if (line.length === 0) continue;
				var message;
				try { message = JSON.parse(line); } catch (error) { continue; } // 服务器往 stdout 打日志时跳过
				if (message.id === 1) {
					if (message.error !== void 0) { finish({ ok: false, error: "initialize 失败：" + describeRpcError(message.error) }); return; }
					send({ jsonrpc: "2.0", method: "notifications/initialized" });
					send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
				} else if (message.id === 2) {
					if (message.error !== void 0) { finish({ ok: false, error: "tools/list 失败：" + describeRpcError(message.error) }); return; }
					finish(Object.assign(toolSummary(message.result), { ms: Date.now() - started }));
					return;
				}
			}
		});
		send({
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "dsh-skill-mcp-manager", version: "0.1.0" } }
		});
	});
}

/** streamable-http 探活：POST initialize（拿 session id）→ POST tools/list。 */
function probeHttp(entry) {
	return new Promise(function (resolve) {
		var url;
		try { url = new URL(String(entry.url ?? "").trim()); } catch (error) { resolve({ ok: false, error: "URL 不合法：" + String(entry.url ?? "") }); return; }
		var started = Date.now();
		var done = false;
		var baseHeaders = { "content-type": "application/json", "accept": "application/json, text/event-stream" };
		if (entry.headers !== void 0 && typeof entry.headers === "object" && !Array.isArray(entry.headers)) {
			for (const key of Object.keys(entry.headers)) baseHeaders[key] = String(entry.headers[key]);
		}
		var finish = function (result) {
			if (done) return;
			done = true;
			resolve(result);
		};
		var post = function (payload, sessionId, next) {
			var body = JSON.stringify(payload);
			var headers = Object.assign({}, baseHeaders, { "content-length": Buffer.byteLength(body) });
			if (sessionId !== void 0) headers["mcp-session-id"] = String(sessionId);
			var request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, { method: "POST", headers: headers, timeout: PROBE_TIMEOUT_MS }, function (response) {
				var text = "";
				response.setEncoding("utf8");
				response.on("data", function (chunk) { text += chunk; });
				response.on("end", function () { next(response.statusCode, response.headers, text); });
			});
			request.on("timeout", function () { request.destroy(new Error("超时 " + Math.round(PROBE_TIMEOUT_MS / 1000) + "s 没响应")); });
			request.on("error", function (error) { finish({ ok: false, error: errorText(error) }); });
			request.end(body);
		};
		post({
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "dsh-skill-mcp-manager", version: "0.1.0" } }
		}, void 0, function (status, headers, text) {
			var message = firstRpcMessage(text);
			if (message === null) { finish({ ok: false, error: "HTTP " + status + "：" + text.slice(0, 200) }); return; }
			if (message.error !== void 0) { finish({ ok: false, error: "initialize 失败：" + describeRpcError(message.error) }); return; }
			post({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, headers["mcp-session-id"], function (status2, _headers2, text2) {
				var list = firstRpcMessage(text2);
				if (list === null) { finish({ ok: false, error: "HTTP " + status2 + "：" + text2.slice(0, 200) }); return; }
				if (list.error !== void 0) { finish({ ok: false, error: "tools/list 失败：" + describeRpcError(list.error) }); return; }
				finish(Object.assign(toolSummary(list.result), { ms: Date.now() - started }));
			});
		});
	});
}

var INVOCATIONS = [
	{ id: "dsh-skill-mcp-manager#skillMcp/listSkills", method: "listSkills", parameters: [{ name: "cwd", wire: "cwd", source: "json", codec: { mode: "src-json" } }], typeSymbol: "dsh-skill-mcp-manager/types#SkillList" },
	{ id: "dsh-skill-mcp-manager#skillMcp/readSkill", method: "readSkill", parameters: [{ name: "path", wire: "path", source: "json", codec: { mode: "src-json" } }], typeSymbol: "dsh-skill-mcp-manager/types#SkillContent" },
	{ id: "dsh-skill-mcp-manager#skillMcp/saveSkill", method: "saveSkill", parameters: [{ name: "path", wire: "path", source: "json", codec: { mode: "src-json" } }, { name: "content", wire: "content", source: "json", codec: { mode: "src-json" } }], typeSymbol: "dsh-skill-mcp-manager/types#Saved" },
	{ id: "dsh-skill-mcp-manager#skillMcp/createSkill", method: "createSkill", parameters: [{ name: "rootPath", wire: "rootPath", source: "json", codec: { mode: "src-json" } }, { name: "name", wire: "name", source: "json", codec: { mode: "src-json" } }, { name: "content", wire: "content", source: "json", codec: { mode: "src-json" } }], typeSymbol: "dsh-skill-mcp-manager/types#Created" },
	{ id: "dsh-skill-mcp-manager#skillMcp/deleteSkill", method: "deleteSkill", parameters: [{ name: "path", wire: "path", source: "json", codec: { mode: "src-json" } }], typeSymbol: "dsh-skill-mcp-manager/types#Deleted" },
	{ id: "dsh-skill-mcp-manager#skillMcp/uploadSkill", method: "uploadSkill", parameters: [{ name: "rootPath", wire: "rootPath", source: "json", codec: { mode: "src-json" } }, { name: "name", wire: "name", source: "json", codec: { mode: "src-json" } }, { name: "entries", wire: "entries", source: "json", codec: { mode: "src-json" } }], typeSymbol: "dsh-skill-mcp-manager/types#Uploaded" },
	{ id: "dsh-skill-mcp-manager#skillMcp/listMcp", method: "listMcp", parameters: [], typeSymbol: "dsh-skill-mcp-manager/types#McpList" },
	{ id: "dsh-skill-mcp-manager#skillMcp/saveMcp", method: "saveMcp", parameters: [{ name: "servers", wire: "servers", source: "json", codec: { mode: "src-json" } }], typeSymbol: "dsh-skill-mcp-manager/types#Saved" },
	{ id: "dsh-skill-mcp-manager#skillMcp/upsertMcpServer", method: "upsertMcpServer", parameters: [{ name: "server", wire: "server", source: "json", codec: { mode: "src-json" } }], typeSymbol: "dsh-skill-mcp-manager/types#Saved" },
	{ id: "dsh-skill-mcp-manager#skillMcp/removeMcpServer", method: "removeMcpServer", parameters: [{ name: "serverName", wire: "serverName", source: "json", codec: { mode: "src-json" } }], typeSymbol: "dsh-skill-mcp-manager/types#Saved" },
	{ id: "dsh-skill-mcp-manager#skillMcp/importMcpServers", method: "importMcpServers", parameters: [{ name: "entries", wire: "entries", source: "json", codec: { mode: "src-json" } }], typeSymbol: "dsh-skill-mcp-manager/types#Saved" },
	{ id: "dsh-skill-mcp-manager#skillMcp/testMcp", method: "testMcp", parameters: [{ name: "server", wire: "server", source: "json", codec: { mode: "src-json" } }], typeSymbol: "dsh-skill-mcp-manager/types#McpTest" }
].map(function (entry) {
	return {
		id: entry.id,
		service: "skill-mcp-manager-service",
		namespace: "skillMcp",
		method: entry.method,
		invocation: { kind: "direct" },
		parameters: entry.parameters.map(function (parameter) {
			return { name: parameter.name, wire: parameter.wire, source: "json", acceptsUndefined: true, codec: parameter.codec };
		}),
		result: { mode: "strict", typeSymbol: entry.typeSymbol, schema: looseSchema },
		sourceLocation: { file: "dsh-skill-mcp-manager/index.js", line: 1, column: 1 }
	};
});
var TYPERT = {
	package: "dsh-skill-mcp-manager",
	face: "host",
	schemas: [],
	model: { services: [], events: [], objects: [] },
	invocations: addStrictCodecFactories(INVOCATIONS)
};
function registerRemote(ctx) {
	var existing = ctx.get("typert");
	if (existing !== void 0) {
		existing.register(TYPERT);
		return;
	}
	ctx.inject(["typert"], function (tctx) {
		tctx.typert.register(TYPERT);
	});
}

/** 技能根清单（顺序即优先级）。cwd 可给多个（当前会话 + 各工作区）。 */
function skillRoots(dshHome, cwds) {
	var roots = [];
	var seen = {};
	var push = function (path, source) {
		var key = resolve(path).toLowerCase();
		if (seen[key] === true) return;
		seen[key] = true;
		roots.push({ path: path, source: source });
	};
	for (const cwd of cwds) {
		if (typeof cwd !== "string" || cwd.length === 0) continue;
		push(join(cwd, ".dsh", "skills"), "工作区 .dsh/skills · " + cwd);
		push(join(cwd, ".agents", "skills"), "工作区 .agents/skills · " + cwd);
	}
	push(join(dshHome, "skills"), "用户 ~/.dsh/skills");
	push(join(homedir(), ".agents", "skills"), "用户 ~/.agents/skills");
	return roots;
}

/**
 * 归一化上传条目：路径必须在目标目录内（防越界），并把外层套的那层目录识别出来丢掉
 * （用户从上一级选文件夹时很常见）。ponytail: 只认一层嵌套，嵌套更深的自己选对目录。
 */
function normalizeUploadEntries(dir, entries) {
	var list = Array.isArray(entries) ? entries : [];
	if (list.length === 0) throw new Error("没有可写入的文件");
	var boundary = dir.endsWith(sep) ? dir : dir + sep;
	var files = [];
	for (const item of list) {
		var relative = String((item ?? {}).path ?? "").replace(/\\/g, "/").replace(/^\/+/, "").trim();
		if (relative.length === 0) throw new Error("有条目的路径是空的");
		var parts = relative.split("/");
		if (parts.indexOf("..") !== -1 || parts.some(function (part) { return part.length === 0; })) throw new Error("非法路径: " + relative);
		var target = resolve(dir, relative);
		if (target !== dir && !target.startsWith(boundary)) throw new Error("路径越界: " + relative);
		files.push({
			relative: relative,
			target: target,
			text: typeof item.text === "string" ? item.text : null,
			base64: typeof item.base64 === "string" ? item.base64 : null
		});
	}
	var prefix = "";
	var skillFile = files.filter(function (file) { return file.relative.toLowerCase() === "skill.md"; })[0];
	if (skillFile === void 0) {
		var nested = files.filter(function (file) { return /^[^/]+\/skill\.md$/i.test(file.relative); });
		if (nested.length === 1) {
			prefix = nested[0].relative.slice(0, nested[0].relative.lastIndexOf("/") + 1);
			skillFile = nested[0];
		}
	}
	if (skillFile === void 0) {
		// 整套都在同一个顶层目录里（选文件夹的常见形态）→ 把它当技能根
		var tops = [];
		for (const file of files) {
			var top = file.relative.split("/")[0];
			if (tops.indexOf(top) === -1) tops.push(top);
		}
		if (tops.length === 1 && files.every(function (file) { return file.relative.indexOf(tops[0] + "/") === 0; })) prefix = tops[0] + "/";
	}
	if (skillFile === void 0) {
		// 还是只有一个 .md（或技能根下只有一个 .md）→ 按约定补成 SKILL.md
		var candidates = files.filter(function (file) {
			var relative = file.relative.slice(prefix.length);
			return /^[^/]+\.md$/i.test(relative);
		});
		if (candidates.length === 1) {
			var renamed = prefix + "SKILL.md";
			candidates[0].relative = renamed;
			candidates[0].target = resolve(dir, renamed);
		}
	}
	// 只保留技能根下的文件，并把外层目录从相对路径里剥掉（写盘一律用剥完的路径）
	var kept = [];
	for (const file of files) {
		if (prefix.length > 0 && file.relative.indexOf(prefix) !== 0) continue;
		var stripped = file.relative.slice(prefix.length);
		if (stripped.length === 0) continue;
		file.relative = stripped;
		file.target = resolve(dir, stripped);
		kept.push(file);
	}
	return { prefix: prefix, files: kept };
}

/** SKILL.md 缺 frontmatter 时补上（官方加载器没 frontmatter 会直接忽略。 */
function withFrontmatter(text, name) {
	if (/^\uFEFF?---\r?\n/.test(text)) return { text: text, added: false };
	var firstLine = text.split(/\r?\n/).map(function (line) { return line.replace(/^#+\s*/, "").trim(); }).filter(function (line) { return line.length > 0; })[0] ?? "";
	var head = "---\nname: " + name + "\ndescription: " + (firstLine.length > 0 ? JSON.stringify(firstLine.slice(0, 120)) : "\"\"") + "\n---\n\n";
	return { text: head + text, added: true };
}

/** 校验 + 归一化 MCP 服务器清单（写盘和运行时用的是同一份数据）。 */
function normalizeMcpServers(list) {
	var entries = [];
	for (const raw of Array.isArray(list) ? list : []) {
		var server = raw ?? {};
		var serverName = String(server.serverName ?? "").trim();
		if (!/^[A-Za-z0-9._-]+$/.test(serverName)) throw new Error("serverName 只能包含字母/数字/._- : " + serverName);
		var transport = server.transport === "streamable-http" ? "streamable-http" : "stdio";
		var id = String(server.id ?? "").trim().length > 0 ? String(server.id).trim() : "mcp-" + serverName;
		var entry = {
			id: id,
			serverName: serverName,
			transport: transport,
			command: String(server.command ?? "").trim(),
			args: Array.isArray(server.args) ? server.args.map(String) : [],
			env: server.env !== void 0 && typeof server.env === "object" && !Array.isArray(server.env) ? server.env : {},
			url: String(server.url ?? "").trim(),
			headers: server.headers !== void 0 && typeof server.headers === "object" && !Array.isArray(server.headers) ? server.headers : {},
			cwd: String(server.cwd ?? "").trim(),
			toolCallTimeoutMs: typeof server.toolCallTimeoutMs === "number" && server.toolCallTimeoutMs > 0 ? Math.round(server.toolCallTimeoutMs) : 0
		};
		entries.push(entry);
	}
	return entries;
}

/** 条目 → patch 标记块里的 YAML 行（格式固定，改动请同步 updateMcpBlock 的解析）。 */
function renderMcpBlock(entries) {
	var lines = [MCP_BEGIN];
	if (entries.length > 0) {
		lines.push("- insert:");
		for (const entry of entries) {
			lines.push("    - id: " + entry.id);
			lines.push("      name: '" + MCP_PLUGIN + "'");
			lines.push("      config:");
			lines.push("        serverName: " + JSON.stringify(entry.serverName));
			lines.push("        transport: " + entry.transport);
			if (entry.transport === "streamable-http") {
				lines.push("        url: " + JSON.stringify(entry.url));
				var headers = Object.keys(entry.headers);
				if (headers.length > 0) {
					lines.push("        headers:");
					for (const key of headers) lines.push("          " + key + ": " + JSON.stringify(String(entry.headers[key])));
				}
			} else {
				lines.push("        command: " + JSON.stringify(entry.command));
				if (entry.args.length > 0) {
					lines.push("        args:");
					for (const arg of entry.args) lines.push("          - " + JSON.stringify(arg));
				}
				var env = Object.keys(entry.env);
				if (env.length > 0) {
					lines.push("        env:");
					for (const key of env) lines.push("          " + key + ": " + JSON.stringify(String(entry.env[key])));
				}
				if (entry.cwd.length > 0) lines.push("        cwd: " + JSON.stringify(entry.cwd));
			}
			if (entry.toolCallTimeoutMs > 0) lines.push("        toolCallTimeoutMs: " + entry.toolCallTimeoutMs);
		}
	}
	lines.push(MCP_END);
	return lines;
}

/**
 * 解析 patch 标记块 → 条目数组（renderMcpBlock 的逆运算）。
 * 配置的权威来源是文件，不是运行时 loader —— 运行时为空时绝不能当成没有配置。
 */
function parseMcpBlock(text) {
	var begin = text.indexOf(MCP_BEGIN);
	var end = text.indexOf(MCP_END);
	if (begin === -1 || end === -1 || end < begin) return [];
	var lines = text.slice(begin, end).split(/\r?\n/);
	var entries = [];
	var current = null;
	var section = "";
	for (var li = 0; li < lines.length; li++) {
		var line = lines[li];
		var item = /^ {4}- id: (.+)$/.exec(line);
		if (item !== null) {
			current = { id: item[1].trim(), serverName: "", transport: "stdio", command: "", args: [], env: {}, url: "", headers: {}, cwd: "", toolCallTimeoutMs: 0 };
			entries.push(current);
			section = "";
			continue;
		}
		if (current === null) continue;
		var scalar = /^ {8}(serverName|transport|command|url|cwd|toolCallTimeoutMs): (.+)$/.exec(line);
		if (scalar !== null) {
			var key = scalar[1];
			var joined = joinYamlScalar(lines, li, scalar[2]);
			li += joined.consumed;
			var raw = joined.text.trim();
			if (key === "transport") current.transport = raw === "streamable-http" ? "streamable-http" : "stdio";
			else if (key === "toolCallTimeoutMs") current.toolCallTimeoutMs = Number(raw) > 0 ? Math.round(Number(raw)) : 0;
			else current[key] = parseYamlString(raw);
			section = "";
			continue;
		}
		if (/^ {8}(args|env|headers):$/.test(line)) { section = /args/.test(line) ? "args" : (/env/.test(line) ? "env" : "headers"); continue; }
		if (section === "args") {
			var arg = /^ {10}- (.+)$/.exec(line);
			if (arg !== null) {
				var argJoined = joinYamlScalar(lines, li, arg[1]);
				li += argJoined.consumed;
				current.args.push(parseYamlString(argJoined.text.trim()));
			}
			continue;
		}
		if (section === "env" || section === "headers") {
			var pair = /^ {10}([^:]+): (.+)$/.exec(line);
			if (pair !== null) {
				var pairJoined = joinYamlScalar(lines, li, pair[2]);
				li += pairJoined.consumed;
				current[section][pair[1].trim()] = parseYamlString(pairJoined.text.trim());
			}
		}
	}
	return entries;
}

/**
 * 挑出标记区里「不是我写的」内容。官方写盘工具（任何设置一改就重排整份 YAML）会把
 * ui-chat 这类条目塞到我的标记区里（注释位置被重排），整段替换标记区就会把它删掉
 * （实测：改一次 MCP 就把「工作步骤展示/网页链接」打回默认）。这里把它们挪到标记区外面。
 */
function foreignInBlock(region) {
	var lines = String(region ?? "").split(/\r?\n/);
	var keep = [];
	var inMine = false;
	for (const line of lines) {
		if (line.indexOf(MCP_BEGIN) !== -1 || line.indexOf(MCP_END) !== -1) continue;
		if (/^- insert:\s*$/.test(line)) { inMine = true; continue; }
		if (inMine) {
			if (/^ {4}- id: /.test(line)) continue;
			if (/^ {4,}\S/.test(line)) continue;
			if (/^\s*$/.test(line)) continue;
			inMine = false;
		}
		if (/^\s*$/.test(line)) continue;
		keep.push(line);
	}
	return keep.length > 0 ? "\n" + keep.join("\n") + "\n" : "";
}

/** 只解我们自己写出去的 YAML 标量：双引号 JSON 字符串，或裸标量。 */
function parseYamlString(raw) {
	var text = String(raw ?? "").trim();
	if (text === "[]" || text === "{}") return text === "[]" ? [] : {};
	if (text.charAt(0) === String.fromCharCode(34)) {
		try { return JSON.parse(text); } catch (error) { /* 退化成裸值 */ }
	}
	if (text.charAt(0) === "'") return text.replace(/^'|'$/g, "");
	return text;
}

/** 双引号标量是否已闭合（末尾的 " 不是被转义的）。 */
function isClosedDouble(text) {
	if (text.length < 2 || text.charAt(text.length - 1) !== '"') return false;
	var backslashes = 0;
	for (var i = text.length - 2; i >= 0 && text.charAt(i) === "\\"; i--) backslashes++;
	return backslashes % 2 === 0;
}

/**
 * 接续行：官方写盘工具（settings 一改就整份重排）会把长标量折成
 *   key: "aaaa\
 *     bbbb"
 * 手工解析时只读第一行就会把值截断（实测踩过：8 个 key 变 2 个、还带引号和反斜杠）。
 * 这里按 YAML 折行规则把续行接回来：行尾 `\` = 直接拼（不带空格），否则折成一个空格。
 */
function joinYamlScalar(lines, index, raw) {
	var text = String(raw ?? "").trim();
	var consumed = 0;
	while (index + 1 < lines.length) {
		var isDouble = text.charAt(0) === '"';
		var isSingle = text.charAt(0) === "'";
		var closed = isDouble ? isClosedDouble(text) : (isSingle ? (text.length > 1 && text.charAt(text.length - 1) === "'" && text.charAt(text.length - 2) !== "'") : true);
		if (closed || (!isDouble && !isSingle)) break;
		var next = lines[index + 1].trim();
		index++;
		consumed++;
		if (text.charAt(text.length - 1) === "\\") text = text.slice(0, -1) + next;
		else text = text + " " + next;
	}
	return { text: text, consumed: consumed };
}

/** 从旧 patch 文本里取本插件管过的条目 id（只删自己写过的，别的不碰）。 */
function managedIdsInBlock(text) {
	var begin = text.indexOf(MCP_BEGIN);
	var end = text.indexOf(MCP_END);
	if (begin === -1 || end === -1 || end < begin) return [];
	var ids = [];
	var re = /^ {4}- id: (.+)$/gm;
	var block = text.slice(begin, end);
	var match;
	while ((match = re.exec(block)) !== null) ids.push(match[1].trim());
	return ids;
}

/** 读取 SKILL.md 的 name/description（frontmatter 或首行兜底）。 */
function describeSkill(text, fallbackName) {
	var name = fallbackName;
	var description = "";
	var head = text.slice(0, 800);
	var fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(head);
	if (fm !== null) {
		var nameLine = /^name:\s*(.+)$/m.exec(fm[1]);
		var descLine = /^description:\s*(.+)$/m.exec(fm[1]);
		if (nameLine !== null) name = nameLine[1].trim().replace(/^["']|["']$/g, "");
		if (descLine !== null) description = descLine[1].trim().replace(/^["']|["']$/g, "");
	}
	if (description.length === 0) {
		var body = fm === null ? head : head.slice(fm[0].length);
		var line = body.split(/\r?\n/).map(function (l) { return l.replace(/^#+\s*/, "").trim(); }).filter(function (l) { return l.length > 0; })[0];
		description = line === void 0 ? "" : line.slice(0, 120);
	}
	return { name: name, description: description };
}

var SkillMcpManagerService = class extends Service {
	static inject = [];
	constructor(ctx, config) {
		super(ctx, "skill-mcp-manager-service");
		this.config = config ?? {};
		this.mcpQueue = Promise.resolve();
		this.typertRemote = bindTypertRemote(this, "skill-mcp-manager-service", { namespace: "skillMcp" });
		registerRemote(ctx);
	}

	dshHome() {
		var configured = this.config.dshHome;
		if (typeof configured === "string" && configured.length > 0) return configured;
		return join(homedir(), ".dsh");
	}

	/** 工作区目录（来自工作区注册表，和客户端无关）。 */
	workspaceDirs() {
		var registry = this.ctx.get("workspaceRegistry");
		if (registry === void 0 || typeof registry.list !== "function") return [];
		var dirs = [];
		try {
			for (const entity of registry.list()) {
				var record = entity.record;
				if (record !== void 0 && typeof record.path === "string" && record.path.length > 0) dirs.push(record.path);
			}
		} catch (error) { /* 枚举失败就当没有 */ }
		return dirs;
	}

	/** 所有技能根（含存在与否、里面有几个技能）。 */
	roots(cwd) {
		var cwds = [];
		if (typeof cwd === "string" && cwd.length > 0) cwds.push(cwd);
		for (const dir of this.workspaceDirs()) cwds.push(dir);
		if (typeof this.config.workspaceDir === "string" && this.config.workspaceDir.length > 0) cwds.push(this.config.workspaceDir);
		return skillRoots(this.dshHome(), cwds).map(function (root) {
			var exists = false;
			var count = 0;
			try {
				exists = statSync(root.path).isDirectory();
				if (exists) count = readdirSync(root.path).length;
			} catch (error) { /* 不存在 */ }
			return { path: root.path, source: root.source, exists: exists, count: count };
		});
	}

	assertInsideRoot(target) {
		var absolute = resolve(target);
		var roots = this.roots(null);
		for (var i = 0; i < roots.length; i++) {
			var root = resolve(roots[i].path);
			if (absolute === root || absolute.startsWith(root.endsWith(sep) ? root : root + sep)) return absolute;
		}
		throw new Error("路径不在技能根内，拒绝操作: " + target);
	}

	/** 列出技能：目录式（含 SKILL.md）与单文件式都算。 */
	listSkills(cwd) {
		var roots = this.roots(cwd);
		var skills = [];
		var seen = {};
		for (var i = 0; i < roots.length; i++) {
			var root = roots[i];
			if (!root.exists) continue;
			var entries = [];
			try {
				entries = readdirSync(root.path, { withFileTypes: true });
			} catch (error) { continue; }
			for (var j = 0; j < entries.length; j++) {
				var entry = entries[j];
				if (entry.name.startsWith(".")) continue;
				var file = null;
				var kind = "dir";
				if (entry.isDirectory()) {
					var candidate = join(root.path, entry.name, "SKILL.md");
					if (!existsSync(candidate)) continue;
					file = candidate;
				} else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
					file = join(root.path, entry.name);
					kind = "file";
				} else continue;
				var absolute = resolve(file);
				if (seen[absolute] === true) continue;
				seen[absolute] = true;
				var text = "";
				try { text = readFileSync(absolute, "utf8"); } catch (error) { /* 读失败仍列出 */ }
				var meta = describeSkill(text, entry.name.replace(/\.md$/i, ""));
				skills.push({
					path: absolute,
					kind: kind,
					source: root.source,
					name: meta.name,
					description: meta.description,
					bytes: text.length
				});
			}
		}
		return { roots: roots, skills: skills };
	}

	readSkill(path) {
		var absolute = this.assertInsideRoot(path);
		return { path: absolute, content: readFileSync(absolute, "utf8") };
	}

	saveSkill(path, content) {
		var absolute = this.assertInsideRoot(path);
		if (typeof content !== "string") throw new TypeError("content must be a string");
		mkdirSync(dirname(absolute), { recursive: true });
		writeFileSync(absolute, content, "utf8");
		return { saved: true, path: absolute };
	}

	/** 在某个技能根下新建技能：目录式（默认，建 <root>/<name>/SKILL.md）。 */
	/** 上传技能：把一组文件写进技能根下的新目录（保持相对路径），SKILL.md 缺 frontmatter 自动补。 */
	uploadSkill(rootPath, name, entries) {
		var clean = String(name ?? "").trim().replace(/[\\/:*?"<>|]/g, "-");
		if (clean.length === 0) throw new Error("技能名不能为空");
		var root = this.assertInsideRoot(rootPath);
		var dir = join(root, clean);
		if (existsSync(dir)) throw new Error("同名技能已存在: " + clean);
		var plan = normalizeUploadEntries(dir, entries);
		var used = plan.files;
		if (used.length === 0) throw new Error("选中的文件不在同一层，换个目录再试");
		if (used.filter(function (file) { return file.relative.toLowerCase() === "skill.md"; }).length === 0) {
			throw new Error("没找到 SKILL.md（技能必须是含 SKILL.md 的目录，或单个 .md 文件）");
		}
		var written = 0;
		var addedFrontmatter = false;
		mkdirSync(dir, { recursive: true });
		for (const file of used) {
			mkdirSync(dirname(file.target), { recursive: true });
			if (file.base64 !== null) {
				writeFileSync(file.target, Buffer.from(file.base64, "base64"));
			} else {
				var body = file.text ?? "";
				if (file.relative.toLowerCase() === "skill.md") {
					var filled = withFrontmatter(body, clean);
					body = filled.text;
					addedFrontmatter = filled.added;
				}
				writeFileSync(file.target, body, "utf8");
			}
			written += 1;
		}
		return { created: true, path: join(dir, "SKILL.md"), files: written, addedFrontmatter: addedFrontmatter };
	}

	createSkill(rootPath, name, content) {
		var clean = String(name ?? "").trim().replace(/[\\/:*?"<>|]/g, "-");
		if (clean.length === 0) throw new Error("技能名不能为空");
		var root = this.assertInsideRoot(rootPath);
		var dir = join(root, clean);
		var file = join(dir, "SKILL.md");
		if (existsSync(dir) || existsSync(file)) throw new Error("同名技能已存在: " + clean);
		mkdirSync(dir, { recursive: true });
		var body = typeof content === "string" && content.length > 0
			? content
			: "---\nname: " + clean + "\ndescription: \n---\n\n# " + clean + "\n\n";
		writeFileSync(file, body, "utf8");
		return { created: true, path: file };
	}

	deleteSkill(path) {
		var absolute = this.assertInsideRoot(path);
		var stats = statSync(absolute);
		if (stats.isDirectory()) {
			rmSync(absolute, { recursive: true, force: true });
			return { deleted: true };
		}
		rmSync(absolute, { force: true });
		var parent = dirname(absolute);
		var parentIsRoot = this.roots(null).some(function (root) { return resolve(root.path) === resolve(parent); });
		// 目录式技能（…/名字/SKILL.md）：连附件一起删；单文件技能才只删那一个文件
		if (!parentIsRoot && basename(absolute).toLowerCase() === "skill.md") {
			rmSync(parent, { recursive: true, force: true });
			return { deleted: true };
		}
		try {
			if (readdirSync(parent).length === 0) rmSync(parent, { recursive: true, force: true });
		} catch (error) { /* 非空或不可删，忽略 */ }
		return { deleted: true };
	}

	/** loader 里的 MCP 条目（实时状态）。 */
	mcpEntries() {
		var loader = this.ctx.get("loader");
		if (loader === void 0 || typeof loader.entries !== "function") return [];
		var list = [];
		try {
			for (const entry of loader.entries()) {
				var options = entry.options ?? {};
				if (String(options.name ?? "").indexOf("dsh-mcp-client") === -1) continue;
				var config = options.config ?? {};
				list.push({
					id: String(options.id ?? ""),
					serverName: String(config.serverName ?? ""),
					transport: String(config.transport ?? ""),
					command: config.command === void 0 ? "" : String(config.command),
					args: Array.isArray(config.args) ? config.args.map(String) : [],
					env: config.env !== void 0 && typeof config.env === "object" ? config.env : {},
					url: config.url === void 0 ? "" : String(config.url),
					headers: config.headers !== void 0 && typeof config.headers === "object" ? config.headers : {},
					cwd: config.cwd === void 0 ? "" : String(config.cwd),
					toolCallTimeoutMs: typeof config.toolCallTimeoutMs === "number" ? config.toolCallTimeoutMs : 0,
					state: entry.fiber !== void 0 && entry.fiber.state === 2 ? "active" : "inactive"
				});
			}
		} catch (error) { /* loader 不可读时返回已收集的 */ }
		return list;
	}

	listMcp() {
		var patchFile = join(this.profileDir(), "cordis.patch.yml");
		// 配置内容以文件为准：运行时条目要等官方 HMR 落地才更新，刚保存完就读运行时会
		// 看到「刚写进去的内容又没了」（用户实测：必须手动刷新才出来）。状态（active/
		// inactive）只有运行时知道，所以叠一层上去；文件读不出来/格式不认识就退回运行时。
		var runtime = [];
		try { runtime = this.mcpEntries(); } catch (error) { runtime = []; }
		var stateByName = {};
		for (const item of runtime) stateByName[item.serverName] = item.state;
		var servers = null;
		try {
			servers = this.configServers().map(function (entry) {
				return Object.assign({}, entry, { state: stateByName[entry.serverName] ?? "inactive" });
			});
		} catch (error) { servers = null; }
		return { servers: servers === null ? runtime : servers, profileDir: this.profileDir(), patchFile: patchFile };
	}

	/** 探活：真连一次（stdio 拉进程握手 / http 走 POST），返回 ok / 工具数 / 失败原因。不落盘。 */
	async testMcp(server) {
		var entry = server ?? {};
		return entry.transport === "streamable-http" ? probeHttp(entry) : probeStdio(entry);
	}

	/** profile 目录：从 loader 的根 include 配置（file:///<profile>/cordis.yml）推。 */
	profileDir() {
		var loader = this.ctx.get("loader");
		if (loader !== void 0 && typeof loader.entries === "function") {
			try {
				for (const entry of loader.entries()) {
					var config = (entry.options ?? {}).config ?? {};
					var candidate = config.path;
					if (typeof candidate !== "string" || candidate.indexOf("file:") !== 0) continue;
					if (!candidate.endsWith("cordis.yml")) continue;
					return dirname(fileURLToPath(candidate));
				}
			} catch (error) { /* 退回配置 */ }
		}
		var fallback = this.config.profileDir;
		if (typeof fallback === "string" && fallback.length > 0) return fallback;
		return join(this.dshHome(), "profiles", "desktop");
	}

	/** 读 patch 标记块里的配置列表（权威来源是文件；loader 运行时可能为空/未加载）。 */
	configServers() {
		var patchFile = join(this.profileDir(), "cordis.patch.yml");
		var text = "";
		try { text = readFileSync(patchFile, "utf8"); } catch (error) { text = ""; }
		var entries = parseMcpBlock(text);
		// 防呆：块里明显有内容却一条都没解析出来 = 格式没看懂 → 宁可拒绝，也别拿空列表去覆盖
		var begin = text.indexOf(MCP_BEGIN);
		var end = text.indexOf(MCP_END);
		var body = begin !== -1 && end > begin ? text.slice(begin + MCP_BEGIN.length, end) : "";
		if (/[^\s#]/.test(body) && entries.length === 0) {
			throw new Error("MCP 配置块解析失败（格式不认识），为防误删已中止；请检查 " + patchFile);
		}
		return entries;
	}

	/** 加/改一台服务器（按 id 或 serverName 覆盖同名）。 */
	async upsertMcpServer(server) {
		var entry = normalizeMcpServers([server])[0];
		var list = this.configServers().filter(function (item) { return item.id !== entry.id && item.serverName !== entry.serverName; });
		list.push(entry);
		return await this.writeMcp(list);
	}

	/** 删一台服务器（按 serverName）。 */
	async removeMcpServer(serverName) {
		var name = String(serverName ?? "").trim();
		if (name.length === 0) throw new Error("serverName 不能为空");
		var list = this.configServers().filter(function (item) { return item.serverName !== name; });
		return await this.writeMcp(list);
	}

	/** 批量导入（按 serverName 覆盖同名，其余保留）。 */
	async importMcpServers(entries) {
		var incoming = normalizeMcpServers(entries);
		var list = this.configServers();
		for (const entry of incoming) {
			list = list.filter(function (item) { return item.serverName !== entry.serverName && item.id !== entry.id; });
			list.push(entry);
		}
		return await this.writeMcp(list);
	}

	/** 串行化：并发的写请求排队，避免两次写互相覆盖（上一次写没落完就写下一次）。 */
	saveMcp(servers) {
		var self = this;
		var run = (this.mcpQueue ?? Promise.resolve()).catch(function () { /* 上一次失败不拦住下一次 */ }).then(function () { return self.writeMcp(servers); });
		this.mcpQueue = run.catch(function () { /* 队列只负责顺序 */ });
		return run;
	}
/** 把 servers 写成 profile patch 的标记块（其它内容原样保留），再核实运行时热加载结果。 */
	async writeMcp(servers) {
		var entries = normalizeMcpServers(servers);
		var lines = renderMcpBlock(entries);

		var patchFile = join(this.profileDir(), "cordis.patch.yml");
		var text = "";
		try { text = readFileSync(patchFile, "utf8"); } catch (error) { text = ""; }
		var previousIds = managedIdsInBlock(text);
		var begin = text.indexOf(MCP_BEGIN);
		var end = text.indexOf(MCP_END);
		var block = lines.join("\n");
		var next;
		if (begin !== -1 && end !== -1 && end > begin) {
			var foreign = foreignInBlock(text.slice(begin, end));
			next = text.slice(0, begin) + block + foreign + text.slice(end + MCP_END.length);
		} else {
			if (/dsh-mcp-client|^ {4}- id: mcp-/m.test(text)) {
				throw new Error("patch 文件里有 MCP 条目但找不到本插件标记块，为防重复/误删已中止；请检查 " + patchFile);
			}
			var trimmed = text.replace(/\s*$/, "");
			next = (trimmed.length > 0 ? trimmed + "\n\n" : "") + block + "\n";
		}
		mkdirSync(dirname(patchFile), { recursive: true });
		writeFileSync(patchFile, next, "utf8");

		// 不在这里等热加载：官方 HMR 的删条目会等 MCP 子进程退出（官方超时 5s），
		// 加条目要等握手完成 —— 卡在 RPC 里就是用户干等。状态由前端后台追。
		return { saved: true, patchFile: patchFile, restartRequired: false, managed: entries.map(function (item) { return item.id; }), removed: previousIds };
	}
};

function apply(ctx, config) {
	new SkillMcpManagerService(ctx, config);
}

export { SkillMcpManagerService };
export default { apply };
