import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const coreSections = {
  "AGENTS.md": ["项目事实与导航", "工作流程与约束"],
  "README.md": ["adui-three 项目初始化"],
  "docs/REQUIREMENTS.md": ["正式需求", "待决策", "变更记录与维护"],
  "docs/ARCHITECTURE.md": ["当前架构", "目标与建议边界", "风险与维护"],
  "docs/SDD.md": ["当前实现", "建议设计（待决策）", "需求追踪", "维护"],
  "docs/PROJECT_CONTEXT.md": ["目标与当前阶段", "验证状态", "维护"],
  "docs/CODEBASE_MAP.md": ["已存在文件", "规划目录（尚不存在）", "维护"],
  "docs/SKILLS.md": ["当前状态", "发现与创建原则", "维护"],
  "docs/HARNESS.md": ["环境与安装", "命令", "验证记录", "维护"],
  "docs/LEGACY_REVIEW.md": ["来源与范围", "具体发现", "维护"],
};

function markdownFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.isFile() && entry.name.endsWith(".md") ? [path] : [];
  });
}

function prose(source) {
  return source.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\s*$/gm, "");
}

function headings(source) {
  return [...prose(source).matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)].map((match) => match[1]);
}

function anchors(source) {
  const counts = new Map();
  return headings(source).map((heading) => {
    const slug = heading
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_\-\s]/gu, "")
      .replace(/\s/g, "-");
    const count = counts.get(slug) ?? 0;
    counts.set(slug, count + 1);
    return count ? `${slug}-${count}` : slug;
  });
}

export function validateDocs(root = repositoryRoot) {
  const errors = [];
  const report = (file, message) =>
    errors.push(`${relative(root, file).replaceAll("\\", "/")}: ${message}`);
  const read = (path) => (existsSync(path) ? readFileSync(path, "utf8") : "");
  for (const [name, sections] of Object.entries(coreSections)) {
    const file = join(root, name);
    const content = read(file);
    if (!content.trim()) report(file, "missing or empty core document");
    for (const section of sections) {
      if (!headings(content).includes(section)) report(file, `missing section: ${section}`);
    }
  }

  const files = [
    join(root, "README.md"),
    join(root, "AGENTS.md"),
    ...markdownFiles(join(root, "docs")),
    ...markdownFiles(join(root, ".agents", "skills")),
  ];
  const packageFile = join(root, "package.json");
  const scripts = JSON.parse(read(packageFile) || "{}").scripts ?? {};
  for (const file of files) {
    const content = prose(read(file));
    for (const match of content.matchAll(/\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
      const target = match[1].trim().replace(/^<|>$/g, "");
      if (/^(?:https?:|mailto:)/i.test(target)) continue;
      if (/^(?:[a-z][a-z\d+.-]*:|[/\\])/i.test(target)) {
        report(file, `use a repository-relative link: ${target}`);
        continue;
      }
      const [rawPath, rawAnchor] = target.split("#");
      let targetFile;
      let anchor;
      try {
        targetFile = rawPath ? resolve(dirname(file), decodeURIComponent(rawPath)) : file;
        anchor = rawAnchor ? decodeURIComponent(rawAnchor) : "";
      } catch {
        report(file, `malformed link: ${target}`);
        continue;
      }
      if (!existsSync(targetFile)) report(file, `broken link: ${target}`);
      else if (
        anchor &&
        targetFile.endsWith(".md") &&
        statSync(targetFile).isFile() &&
        !anchors(read(targetFile)).includes(anchor)
      ) {
        report(file, `broken anchor: ${target}`);
      }
    }
    for (const match of content.matchAll(/\bpnpm run ([\w:-]+)/g)) {
      if (!(match[1] in scripts)) report(file, `unknown root script: ${match[1]}`);
    }
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content))
      report(file, "possible private key");
  }

  const requirementsFile = join(root, "docs/REQUIREMENTS.md");
  const requirements = prose(read(requirementsFile));
  const ids = new Set();
  const trace = read(join(root, "docs/SDD.md")).split("## 需求追踪")[1]?.split(/^## /m)[0] ?? "";
  for (const match of requirements.matchAll(
    /^### ((?:FR|NFR)-\d{3})[^\n]*\n([\s\S]*?)(?=^#{1,3} |$(?![\s\S]))/gm,
  )) {
    const [, id, body] = match;
    if (ids.has(id)) report(requirementsFile, `duplicate requirement: ${id}`);
    ids.add(id);
    if (!/^- 状态：(已确认|已实现|已验证|待决策|已取消)\s*$/m.test(body))
      report(requirementsFile, `invalid status: ${id}`);
    for (const field of ["优先级", "目标", "说明", "验收"]) {
      if (!new RegExp(`^- ${field}：\\S.+$`, "m").test(body))
        report(requirementsFile, `missing ${field}: ${id}`);
    }
    if (!new RegExp(`^\\|[ \\t]*${id}[ \\t]*\\|`, "m").test(trace))
      report(requirementsFile, `missing SDD trace: ${id}`);
  }
  if (!ids.size) report(requirementsFile, "no requirement definitions");
  for (const match of trace.matchAll(/^\|[ \t]*((?:FR|NFR)-\d{3})[ \t]*\|/gm)) {
    if (!ids.has(match[1])) report(join(root, "docs/SDD.md"), `undefined requirement: ${match[1]}`);
  }

  const architecture = read(join(root, "docs/ARCHITECTURE.md"));
  const adrIds = new Set();
  for (const file of markdownFiles(join(root, "docs/adr"))) {
    const content = read(file);
    const id = content.match(/^# ADR-(\d{4}) /m)?.[1];
    if (!id || adrIds.has(id)) report(file, "invalid or duplicate ADR id");
    adrIds.add(id);
    if (!/^- 状态：(Proposed|Accepted|Rejected|Superseded|Deprecated)\s*$/m.test(content))
      report(file, "invalid ADR status");
    if (!/^- 日期：\d{4}-\d{2}-\d{2}\s*$/m.test(content)) report(file, "missing ADR date");
    const link = relative(join(root, "docs"), file).replaceAll("\\", "/");
    if (!architecture.includes(`](${link})`)) report(file, "missing architecture index");
    for (const match of content.matchAll(/\b(?:FR|NFR)-\d{3}\b/g)) {
      if (!ids.has(match[0])) report(file, `undefined requirement: ${match[0]}`);
    }
  }
  if (!adrIds.size) report(join(root, "docs/adr"), "missing ADR");
  const skillIndex = read(join(root, "docs/SKILLS.md"));
  for (const file of markdownFiles(join(root, ".agents/skills")).filter((path) =>
    path.endsWith("SKILL.md"),
  )) {
    const metadata = read(file).match(/^---\r?\n([\s\S]+?)\r?\n---/)?.[1] ?? "";
    if (
      !/^name: [a-z0-9]+(?:-[a-z0-9]+)*\s*$/m.test(metadata) ||
      !/^description: \S.+$/m.test(metadata)
    )
      report(file, "invalid Skill metadata");
    const link = relative(join(root, "docs"), file).replaceAll("\\", "/");
    if (!skillIndex.includes(`](${link})`)) report(file, "missing Skills index");
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const errors = validateDocs();
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exitCode = 1;
  } else console.log("Documentation checks passed (structure and references only).");
}
