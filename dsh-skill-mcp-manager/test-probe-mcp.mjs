// MCP 探活自检：从 index.js 抽出 probeStdio / probeHttp 真跑一遍（本地假服务器，不联网）。
// 跑法：node test-probe-mcp.mjs
import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { request as httpRequest, createServer } from "node:http";
import { request as httpsRequest } from "node:https";

const src = readFileSync(new URL("./index.js", import.meta.url), "utf8");
const start = src.indexOf("var PROBE_TIMEOUT_MS");
const end = src.indexOf("\nvar INVOCATIONS");
if (start === -1 || end === -1) throw new Error("index.js 结构变了，探活函数抽不出来");
// 测试里把超时压到 1.5s，免得超时用例跑 20s
const body = src.slice(start, end).replace("var PROBE_TIMEOUT_MS = 20000;", "var PROBE_TIMEOUT_MS = 1500;");
const { probeStdio, probeHttp } = new Function(
  "spawn", "httpRequest", "httpsRequest", "existsSync", "process",
  body + "\nreturn { probeStdio, probeHttp };"
)(spawn, httpRequest, httpsRequest, existsSync, process);

let passed = 0;
const ok = (name, cond, extra) => {
  if (!cond) throw new Error("FAIL: " + name + (extra !== void 0 ? " → " + JSON.stringify(extra) : ""));
  passed++;
};

// ── 假 stdio MCP 服务器（可注入行为）──
const fakeServer = (mode) => `
let buf = "";
const out = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
if (${JSON.stringify(mode)} === "noise") process.stdout.write("这是启动横幅，不是 JSON\\n");
process.stdin.on("data", (c) => {
  buf += c;
  let at;
  while ((at = buf.indexOf("\\n")) !== -1) {
    const line = buf.slice(0, at).trim();
    buf = buf.slice(at + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.method === "initialize") {
      if (${JSON.stringify(mode)} === "silent") continue;
      out({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "fake", version: "1" } } });
    }
    if (msg.method === "tools/list") {
      if (${JSON.stringify(mode)} === "listfail") { out({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: "boom" } }); continue; }
      out({ jsonrpc: "2.0", id: msg.id, result: { tools: [{ name: "a" }, { name: "b" }, { name: "c" }] } });
    }
  }
});
`;
const stdioEntry = (mode) => ({ transport: "stdio", serverName: "fake", command: process.execPath, args: ["-e", fakeServer(mode)] });

const good = await probeStdio(stdioEntry("ok"));
ok("stdio 正常握手", good.ok === true && good.tools === 3, good);
ok("stdio 返回工具名", Array.isArray(good.toolNames) && good.toolNames.join("") === "abc", good.toolNames);

const noise = await probeStdio(stdioEntry("noise"));
ok("stdout 有横幅也能握手", noise.ok === true && noise.tools === 3, noise);

const listfail = await probeStdio(stdioEntry("listfail"));
ok("tools/list 报错被捕获", listfail.ok === false && /tools\/list 失败/.test(listfail.error) && /boom/.test(listfail.error), listfail);

const missing = await probeStdio({ transport: "stdio", serverName: "nope", command: "C:\\definitely-not-here\\nope.exe", args: [] });
ok("命令不存在 → 报错而不是崩", missing.ok === false && /启动失败|进程退出/.test(missing.error), missing);

const silent = await probeStdio(stdioEntry("silent"));
ok("不响应 → 超时", silent.ok === false && /超时/.test(silent.error), silent);

const noCommand = await probeStdio({ transport: "stdio", serverName: "x", command: "", args: [] });
ok("空 command → 报错", noCommand.ok === false && /没有 command/.test(noCommand.error), noCommand);

// ── 假 streamable-http MCP 服务器 ──
const seen = [];
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const msg = JSON.parse(body);
    seen.push({ method: msg.method, session: req.headers["mcp-session-id"] ?? null, accept: req.headers["accept"], auth: req.headers["authorization"] ?? null });
    if (msg.method === "initialize") {
      res.writeHead(200, { "content-type": "application/json", "mcp-session-id": "sess-42" });
      if (req.url === "/sse") {
        res.write("event: message\ndata: " + JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2025-06-18" } }) + "\n\n");
      } else {
        res.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2025-06-18" } }));
      }
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { tools: [{ name: "t1" }, { name: "t2" }] } }));
    res.end();
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const httpOk = await probeHttp({ transport: "streamable-http", serverName: "http", url: `http://127.0.0.1:${port}/mcp`, headers: { Authorization: "Bearer TOK" } });
ok("http 正常握手", httpOk.ok === true && httpOk.tools === 2, httpOk);
ok("http 带上了 headers", seen[0].auth === "Bearer TOK", seen[0]);
ok("http 第二次请求带 session id", seen[1].session === "sess-42", seen[1]);

const sse = await probeHttp({ transport: "streamable-http", serverName: "sse", url: `http://127.0.0.1:${port}/sse` });
ok("SSE 帧也能解析", sse.ok === true && sse.tools === 2, sse);

const badUrl = await probeHttp({ transport: "streamable-http", serverName: "bad", url: "不是URL" });
ok("非法 URL → 报错", badUrl.ok === false && /URL 不合法/.test(badUrl.error), badUrl);

const dead = await probeHttp({ transport: "streamable-http", serverName: "dead", url: "http://127.0.0.1:1/mcp" });
ok("连不上 → 报错", dead.ok === false && dead.error.length > 0, dead);

server.close();
console.log("test-probe-mcp: " + passed + " 项通过");
