// 上传技能的路径/格式自检：从 index.js 抽出 normalizeUploadEntries / withFrontmatter 跑用例。
// 跑法：node test-upload-skill.mjs
import { readFileSync } from "node:fs";
import { resolve, sep, join } from "node:path";

const src = readFileSync(new URL("./index.js", import.meta.url), "utf8");
const start = src.indexOf("function normalizeUploadEntries");
const end = src.indexOf("/** 读取 SKILL.md 的 name/description");
if (start === -1 || end === -1) throw new Error("index.js 结构变了，抽不出来");
const { normalizeUploadEntries, withFrontmatter } = new Function(
  "resolve", "sep",
  src.slice(start, end) + "\nreturn { normalizeUploadEntries, withFrontmatter };"
)(resolve, sep);

let passed = 0;
const ok = (name, cond, extra) => {
  if (!cond) throw new Error("FAIL: " + name + (extra !== void 0 ? " → " + JSON.stringify(extra) : ""));
  passed++;
};
const throws = (name, fn, needle) => {
  try { fn(); } catch (e) { ok(name + "（错误信息含 " + needle + "）", e.message.includes(needle)); return; }
  throw new Error("FAIL: " + name + " 应该报错但没报");
};

const dir = join("C:", "tmp-root", "my-skill");

// 1) 普通文件夹
const flat = normalizeUploadEntries(dir, [
  { path: "SKILL.md", text: "# hi" },
  { path: "assets/a.png", base64: "AAAA" }
]);
ok("普通文件夹：无前缀", flat.prefix === "");
ok("普通文件夹：两个文件", flat.files.length === 2);
ok("普通文件夹：落盘路径在目标内", flat.files.every((f) => f.target.startsWith(dir + sep)));
ok("二进制走 base64", flat.files[1].base64 === "AAAA" && flat.files[1].text === null);

// 2) 外面套了一层目录
const wrapped = normalizeUploadEntries(dir, [
  { path: "my-skill/SKILL.md", text: "# hi" },
  { path: "my-skill/sub/a.md", text: "x" },
  { path: "README.md", text: "外层说明" }
]);
ok("嵌套一层：识别前缀", wrapped.prefix === "my-skill/");
ok("嵌套一层：外层文件被丢掉", wrapped.files.length === 2 && wrapped.files.every((f) => f.relative.indexOf("my-skill/") !== 0));
ok("嵌套一层：相对路径已剥前缀", wrapped.files.map((f) => f.relative).join(",") === "SKILL.md,sub/a.md");
ok("嵌套一层：写盘路径在目标根下", wrapped.files.every((f) => f.target.startsWith(dir + sep)));

// 3) 反斜杠路径归一化
const win = normalizeUploadEntries(dir, [{ path: "my-skill\\SKILL.md", text: "" }]);
ok("反斜杠归一化并识别前缀", win.prefix === "my-skill/" && win.files[0].relative === "SKILL.md");

// 4) 越界与空路径
throws(".. 越界被拒", () => normalizeUploadEntries(dir, [{ path: "../evil.md", text: "" }]), "非法路径");
throws("空条目被拒", () => normalizeUploadEntries(dir, []), "没有可写入的文件");
throws("空路径被拒", () => normalizeUploadEntries(dir, [{ path: "   ", text: "" }]), "路径是空的");
throws("路径里空段被拒", () => normalizeUploadEntries(dir, [{ path: "a//b.md", text: "" }]), "非法路径");
ok("绝对路径被当相对处理（落在根内）", normalizeUploadEntries(dir, [{ path: "/x/SKILL.md", text: "" }]).files[0].relative === "SKILL.md");

// 5) 单个 .md 自动补成 SKILL.md
const single = normalizeUploadEntries(dir, [{ path: "cool-skill.md", text: "# x" }]);
ok("单文件：改名为 SKILL.md", single.files[0].relative === "SKILL.md" && single.prefix === "");
ok("单文件：target 跟着改", single.files[0].target.endsWith("SKILL.md"));
const inFolder = normalizeUploadEntries(dir, [
  { path: "pack/thing.md", text: "# x" },
  { path: "pack/assets/a.png", base64: "AA" }
]);
ok("整包同一顶层目录：把它当技能根", inFolder.prefix === "pack/");
ok("整包里的唯一 md 补成 SKILL.md", inFolder.files[0].relative === "SKILL.md" && inFolder.files[0].target === resolve(dir, "SKILL.md"));
const twoMd = normalizeUploadEntries(dir, [{ path: "a.md", text: "" }, { path: "b.md", text: "" }]);
ok("两个 md 不动（保持原样，交给上层报错）", twoMd.files[0].relative === "a.md");
const nestedMd = normalizeUploadEntries(dir, [{ path: "x/a.md", text: "" }, { path: "y/b.md", text: "" }]);
ok("多个顶层目录不误判", nestedMd.prefix === "" && nestedMd.files[0].relative === "x/a.md");

// 6) frontmatter
const filled = withFrontmatter("# 我的技能\n\n做点什么", "my-skill");
ok("缺 frontmatter 会补", filled.added === true && filled.text.startsWith("---\nname: my-skill\n"));
ok("description 取首行", /description: "我的技能"/.test(filled.text), filled.text.split("\n")[2]);
const kept = withFrontmatter("---\nname: x\ndescription: y\n---\n\nbody", "my-skill");
ok("已有 frontmatter 不动", kept.added === false && kept.text.startsWith("---\nname: x"));
const bom = withFrontmatter("\uFEFF---\r\nname: x\r\n---\r\nbody", "my-skill");
ok("带 BOM 的 frontmatter 也认", bom.added === false);
const noLine = withFrontmatter("   \n\n  ", "empty-skill");
ok("空内容也能给出合法 frontmatter", noLine.added === true && noLine.text.includes('description: ""'));

console.log("test-upload-skill: " + passed + " 项通过");
