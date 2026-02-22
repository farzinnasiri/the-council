declare module 'pdf-parse/lib/pdf-parse.js' {
  function parse(
    dataBuffer: Buffer,
    options?: Record<string, unknown>
  ): Promise<{
    numpages?: number;
    numrender?: number;
    info?: unknown;
    metadata?: unknown;
    version?: string;
    text?: string;
  }>;

  export = parse;
}
