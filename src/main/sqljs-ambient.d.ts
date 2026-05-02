/** Minimal typings for sql.js (package ships without .d.ts in this version). */

declare module 'sql.js' {
  export type SqlValue = string | number | bigint | Uint8Array | null;

  export interface Statement {
    bind(values?: unknown[]): void;
    step(): boolean;
    getAsObject(): Record<string, SqlValue>;
    free(): void;
    run(values?: unknown[]): void;
  }

  export interface Database {
    exec(sql: string): void;
    run(sql: string, params?: unknown[]): void;
    prepare(sql: string): Statement;
    export(): Uint8Array;
  }

  export interface SqlJsStatic {
    Database: new (data?: Uint8Array) => Database;
  }
}

declare module 'sql.js/dist/sql-asm.js' {
  import type { SqlJsStatic } from 'sql.js';
  function initSqlJs(config?: { locateFile?: (file: string) => string }): Promise<SqlJsStatic>;
  export default initSqlJs;
}
