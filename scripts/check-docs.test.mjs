import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { validateDocs } from "./check-docs.mjs";

const source = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "adui-three-docs-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const name of [
    "AGENTS.md",
    "README.md",
    "CONTRIBUTING.md",
    "LICENSE",
    ".agents",
    ".github",
    "skills-lock.json",
    "docs",
    "scripts",
    "apps",
    "examples",
    "ui",
    "fixtures",
    "packages",
    "package.json",
    "pnpm-workspace.yaml",
    "pnpm-lock.yaml",
    "vite.config.ts",
    "tsconfig.json",
    "playwright.config.ts",
    "tests",
  ]) {
    cpSync(join(source, name), join(root, name), {
      recursive: true,
      filter: (path) =>
        !/(?:^|[/\\])(?:node_modules|dist|cache)(?:[/\\]|$)|(?:apps[/\\])?docs[/\\]public[/\\]play/.test(
          path,
        ),
    });
  }
  return root;
}

function change(root, file, before, after) {
  const path = join(root, file);
  const content = readFileSync(path, "utf8");
  assert.ok(content.includes(before), `fixture source missing ${before}`);
  writeFileSync(path, content.replace(before, after));
}

void test("repository baseline is valid", () => assert.deepEqual(validateDocs(source), []));

void test("generated and dependency documents are outside the validation scope", (t) => {
  const root = fixture(t);
  for (const directory of ["packages/three/dist", "packages/three/node_modules/example"]) {
    const target = join(root, directory);
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "README.md"), "[ignored](missing-generated-file.md)\n");
  }
  assert.deepEqual(validateDocs(root), []);
});

void test("folded and literal Skill descriptions are accepted", (t) => {
  const root = fixture(t);
  const directory = join(root, ".agents/skills/example");
  mkdirSync(directory, { recursive: true });
  const indexFile = join(root, "docs/SKILLS.md");
  writeFileSync(
    indexFile,
    `${readFileSync(indexFile, "utf8")}\n[example](../.agents/skills/example/SKILL.md)\n`,
  );
  for (const style of [">", "|", ">-", "|-"]) {
    writeFileSync(
      join(directory, "SKILL.md"),
      `---\nname: example\ndescription: ${style}\n  A multiline description.\n  Another line.\n---\n`,
    );
    assert.deepEqual(validateDocs(root), [], `description style ${style}`);
  }
});

const cases = [
  [
    "broken example source include",
    (root) => {
      const file = join(root, "docs/examples/basic.md");
      writeFileSync(
        file,
        readFileSync(file, "utf8") + "\n<<< ../../examples/src/cases/missing.ts\n",
      );
    },
    /broken source include/,
  ],
  [
    "missing core file",
    (root) => rmSync(join(root, "docs/PROJECT_CONTEXT.md")),
    /missing or empty core/,
  ],
  [
    "broken relative link",
    (root) => change(root, "AGENTS.md", "docs/SDD.md", "docs/missing.md"),
    /broken link/,
  ],
  [
    "broken anchor",
    (root) => change(root, "AGENTS.md", "docs/SDD.md", "docs/SDD.md#missing"),
    /broken anchor/,
  ],
  [
    "duplicate requirement",
    (root) => change(root, "docs/REQUIREMENTS.md", "### FR-002", "### FR-001"),
    /duplicate requirement/,
  ],
  [
    "invalid requirement status",
    (root) => change(root, "docs/REQUIREMENTS.md", "- 状态：已实现", "- 状态：unknown"),
    /invalid status/,
  ],
  [
    "missing acceptance",
    (root) => change(root, "docs/REQUIREMENTS.md", "- 验收：导航", "- 缺失：导航"),
    /missing 验收/,
  ],
  [
    "missing trace",
    (root) => change(root, "docs/SDD.md", "| FR-001", "| FR-099"),
    /missing SDD trace/,
  ],
  [
    "missing ADR index",
    (root) =>
      change(root, "docs/ARCHITECTURE.md", "](adr/0001-package-boundaries.md)", "](SDD.md)"),
    /missing architecture index/,
  ],
  [
    "invalid Skill metadata",
    (root) => {
      const directory = join(root, ".agents/skills/example");
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, "SKILL.md"), "# missing metadata\n");
    },
    /invalid Skill metadata/,
  ],
  [
    "empty block Skill description",
    (root) => {
      const directory = join(root, ".agents/skills/example");
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        join(directory, "SKILL.md"),
        "---\nname: example\ndescription: >\n  \ncompatibility: test\n---\n",
      );
    },
    /invalid Skill metadata/,
  ],
  [
    "broken package README anchor",
    (root) => {
      const file = join(root, "packages/three/README.md");
      writeFileSync(file, `${readFileSync(file, "utf8")}\n[broken](#missing-package-section)\n`);
    },
    /packages\/three\/README.md: broken anchor/,
  ],
  [
    "broken public asset provenance link",
    (root) => {
      const file = join(root, "fixtures/environments/README.md");
      writeFileSync(file, `${readFileSync(file, "utf8")}\n[generator](missing-generator.mjs)\n`);
    },
    /fixtures\/environments\/README.md: broken link/,
  ],
  [
    "unknown command",
    (root) => change(root, "AGENTS.md", "pnpm run docs:check", "pnpm run missing:check"),
    /unknown root script/,
  ],
];

for (const [name, mutate, expected] of cases) {
  void test(name, (t) => {
    const root = fixture(t);
    mutate(root);
    assert.match(validateDocs(root).join("\n"), expected);
  });
}
