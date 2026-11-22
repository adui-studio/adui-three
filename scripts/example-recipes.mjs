import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { strToU8, zipSync } from "fflate";

export const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const recipeIds = [
  "basic",
  "model",
  "camera",
  "labels",
  "effects",
  "shadows",
  "navigation",
  "instances",
  "webgpu",
];
export const sdkArchive = "adui-three-0.0.0.tgz";
export function projectManifest(id, language) {
  return (
    JSON.stringify(
      {
        name: `adui-three-${id}-${language}`,
        version: "0.0.0",
        private: true,
        type: "module",
        scripts: {
          dev: "vite --host 127.0.0.1",
          build: language === "ts" ? "tsc --noEmit && vite build" : "vite build",
          preview: "vite preview --host 127.0.0.1",
        },
        dependencies: { "@adui/three": `file:vendor/${sdkArchive}`, three: "0.187.0" },
        devDependencies: {
          vite: "8.3.8",
          ...(language === "ts" ? { typescript: "7.0.2", "@types/three": "0.187.0" } : {}),
        },
        engines: { node: ">=22.18.0" },
      },
      null,
      2,
    ) + "\n"
  );
}
export function projectHTML(language) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ADui Three 独立示例</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f6f5f2; color: #24232b; font: 14px/1.6 system-ui, sans-serif; }
    #app { position: relative; width: 100%; height: 75vh; min-height: 320px; }
    #tools { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 16px; }
    button { min-height: 44px; padding: 8px 16px; border: 1px solid #d7d0e0; border-radius: 8px; background: #fff; color: #41215e; cursor: pointer; }
    button:focus-visible { outline: 2px solid #78469c; outline-offset: 2px; }
    button:hover { background: #eee7f4; }
    #status { display: block; padding: 0 16px 16px; }
  </style>
</head>
<body>
  <div id="app" aria-label="三维场景"></div>
  <div id="tools" aria-label="示例操作"></div>
  <output id="status" aria-live="polite">正在初始化…</output>
  <script type="module" src="./main.${language}"></script>
</body>
</html>
`;
}
export const projectTSConfig =
  JSON.stringify(
    {
      compilerOptions: {
        target: "ES2023",
        module: "ESNext",
        moduleResolution: "Bundler",
        lib: ["ES2023", "DOM", "DOM.Iterable"],
        strict: true,
        skipLibCheck: false,
        noEmit: true,
      },
      include: ["main.ts"],
    },
    null,
    2,
  ) + "\n";
export function projectReadme(id, language) {
  return `# ADui Three · ${id} · ${language === "ts" ? "TypeScript" : "JavaScript"}

这是独立用法示例，不依赖画廊的 shared.ts、ExampleContext、样式或业务别名。

## 运行

安装 Node.js >=22.18.0 与 pnpm。解压完整工程，在 package.json 所在目录执行：

\`\`\`sh
pnpm install
pnpm run dev
\`\`\`

打开终端打印的本地地址。\`pnpm run build\` 生成生产文件。

主包尚未发布 npm：工程使用 vendor/${sdkArchive}，不是 registry 上的占位版本。下载工程包含该文件，源码页面复制 package.json 时也须保留它。依赖首次安装需要网络或本地缓存，不宣称完全离线。

## 复制到已有项目

已有 Vite ESM 项目安装当前 @adui/three 本地包及 three@0.187.0 后，复制 main.${language} 和 index.html 即可。容器高度、工具栏和状态区域均已在 HTML 中提供。主入口不引用仓库内部模块。
${id === "model" ? "\n模型使用同目录 models/animated.glb，完整工程已包含原创模型；复制到已有项目时也要复制此文件，或修改模型 URL。\n" : "\n本主题使用程序化几何体，无额外模型、贴图或字体下载。\n"}
页面结束会 destroy 宿主；在 SPA 中请在组件卸载时显式调用 app.destroy()。不要重复创建后遗留旧实例。

WebGPU 示例允许回退，界面显示实际后端；它不保证当前设备提供原生 WebGPU。场景控制按主题精简，与画廊的完整交互演示独立维护。

示例、SDK 和原创资源沿用随附 LICENSE。
`;
}
export async function recipeTextFiles(id, language) {
  if (!recipeIds.includes(id) || !["ts", "js"].includes(language))
    throw new Error("Unknown example recipe");
  const code = await readFile(join(repository, "examples/recipes", `${id}.${language}`), "utf8");
  return {
    [`main.${language}`]: code,
    "index.html": await readFile(
      join(repository, "examples/recipes", `index-${language}.html`),
      "utf8",
    ),
    "package.json": projectManifest(id, language),
    ...(language === "ts" ? { "tsconfig.json": projectTSConfig } : {}),
    "README.md": projectReadme(id, language),
  };
}

export async function createRecipeArchive(id, language, sdk) {
  const text = await recipeTextFiles(id, language);
  const files = Object.fromEntries(
    Object.entries(text).map(([name, code]) => [name, strToU8(code)]),
  );
  files[`vendor/${sdkArchive}`] = sdk;
  files.LICENSE = await readFile(join(repository, "LICENSE"));
  if (id === "model")
    files["models/animated.glb"] = await readFile(join(repository, "fixtures/models/animated.glb"));
  return zipSync(
    Object.fromEntries(
      Object.entries(files).map(([name, bytes]) => [
        name,
        [bytes, { mtime: new Date("2020-01-01T00:00:00Z") }],
      ]),
    ),
    { level: 6 },
  );
}
