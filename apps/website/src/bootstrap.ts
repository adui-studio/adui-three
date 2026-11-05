if (new URLSearchParams(location.search).get("demo") === "instances")
  await import("./instances.ts");
else await import("./main.ts");

export {};
