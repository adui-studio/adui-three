import { defineConfig } from "vitepress";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
const repository = fileURLToPath(new URL("../../../", import.meta.url));
const source = resolve(repository, "docs");
const api = [
  ["core", "场景与资源"],
  ["webgpu", "渲染器选择"],
  ["controls", "控制器"],
  ["loaders", "模型加载"],
  ["animation", "动画"],
  ["camera", "相机"],
  ["interaction", "拾取"],
  ["labels", "DOM 标签"],
  ["geometry", "几何"],
  ["navigation", "角色导航"],
  ["collision", "碰撞"],
  ["capture", "截图"],
  ["textures", "纹理"],
  ["environment", "环境"],
  ["rendering", "渲染配置"],
  ["lighting", "灯光与阴影"],
  ["effects", "动态特效"],
  ["postprocessing", "后处理"],
];
const recipes = [
  ["basic", "场景与生命周期"],
  ["webgpu", "渲染器与输出"],
  ["model", "模型与动画"],
  ["camera", "相机与视角"],
  ["labels", "交互 DOM 标签"],
  ["effects", "点云与流光"],
  ["shadows", "光影与环境"],
  ["navigation", "第一与第三人称"],
  ["instances", "实例化网格"],
];
const decisions = readdirSync(resolve(source, "adr"))
  .filter((file) => file.endsWith(".md"))
  .sort()
  .map((file) => ({
    text: readFileSync(resolve(source, "adr", file), "utf8")
      .split("\n")[0]!
      .replace(/^# /, "")
      .trim(),
    link: "/adr/" + file.replace(/\.md$/, ""),
  }));
export default defineConfig({
  lang: "zh-CN",
  title: "ADui Three",
  description: "Three.js 场景封装：公开 API、可运行示例与开发文档。",
  srcDir: "../../docs",
  outDir: "dist",
  cacheDir: ".vitepress/cache",
  cleanUrls: false,
  lastUpdated: false,
  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/brand/ADui-Three-Icon.svg" }],
    ["meta", { name: "theme-color", content: "#f6f5f2", media: "(prefers-color-scheme: light)" }],
    ["meta", { name: "theme-color", content: "#18171e", media: "(prefers-color-scheme: dark)" }],
  ],
  themeConfig: {
    siteTitle: false,
    logo: { src: "/brand/ADui-Three-Logo.svg", alt: "ADui Three", width: 180, height: 65 },
    nav: [
      { text: "指南", link: "/guide/getting-started" },
      { text: "API", link: "/api/" },
      { text: "示例源码", link: "/examples/" },
      { text: "运行示例 ↗", link: "/play/", target: "_blank" },
      { text: "开发", link: "/development/" },
    ],
    sidebar: [
      {
        text: "开始使用",
        items: [
          { text: "快速开始", link: "/guide/getting-started" },
          { text: "安装与版本", link: "/guide/installation" },
          { text: "生命周期与资源", link: "/guide/lifecycle" },
          { text: "模块组合", link: "/guide/composition" },
          { text: "旧版迁移", link: "/MIGRATION" },
        ],
      },
      {
        text: "API 参考",
        collapsed: true,
        items: [
          { text: "公开入口", link: "/api/" },
          ...api.map(([id, text]) => ({ text, link: "/api/" + id })),
        ],
      },
      {
        text: "正式示例",
        collapsed: true,
        items: [
          { text: "示例目录", link: "/examples/" },
          ...recipes.map(([id, text]) => ({ text, link: "/examples/" + id })),
        ],
      },
      {
        text: "开发文档",
        collapsed: true,
        items: [
          { text: "开发入口", link: "/development/" },
          { text: "目录与包边界", link: "/development/package-layout" },
          { text: "维护示例", link: "/development/examples" },
          { text: "维护文档站", link: "/development/docs" },
          { text: "界面设计与品牌", link: "/development/visual-design" },
          { text: "架构", link: "/ARCHITECTURE" },
          { text: "详细设计", link: "/SDD" },
          { text: "需求与验收", link: "/REQUIREMENTS" },
          { text: "本地验证", link: "/HARNESS" },
          { text: "代码地图", link: "/CODEBASE_MAP" },
          { text: "项目上下文", link: "/PROJECT_CONTEXT" },
          { text: "Skills", link: "/SKILLS" },
        ],
      },
      { text: "架构决策 ADR", collapsed: true, items: decisions },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/adui-studio/adui-three" }],
    search: {
      provider: "local",
      options: {
        locales: {
          root: {
            translations: {
              button: { buttonText: "搜索文档", buttonAriaLabel: "搜索文档" },
              modal: {
                noResultsText: "没有找到结果",
                displayDetails: "显示详情",
                resetButtonTitle: "清空",
                backButtonTitle: "返回",
                footer: { selectText: "选择", navigateText: "切换", closeText: "关闭" },
              },
            },
          },
        },
      },
    },
    outline: { level: [2, 3], label: "本页内容" },
    docFooter: { prev: "上一篇", next: "下一篇" },
    editLink: {
      pattern: "https://github.com/adui-studio/adui-three/edit/main/docs/:path",
      text: "在 GitHub 编辑此页",
    },
    footer: {
      message: "开发版本 0.0.0 · 尚未发布 npm",
      copyright: "Three.js r187 · WebGL 2 / WebGPU",
    },
  },
  markdown: {
    html: false,
    config(md) {
      const previous = md.renderer.rules.link_open;
      md.renderer.rules.link_open = (tokens, index, options, env, self) => {
        const token = tokens[index]!,
          href = token.attrGet("href");
        if (href?.startsWith(".")) {
          const [path, anchor] = href.split("#");
          const page =
            typeof env.path === "string"
              ? env.path
              : resolve(source, env.relativePath ?? "index.md");
          const target = resolve(dirname(page), decodeURIComponent(path!));
          if (!target.startsWith(source + sep) && target !== source) {
            const local = relative(repository, target).split(sep).join("/");
            if (!local.startsWith("../"))
              token.attrSet(
                "href",
                "https://github.com/adui-studio/adui-three/blob/main/" +
                  local.split("/").map(encodeURIComponent).join("/") +
                  (anchor ? "#" + anchor : ""),
              );
          }
        }
        return previous
          ? previous(tokens, index, options, env, self)
          : self.renderToken(tokens, index, options);
      };
    },
  },
});
