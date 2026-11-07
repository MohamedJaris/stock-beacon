import { Platform } from 'react-native';
import { IDatabaseAdapter, SqlBindValue } from './DatabaseAdapter';
import { runDatabaseMigrations } from './migrations';

let activeAdapter: IDatabaseAdapter | null = null;
let initPromise: Promise<IDatabaseAdapter> | null = null;

/**
 * Allows injecting a custom database adapter (e.g., SqlJsTestAdapter in Jest tests).
 */
export function setDatabaseAdapter(adapter: IDatabaseAdapter | null): void {
  activeAdapter = adapter;
  initPromise = adapter ? Promise.resolve(adapter) : null;
}

const WEB_STORAGE_KEY = 'stock_beacon_web_sqlite_v1';

/**
 * Loads sql.js in the browser on demand without bundling Node-targeted sql-wasm.js into Metro.
 */
async function loadBrowserSqlJs(): Promise<any> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Browser environment required for web SQLite adapter.');
  }
  const win = window as unknown as { initSqlJs?: (cfg: any) => Promise<any> };
  if (!win.initSqlJs) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://sql.js.org/dist/sql-wasm.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error('Failed to load sql-wasm.js in browser'));
      document.head.appendChild(script);
    });
  }
  if (!win.initSqlJs) {
    throw new Error('initSqlJs not available on window.');
  }
  return win.initSqlJs({
    locateFile: (file: string) => `https://sql.js.org/dist/${file}`,
  });
}

/**
 * Creates a persistent SQLite adapter for Web browsers using sql.js + localStorage
 * so `Press w | open web` in `expo start` works out-of-the-box alongside Android/iOS.
 */
async function createWebSqlJsAdapter(): Promise<IDatabaseAdapter> {
  const SQL = await loadBrowserSqlJs();

  let initialBytes: Uint8Array | undefined;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const savedBase64 = window.localStorage.getItem(WEB_STORAGE_KEY);
      if (savedBase64) {
        const binaryString = window.atob(savedBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        initialBytes = bytes;
      }
    }
  } catch {
    // Ignore storage read error
  }

  const db = initialBytes ? new SQL.Database(initialBytes) : new SQL.Database();
  let inTransaction = false;

  const persistToLocalStorage = () => {
    try {
      if (typeof window !== 'undefined' && window.localStorage && !inTransaction) {
        const data: Uint8Array = db.export();
        let binary = '';
        for (let i = 0; i < data.byteLength; i++) {
          binary += String.fromCharCode(data[i]);
        }
        window.localStorage.setItem(WEB_STORAGE_KEY, window.btoa(binary));
      }
    } catch {
      // Ignore storage quota warning
    }
  };

  const adapter: IDatabaseAdapter = {
    async execAsync(sql: string): Promise<void> {
      db.run(sql);
      persistToLocalStorage();
    },
    async runAsync(
      sql: string,
      params: SqlBindValue[] = []
    ): Promise<{ changes: number; lastInsertRowId: number }> {
      db.run(sql, params);
      const changes = db.getRowsModified();
      persistToLocalStorage();
      return { changes, lastInsertRowId: 0 };
    },
    async getFirstAsync<T>(sql: string, params: SqlBindValue[] = []): Promise<T | null> {
      const rows = await this.getAllAsync<T>(sql, params);
      return rows.length > 0 ? rows[0] : null;
    },
    async getAllAsync<T>(sql: string, params: SqlBindValue[] = []): Promise<T[]> {
      const stmt = db.prepare(sql);
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
    },
    async withTransactionAsync<T>(task: () => Promise<T>): Promise<T> {
      if (inTransaction) {
        return await task();
      }
      inTransaction = true;
      db.run('BEGIN TRANSACTION;');
      try {
        const result = await task();
        db.run('COMMIT;');
        inTransaction = false;
        persistToLocalStorage();
        return result;
      } catch (err) {
        db.run('ROLLBACK;');
        inTransaction = false;
        throw err;
      }
    },
  };

  await runDatabaseMigrations(adapter);
  return adapter;
}

/**
 * Creates an IDatabaseAdapter backed by Expo's native SQLite library (`expo-sqlite`)
 * on Android and iOS, or `createWebSqlJsAdapter` when previewing on Web.
 */
async function createPlatformDatabaseAdapter(): Promise<IDatabaseAdapter> {
  if (Platform.OS === 'web') {
    return await createWebSqlJsAdapter();
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const SQLite = require('expo-sqlite');
  const db = await SQLite.openDatabaseAsync('stock_beacon_v1.db');
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  let inTransaction = false;

  const adapter: IDatabaseAdapter = {
    async execAsync(sql: string): Promise<void> {
      await db.execAsync(sql);
    },
    async runAsync(
      sql: string,
      params: SqlBindValue[] = []
    ): Promise<{ changes: number; lastInsertRowId: number }> {
      const res = await db.runAsync(sql, params);
      return {
        changes: res.changes ?? 0,
        lastInsertRowId: Number(res.lastInsertRowId ?? 0),
      };
    },
    async getFirstAsync<T>(sql: string, params: SqlBindValue[] = []): Promise<T | null> {
      const row = await db.getFirstAsync(sql, params);
      return (row as T) ?? null;
    },
    async getAllAsync<T>(sql: string, params: SqlBindValue[] = []): Promise<T[]> {
      const rows = await db.getAllAsync(sql, params);
      return (rows as T[]) ?? [];
    },
    async withTransactionAsync<T>(task: () => Promise<T>): Promise<T> {
      if (inTransaction) {
        return await task();
      }
      inTransaction = true;
      await db.execAsync('BEGIN IMMEDIATE TRANSACTION;');
      try {
        const result = await task();
        await db.execAsync('COMMIT;');
        return result;
      } catch (err) {
        await db.execAsync('ROLLBACK;');
        throw err;
      } finally {
        inTransaction = false;
      }
    },
  };

  await runDatabaseMigrations(adapter);
  return adapter;
}

/**
 * Returns the initialized, migrated SQLite database adapter singleton.
 */
export async function getDatabase(): Promise<IDatabaseAdapter> {
  if (activeAdapter) {
    return activeAdapter;
  }
  if (!initPromise) {
    initPromise = createPlatformDatabaseAdapter().then((adapter) => {
      activeAdapter = adapter;
      return adapter;
    });
  }
  return initPromise;
}
