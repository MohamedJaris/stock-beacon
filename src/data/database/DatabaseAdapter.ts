export type SqlBindValue = string | number | null;

/**
 * Platform-agnostic SQLite database executor contract.
 * Implemented by both:
 * 1. ExpoSqliteAdapter (wrapping `expo-sqlite` on Android/iOS)
 * 2. BetterSqliteAdapter (wrapping `better-sqlite3` in Node.js for fast, real SQLite integration tests)
 */
export interface IDatabaseAdapter {
  execAsync(sql: string): Promise<void>;
  runAsync(
    sql: string,
    params?: SqlBindValue[]
  ): Promise<{ changes: number; lastInsertRowId: number }>;
  getFirstAsync<T>(sql: string, params?: SqlBindValue[]): Promise<T | null>;
  getAllAsync<T>(sql: string, params?: SqlBindValue[]): Promise<T[]>;
  withTransactionAsync<T>(task: () => Promise<T>): Promise<T>;
}
