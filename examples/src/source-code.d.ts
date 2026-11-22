declare module "*?example-source" {
  const source: {
    readonly files: readonly {
      readonly code: string;
      readonly html: string;
      readonly styles: string;
      readonly filename: string;
    }[];
  };
  export default source;
}
