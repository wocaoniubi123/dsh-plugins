// MCP 配置块的归一化/渲染/解析自检（写盘和运行时用同一份数据，必须一致）。
// 跑法：node test-mcp-block.mjs
import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { resolve, sep, dirname, join } from "node:path";

const src = readFileSync(new URL("./index.js", import.meta.url), "utf8");
const start = src.indexOf("var MCP_PLUGIN");
const end = src.indexOf("\nvar INVOCATIONS");
const helpersStart = src.indexOf("function normalizeMcpServers");
const helpersEnd = src.indexOf("/** 读取 SKILL.md");
if (start === -1 || end === -1 || helpersStart === -1 || helpersEnd === -1) throw new Error("index.js 结构变了，抽不出来");
const api = new Function(
  "spawn", "httpRequest", "httpsRequest", "existsSync", "process", "resolve", "sep", "dirname", "join",
  src.slice(start, end) + "\n" + src.slice(helpersStart, helpersEnd) + "\nreturn { normalizeMcpServers, renderMcpBlock, managedIdsInBlock, parseMcpBlock };"
)(spawn, httpRequest, httpsRequest, existsSync, process, resolve, sep, dirname, join);

let passed = 0;
const ok = (name, cond, extra) => {
  if (!cond) throw new Error("FAIL: " + name + (extra !== void 0 ? " → " + JSON.stringify(extra) : ""));
  passed++;
};
const throws = (name, fn, needle) => {
  try { fn(); } catch (e) { ok(name + "（含 " + needle + "）", e.message.includes(needle)); return; }
  throw new Error("FAIL: " + name + " 应该报错但没报");
};

const entries = api.normalizeMcpServers([
  { serverName: "web-search", transport: "stdio", command: "C:\\Program Files\\nodejs\\node.exe", args: ["x.mjs"], env: { TOKEN: "abc" }, toolCallTimeoutMs: 120000 },
  { serverName: "api", transport: "streamable-http", url: "https://x/mcp", headers: { Authorization: "Bearer t" } }
]);
ok("归一化出两条", entries.length === 2);
ok("id 默认 mcp-<名字>", entries[0].id === "mcp-web-search" && entries[1].id === "mcp-api");
ok("超时取整且只留正数", entries[0].toolCallTimeoutMs === 120000 && api.normalizeMcpServers([{ serverName: "a", toolCallTimeoutMs: -5 }])[0].toolCallTimeoutMs === 0);
throws("非法 serverName 被拒", () => api.normalizeMcpServers([{ serverName: "bad name" }]), "serverName");

const block = api.renderMcpBlock(entries).join("\n");
ok("块有头尾标记", block.startsWith("# >>> dsh-skill-mcp-manager:mcp:begin") && block.endsWith("# <<< dsh-skill-mcp-manager:mcp:end"));
ok("stdio 写了 command/args/env", block.includes('command: "C:\\\\Program Files\\\\nodejs\\\\node.exe"') && block.includes('          - "x.mjs"') && block.includes('TOKEN: "abc"'));
ok("http 写了 url/headers", block.includes('url: "https://x/mcp"') && block.includes('Authorization: "Bearer t"'));
ok("超时写进去了", block.includes("toolCallTimeoutMs: 120000"));
ok("没有多带空字段", !block.includes("cwd:"));

// 写盘文本 → 解析回来的 id 必须一致（删条目靠这个，不能多删）
const patch = "some: config\n# >>> dsh-skill-mcp-manager:mcp:begin\n" + api.renderMcpBlock(entries).slice(1).join("\n") + "\n# <<< dsh-skill-mcp-manager:mcp:end\n";
const ids = api.managedIdsInBlock(patch);
ok("解析出的 id 与写的一致", ids.join(",") === "mcp-web-search,mcp-api", ids);
ok("旁边的配置不受影响（解析只看标记块）", api.managedIdsInBlock("    - id: 别人的条目\n").length === 0);

ok("空清单也能渲染成空块", api.renderMcpBlock([]).length === 2);


// 6) 块文本 → 解析回条目（删条目靠这个，往返必须一致）
const BEGIN = "# >>> dsh-skill-mcp-manager:mcp:begin";
const END = "# <<< dsh-skill-mcp-manager:mcp:end";
const roundTrip = api.parseMcpBlock([BEGIN].concat(api.renderMcpBlock(entries).slice(1)).concat([END]).join("\n"));
ok("往返解析条数一致", roundTrip.length === entries.length, roundTrip);
ok("往返解析内容一致", JSON.stringify(roundTrip) === JSON.stringify(entries), { got: roundTrip[0], want: entries[0] });
ok("空块解析成空数组", api.parseMcpBlock(BEGIN + "\n" + END).length === 0);
ok("没有标记块也安全", api.parseMcpBlock("别的: 配置").length === 0);

console.log("test-mcp-block: " + passed + " 项通过");
