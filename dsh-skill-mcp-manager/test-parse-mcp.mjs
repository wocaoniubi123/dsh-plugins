// parseMcpJson 自检：直接从 client.js 抽出函数源码执行（不引框架）。
// 跑法：node test-parse-mcp.mjs
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./client.js", import.meta.url), "utf8");
const start = src.indexOf("function parseMcpJson(text) {");
if (start === -1) throw new Error("parseMcpJson 没找到（函数被改名了？）");
const end = src.indexOf("\n  }\n", start);
if (end === -1) throw new Error("parseMcpJson 结束位置没找到");
const fn = new Function(src.slice(start, end + 4) + "\nreturn parseMcpJson;")();

let passed = 0;
const ok = (name, cond) => { if (!cond) throw new Error("FAIL: " + name); passed++; };
const throws = (name, text, needle) => {
  try { fn(text); } catch (e) { ok(name + " (错误信息含 " + needle + ")", e.message.includes(needle)); return; }
  throw new Error("FAIL: " + name + " 应该报错但没报");
};

const claude = fn(JSON.stringify({ mcpServers: { "web-search": { command: "npx", args: ["-y", "@x/mcp"] } } }));
ok("Claude 包裹格式 → 1 个", claude.length === 1);
ok("名字取自 key", claude[0].serverName === "web-search");
ok("有 command → stdio", claude[0].transport === "stdio" && claude[0].command === "npx" && claude[0].args.length === 2);

const http = fn(JSON.stringify({ mcpServers: { api: { url: "https://x/mcp", headers: { Authorization: "Bearer t" } } } }));
ok("有 url → streamable-http", http[0].transport === "streamable-http" && http[0].url === "https://x/mcp");
ok("headers 保留", http[0].headers.Authorization === "Bearer t");

const map = fn(JSON.stringify({ a: { command: "node" }, b: { url: "https://y/mcp" } }));
ok("裸名称映射 → 2 个", map.length === 2 && map[0].serverName === "a" && map[1].transport === "streamable-http");

const arr = fn(JSON.stringify([{ command: "node" }, { command: "deno" }]));
ok("数组 → 2 个 + 兜底名", arr.length === 2 && arr[0].serverName === "mcp-1" && arr[1].serverName === "mcp-2");

const solo = fn(JSON.stringify({ serverName: "solo", command: "node", type: "sse", url: "https://z/mcp" }));
ok("单对象 + type:sse → http", solo.length === 1 && solo[0].serverName === "solo" && solo[0].transport === "streamable-http");

const env = fn(JSON.stringify({ e: { command: "node", env: { TOKEN: "abc" } } }));
ok("env 原样带入", env[0].env.TOKEN === "abc");

throws("空串报错", "   ", "empty JSON");
throws("空 mcpServers 报错", JSON.stringify({ mcpServers: {} }), "no server config");
throws("非法字符 serverName 报错", JSON.stringify({ "bad name!": { command: "node" } }), "serverName");
throws("stdio 缺 command 报错", JSON.stringify({ s: { transport: "stdio" } }), "command");
throws("http 缺 url 报错", JSON.stringify({ s: { transport: "streamable-http" } }), "url");
throws("非法 JSON 报错", "{not json", "JSON");

console.log("test-parse-mcp: " + passed + " 项通过");
