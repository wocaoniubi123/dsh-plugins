// 视觉判定自检：从 index.js 抽出 visionCandidates / supportsVision 跑用例（含真实名单）。
// 跑法：node test-vision-match.mjs
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "index.js"), "utf8");
const start = src.indexOf("var visionList = null;");
const end = src.indexOf("// 模型显示名缓存");
if (start === -1 || end === -1) throw new Error("index.js 结构变了，抽不出来");
const api = new Function(
  "readFileSync", "VISION_LIST_FILE",
  src.slice(start, end) + "\nreturn { loadVisionList: loadVisionList, visionCandidates: visionCandidates, supportsVision: supportsVision };"
)(readFileSync, join(dir, "vision-models.json"));

let passed = 0;
const ok = (name, cond, extra) => {
  if (!cond) throw new Error("FAIL: " + name + (extra !== void 0 ? " → " + JSON.stringify(extra) : ""));
  passed++;
};

// B：带前缀 id（用户这个就是 cn: 前缀）
ok("cn: 前缀靠末段命中", api.supportsVision("cn:deepseek-v4.1-flash") === "deepseek-v4.1-flash");
ok("多级前缀（a/b:xxx）也命中", api.supportsVision("workbuddy/cn:deepseek-v4.1-flash") === "deepseek-v4.1-flash");
ok("原样 id 仍命中", api.supportsVision("deepseek-v4.1-flash") === "deepseek-v4.1-flash");
ok("名单里的带斜杠写法", api.supportsVision("deepseek/deepseek-v4.1-flash") === "deepseek/deepseek-v4.1-flash");

// A：靠显示名称命中
ok("id 不在名单，显示名在 → 命中", api.supportsVision("cn:some-custom-id", "Deepseek-V4.1-Flash") === "deepseek-v4.1-flash");
ok("显示名前后空格也认", api.supportsVision("x", "  Deepseek-V4.1-Flash ") === "deepseek-v4.1-flash");
ok("显示名带空格 → 换连字符再试", (function () { var hit = api.supportsVision("x", "DeepSeek V4.1 Flash"); return hit === "deepseek-v4.1-flash" || hit === "deepseek v4.1 flash"; })());

// 不误判
ok("纯文本模型（id+名字都不在名单）不命中", api.supportsVision("some-text-llm", "Some Text LLM") === null);
ok("自定义 id + 中文显示名 不命中", api.supportsVision("cn:my-own-model", "我的助手") === null);
// 已知边界：剥前缀后的段正好撞上名单里的通用词（名单里真有一条叫 custom）
ok("已知碰撞：cn:custom 会命中名单里的 custom", api.supportsVision("cn:custom", "我的助手") === "custom");
ok("空值安全", api.supportsVision("", "") === null && api.supportsVision(null, null) === null && api.supportsVision(void 0, void 0) === null);

// 候选项生成
const cands = api.visionCandidates("CN:DeepSeek-V4.1-Flash", "Deepseek-V4.1-Flash");
ok("候选含原 id 小写", cands.includes("cn:deepseek-v4.1-flash"), cands);
ok("候选含剥前缀后", cands.includes("deepseek-v4.1-flash"), cands);
ok("候选去重", cands.filter((c) => c === "deepseek-v4.1-flash").length === 1, cands);

// 名单本身还在
ok("名单可加载且有内容", Object.keys(api.loadVisionList()).length > 100);

console.log("test-vision-match: " + passed + " 项通过");
