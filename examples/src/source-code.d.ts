declare module "*?example-source" {
  const source: {
    readonly code: string;
    readonly html: string;
    readonly filename: string;
  };
  export default source;
}
