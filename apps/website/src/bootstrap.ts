const demo = new URLSearchParams(location.search).get("demo");
if (demo === "orthographic") await import("./orthographic.ts");
else if (demo === "path") await import("./path.ts");
else if (demo === "instances") await import("./instances.ts");
else await import("./main.ts");

export {};
