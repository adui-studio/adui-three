import { defineComponent, h } from "vue";
import { withBase } from "vitepress";
import { spatialGraphic } from "../../../../ui/graphics.ts";

export default defineComponent({
  name: "HomePage",
  setup() {
    const link = (href: string, text: string, className = "") =>
      h("a", { href: withBase(href), class: className }, text);
    return () =>
      h("div", { class: "product-home" }, [
        h("section", { class: "product-hero" }, [
          h("div", { class: "hero-copy" }, [
            h("div", { class: "product-eyebrow" }, "THREE.JS, THOUGHTFULLY COMPOSED"),
            h("h1", ["为三维场景，", h("br"), "建立", h("span", "清晰秩序。")]),
            h(
              "p",
              { class: "hero-description" },
              "从第一次绘制，到最后一次释放。用统一的 WebGL / WebGPU API，组合模型、交互与视觉效果，让创作回到场景本身。",
            ),
            h("div", { class: "hero-actions" }, [
              link("/guide/getting-started.html", "开始使用", "product-button primary"),
              link("/play/", "探索示例 ↗", "product-button secondary"),
            ]),
            h("div", { class: "hero-footnote" }, [
              h("span", { class: "availability-dot", "aria-hidden": "true" }),
              "v0.0.0 开发版本",
              h("span", { class: "footnote-divider" }, "/"),
              "TypeScript · ESM",
            ]),
          ]),
          h("div", { class: "hero-study" }, [
            h("div", { class: "study-top" }, [h("span", "SCENE ANATOMY"), h("span", "FIG. 001")]),
            h("div", { class: "study-graphic", innerHTML: spatialGraphic("basic", "docs") }),
            h("div", { class: "study-label label-scene" }, [h("i"), "scene"]),
            h("div", { class: "study-label label-camera" }, [h("i"), "camera"]),
            h("div", { class: "study-label label-renderer" }, [h("i"), "renderer"]),
            h("div", { class: "study-bottom" }, [
              h("span", "ONE SCENE. TWO BACKENDS."),
              h("span", "WebGL 2 / WebGPU"),
            ]),
          ]),
        ]),
        h(
          "div",
          { class: "product-facts" },
          [
            ["01", "一套场景 API", "自由选择 WebGL / WebGPU"],
            ["17", "公开模块入口", "按需组合，保留原生对象"],
            ["09", "可运行示例", "实时画面与完整源码同行"],
          ].map(([number, title, text]) =>
            h("div", [h("strong", number), h("div", [h("h2", title), h("p", text)])]),
          ),
        ),
        h("section", { class: "home-principles" }, [
          h("div", { class: "section-intro" }, [
            h("span", { class: "product-eyebrow" }, "LESS PLUMBING. MORE CREATING."),
            h("h2", "把复杂留给实现，\n把清晰交给你。"),
            h("p", "轻量封装 Three.js 的日常工作，保留你熟悉的对象与自由度。"),
          ]),
          h(
            "div",
            { class: "principle-grid" },
            [
              [
                "01 / LIFECYCLE",
                "每个场景，有始有终。",
                "创建、运行、暂停、单帧绘制与销毁。明确的生命周期，让多实例和异步任务各归其位。",
                "/guide/lifecycle.html",
                "了解生命周期",
              ],
              [
                "02 / COMPOSITION",
                "需要什么，组合什么。",
                "模型加载、相机、标签、动画和特效独立接入。直接访问原生 scene、camera 与 renderer。",
                "/guide/composition.html",
                "探索模块组合",
              ],
              [
                "03 / NATIVE",
                "熟悉的 Three.js，继续用。",
                "原生材质、几何与对象直接工作。相同创建入口选择渲染器，实际后端始终清晰可见。",
                "/api/webgpu.html",
                "了解渲染器选择",
              ],
            ].map(([index, title, body, href, text]) =>
              h("article", [
                h("span", { class: "principle-index" }, index),
                h("h3", title),
                h("p", body),
                link(href!, `${text} ↗`),
              ]),
            ),
          ),
        ]),
        h("section", { class: "home-code" }, [
          h("div", [
            h("span", { class: "product-eyebrow" }, "YOUR FIRST SCENE"),
            h("h2", "少一点准备，\n早一点开始。"),
            h("p", "选择容器与渲染器，建立一个独立场景。\n其余部分，按照你的方式组合。"),
            link("/guide/getting-started.html", "阅读快速开始 ↗", "text-link"),
          ]),
          h("div", { class: "code-window" }, [
            h("div", { class: "code-window-bar" }, [
              h("span", "scene.ts"),
              h("span", "TypeScript"),
            ]),
            h("pre", [
              h("code", [
                h("span", { class: "syntax-purple" }, "import"),
                " { ThreeApp } ",
                h("span", { class: "syntax-purple" }, "from"),
                h("span", { class: "syntax-green" }, ' "@adui/three";'),
                "\n\n",
                h("span", { class: "syntax-purple" }, "const"),
                " app = ",
                h("span", { class: "syntax-purple" }, "await"),
                " ThreeApp.create(container, {\n  renderer: { type: ",
                h("span", { class: "syntax-green" }, '"webgpu"'),
                " },\n});\n\n",
                h("span", { class: "syntax-comment" }, "// 同一套生命周期，同一个 ThreeApp"),
                "\napp.start();\n\n",
                h("span", { class: "syntax-comment" }, "// 场景结束后完整释放"),
                "\n",
                h("span", { class: "syntax-purple" }, "await"),
                " app.destroy();",
              ]),
            ]),
            h(
              "div",
              { class: "code-window-note" },
              "WebGPU 默认允许 WebGL 2 回退 · 默认创建使用 WebGL",
            ),
          ]),
        ]),
        h("section", { class: "home-explore" }, [
          h("div", [
            h("span", { class: "product-eyebrow" }, "BUILT TO BE EXPLORED"),
            h("h2", "下一步，让场景动起来。"),
            h("p", "模型、相机、交互与流光。打开一个示例，开始你的下一次创作。"),
          ]),
          link("/play/", "打开示例集 ↗", "product-button primary"),
        ]),
        h("p", { class: "home-release" }, [
          "当前版本 0.0.0，尚未发布 npm。Three.js 0.187.0。",
          link("/guide/installation.html", "安装与版本"),
          link("/HARNESS.html", "查看验证范围"),
        ]),
      ]);
  },
});
