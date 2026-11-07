import { IDatabaseAdapter, SqlBindValue } from '@/data/database/DatabaseAdapter';
import { runDatabaseMigrations } from '@/data/database/migrations';
import initSqlJs, { Database } from 'sql.js';

export class SqlJsTestAdapter implements IDatabaseAdapter {
  private inTransaction = false;

  constructor(private db: Database) {}

  static async createMigratedInstance(
    initialBinary?: Uint8Array
  ): Promise<SqlJsTestAdapter> {
    const SQL = await initSqlJs();
    const db = initialBinary ? new SQL.Database(initialBinary) : new SQL.Database();
    const adapter = new SqlJsTestAdapter(db);
    await runDatabaseMigrations(adapter);
    return adapter;
  }

  exportBinary(): Uint8Array {
    return this.db.export();
  }

  async execAsync(sql: string): Promise<void> {
    this.db.run(sql);
  }

  async runAsync(
    sql: string,
    params: SqlBindValue[] = []
  ): Promise<{ changes: number; lastInsertRowId: number }> {
    this.db.run(sql, params);
    const changes = this.db.getRowsModified();
    return {
      changes,
      lastInsertRowId: 0,
    };
  }

  async getFirstAsync<T>(
    sql: string,
    params: SqlBindValue[] = []
  ): Promise<T | null> {
    const rows = await this.getAllAsync<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  async getAllAsync<T>(
    sql: string,
    params: SqlBindValue[] = []
  ): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const results: T[] = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject() as unknown as T);
      }
      return results;
    } finally {
      stmt.free();
    }
  }

  async withTransactionAsync<T>(task: () => Promise<T>): Promise<T> {
    if (this.inTransaction) {
      return await task();
    }
    this.inTransaction = true;
    this.db.run('BEGIN TRANSACTION;');
    try {
      const result = await task();
      this.db.run('COMMIT;');
      return result;
    } catch (err) {
      this.db.run('ROLLBACK;');
      throw err;
    } finally {
      this.inTransaction = false;
    }
  }
}
