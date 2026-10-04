import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { migrateBalanceDates } from '../src/db/balance-date-migration.js';

it('backfills old financial balances once and preserves a snapshot before migration', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-check-migration-'));
  const databasePath = path.join(directory, 'test.db');
  const db = new Database(databasePath);
  try {
    db.exec("CREATE TABLE accounts (id INTEGER PRIMARY KEY, kind TEXT, balance_cents INTEGER, valuation_date TEXT)");
    const insert = db.prepare('INSERT INTO accounts (kind, balance_cents, valuation_date) VALUES (?, 12345, ?)');
    for (const kind of ['checking', 'savings', 'investment', 'loan', 'mortgage']) insert.run(kind, null);
    insert.run('property', '2025-01-01');
    migrateBalanceDates(db, databasePath, '2026-10-04');
    const rows = db.prepare('SELECT * FROM accounts ORDER BY id').all() as { balance_cents: number; balance_date: string | null; valuation_date: string | null }[];
    expect(rows.slice(0, 5).map((row) => row.balance_date)).toEqual(Array(5).fill('2026-10-04'));
    expect(rows[5]).toMatchObject({ balance_date: null, valuation_date: '2025-01-01' });
    expect(rows.every((row) => row.balance_cents === 12345)).toBe(true);
    const backup = new Database(`${databasePath}.pre-balance-date-backup`, { readonly: true });
    try {
      expect(backup.prepare('SELECT COUNT(*) AS count FROM accounts').get()).toEqual({ count: 6 });
      expect((backup.prepare('PRAGMA table_info(accounts)').all() as { name: string }[]).some((row) => row.name === 'balance_date')).toBe(false);
    } finally { backup.close(); }
    db.prepare('UPDATE accounts SET balance_date = NULL WHERE id = 1').run();
    db.prepare("UPDATE accounts SET balance_date = '2025-08-10' WHERE id = 2").run();
    migrateBalanceDates(db, databasePath, '2027-10-04');
    expect(db.prepare('SELECT balance_date FROM accounts WHERE id IN (1, 2) ORDER BY id').all()).toEqual([{ balance_date: null }, { balance_date: '2025-08-10' }]);
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
