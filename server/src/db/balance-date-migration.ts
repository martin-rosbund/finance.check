import type Database from 'better-sqlite3';
import fs from 'node:fs';
import { todayDate } from '../services/dates.js';

export function migrateBalanceDates(db: Database.Database, databasePath: string, today = todayDate()) {
  const columns = db.prepare('PRAGMA table_info(accounts)').all() as { name: string }[];
  if (columns.some((column) => column.name === 'balance_date')) return;

  const { count } = db.prepare('SELECT COUNT(*) AS count FROM accounts').get() as { count: number };
  const backupPath = `${databasePath}.pre-balance-date-backup`;
  if (count > 0 && !fs.existsSync(backupPath)) {
    db.exec(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`);
  }
  db.transaction(() => {
    db.exec('ALTER TABLE accounts ADD COLUMN balance_date TEXT');
    // Start existing financial balances today once; intentionally cleared dates stay empty later.
    db.prepare("UPDATE accounts SET balance_date = ? WHERE kind IN ('checking','savings','investment','loan','mortgage')").run(today);
  })();
}
