// Postgres bigint columns return native JS BigInt via postgres-js. JSON.stringify
// has no built-in handler for BigInt, so we attach a toJSON that emits the value
// as a string. Stringifying preserves precision for ids larger than 2^53; ms
// timestamps fit in Number but are still string-safe here.
//
// Imported once from src/index.ts so the patch is applied process-wide before
// any route handler runs.

declare global {
  interface BigInt {
    toJSON(): string;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(BigInt.prototype as any).toJSON = function (this: bigint): string {
  return this.toString();
};

export {};
