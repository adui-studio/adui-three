declare module "*?example-source" {
  const source: {
    readonly variants: Readonly<
      Record<
        "ts" | "js",
        {
          readonly files: readonly {
            readonly code: string;
            readonly html: string;
            readonly styles: string;
            readonly filename: string;
            readonly language: string;
          }[];
          readonly download: string;
        }
      >
    >;
  };
  export default source;
}
