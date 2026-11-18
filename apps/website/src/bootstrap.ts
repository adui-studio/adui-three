const demo = new URLSearchParams(location.search).get("demo");
if (demo === "editor") await import("./editor.ts");
else if (demo === "effects") await import("./effects.ts");
else if (demo === "path-geometry") await import("./path-geometry.ts");
else if (demo === "navigation") await import("./navigation.ts");
else if (demo === "orthographic") await import("./orthographic.ts");
else if (demo === "path") await import("./path.ts");
else if (demo === "instances") await import("./instances.ts");
else await import("./main.ts");

export {};
