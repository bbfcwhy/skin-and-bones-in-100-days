/**
 * Worker 執行環境的型別。
 *
 * 這裡只手寫用得到的那一小塊 D1 介面，好處是這個小專案不裝任何 npm 套件
 * 也能通過 `npx tsc --noEmit`。之後如果裝了 @cloudflare/workers-types，
 * 這些是 module scope 的宣告，不會跟全域型別打架。
 */

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

export interface Env {
  /** wrangler.toml 裡的 d1_databases binding。 */
  DB: D1Database;
  /** `wrangler secret put TOKEN_SECRET` 設定；沒設定的話所有需要 token 的路由一律 500。 */
  TOKEN_SECRET?: string;
}
