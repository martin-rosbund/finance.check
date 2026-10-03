import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const databasePath = path.resolve(process.cwd(), process.env.DATABASE_PATH ?? './data/finance-check.db');
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

export const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('checking','savings','investment','property','company_share','loan','mortgage')),
    balance_cents INTEGER NOT NULL CHECK (balance_cents >= 0),
    monthly_savings_cents INTEGER NOT NULL DEFAULT 0 CHECK (monthly_savings_cents >= 0),
    monthly_savings_source_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    annual_bonus_cents INTEGER NOT NULL DEFAULT 0 CHECK (annual_bonus_cents >= 0),
    annual_bonus_month INTEGER NOT NULL DEFAULT 12 CHECK (annual_bonus_month BETWEEN 1 AND 12),
    annual_bonus_target_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    monthly_payment_cents INTEGER NOT NULL DEFAULT 0 CHECK (monthly_payment_cents >= 0),
    monthly_payment_source_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    annual_rate REAL NOT NULL DEFAULT 0,
    expected_annual_return REAL NOT NULL DEFAULT 0,
    ownership_percent REAL NOT NULL DEFAULT 100,
    total_valuation_cents INTEGER,
    valuation_date TEXT,
    linked_asset_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    funding_eligible INTEGER NOT NULL DEFAULT 0 CHECK (funding_eligible IN (0, 1)),
    funding_available_from TEXT,
    color TEXT NOT NULL DEFAULT '#6366f1',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS recurring_flows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('income','expense')),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    frequency TEXT NOT NULL CHECK (frequency IN ('weekly','monthly','quarterly','yearly')),
    start_date TEXT NOT NULL,
    end_date TEXT,
    account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    category TEXT NOT NULL DEFAULT 'Sonstiges',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS investment_scenarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    investment_cents INTEGER NOT NULL CHECK (investment_cents > 0),
    minimum_loan_cents INTEGER NOT NULL DEFAULT 0 CHECK (minimum_loan_cents >= 0),
    monthly_cost_savings_cents INTEGER NOT NULL DEFAULT 0 CHECK (monthly_cost_savings_cents >= 0),
    expected_annual_return REAL NOT NULL DEFAULT 0,
    loan_annual_rate REAL NOT NULL DEFAULT 0 CHECK (loan_annual_rate >= 0),
    loan_term_years INTEGER NOT NULL CHECK (loan_term_years BETWEEN 1 AND 50),
    horizon_years INTEGER NOT NULL CHECK (horizon_years BETWEEN 1 AND 60),
    use_own_funds INTEGER NOT NULL DEFAULT 1 CHECK (use_own_funds IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_recurring_flows_account_id ON recurring_flows(account_id);
  CREATE INDEX IF NOT EXISTS idx_recurring_flows_active_dates ON recurring_flows(start_date, end_date);
  CREATE INDEX IF NOT EXISTS idx_investment_scenarios_updated_at ON investment_scenarios(updated_at DESC, id DESC);
`);

// Additive migration for databases created before monthly account savings existed.
let accountColumns = db.prepare('PRAGMA table_info(accounts)').all() as { name: string }[];
if (!accountColumns.some((column) => column.name === 'monthly_savings_cents')) {
  db.exec('ALTER TABLE accounts ADD COLUMN monthly_savings_cents INTEGER NOT NULL DEFAULT 0 CHECK (monthly_savings_cents >= 0)');
}
if (!accountColumns.some((column) => column.name === 'annual_bonus_cents')) {
  db.exec('ALTER TABLE accounts ADD COLUMN annual_bonus_cents INTEGER NOT NULL DEFAULT 0 CHECK (annual_bonus_cents >= 0)');
}
if (!accountColumns.some((column) => column.name === 'annual_bonus_month')) {
  db.exec('ALTER TABLE accounts ADD COLUMN annual_bonus_month INTEGER NOT NULL DEFAULT 12 CHECK (annual_bonus_month BETWEEN 1 AND 12)');
}
if (!accountColumns.some((column) => column.name === 'monthly_payment_cents')) {
  db.exec('ALTER TABLE accounts ADD COLUMN monthly_payment_cents INTEGER NOT NULL DEFAULT 0 CHECK (monthly_payment_cents >= 0)');
}
if (!accountColumns.some((column) => column.name === 'monthly_savings_source_account_id')) {
  db.exec('ALTER TABLE accounts ADD COLUMN monthly_savings_source_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL');
}
if (!accountColumns.some((column) => column.name === 'annual_bonus_target_account_id')) {
  db.exec('ALTER TABLE accounts ADD COLUMN annual_bonus_target_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL');
}
if (!accountColumns.some((column) => column.name === 'monthly_payment_source_account_id')) {
  db.exec('ALTER TABLE accounts ADD COLUMN monthly_payment_source_account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL');
}
if (!accountColumns.some((column) => column.name === 'expected_annual_return')) {
  db.exec('ALTER TABLE accounts ADD COLUMN expected_annual_return REAL NOT NULL DEFAULT 0');
}

// SQLite cannot expand an existing CHECK constraint in place. Create a local snapshot and rebuild once.
const accountTable = db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = 'accounts'").get() as { sql: string };
if (!accountTable.sql.includes("'property'")) {
  const backupPath = `${databasePath}.pre-asset-types-backup`;
  if (!fs.existsSync(backupPath)) {
    db.exec(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`);
  }
  db.pragma('foreign_keys = OFF');
  db.transaction(() => {
    db.exec('DROP TABLE IF EXISTS accounts_asset_migration');
    db.exec(`
      CREATE TABLE accounts_asset_migration (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('checking','savings','investment','property','company_share','loan','mortgage')),
        balance_cents INTEGER NOT NULL CHECK (balance_cents >= 0),
        monthly_savings_cents INTEGER NOT NULL DEFAULT 0 CHECK (monthly_savings_cents >= 0),
        monthly_savings_source_account_id INTEGER REFERENCES accounts_asset_migration(id) ON DELETE SET NULL,
        annual_bonus_cents INTEGER NOT NULL DEFAULT 0 CHECK (annual_bonus_cents >= 0),
        annual_bonus_month INTEGER NOT NULL DEFAULT 12 CHECK (annual_bonus_month BETWEEN 1 AND 12),
        annual_bonus_target_account_id INTEGER REFERENCES accounts_asset_migration(id) ON DELETE SET NULL,
        monthly_payment_cents INTEGER NOT NULL DEFAULT 0 CHECK (monthly_payment_cents >= 0),
        monthly_payment_source_account_id INTEGER REFERENCES accounts_asset_migration(id) ON DELETE SET NULL,
        annual_rate REAL NOT NULL DEFAULT 0,
        expected_annual_return REAL NOT NULL DEFAULT 0,
        ownership_percent REAL NOT NULL DEFAULT 100,
        total_valuation_cents INTEGER,
        valuation_date TEXT,
        linked_asset_id INTEGER REFERENCES accounts_asset_migration(id) ON DELETE SET NULL,
        funding_eligible INTEGER NOT NULL DEFAULT 0 CHECK (funding_eligible IN (0, 1)),
        funding_available_from TEXT,
        color TEXT NOT NULL DEFAULT '#6366f1',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.exec(`
      INSERT INTO accounts_asset_migration (
        id, name, kind, balance_cents, monthly_savings_cents, monthly_savings_source_account_id,
        annual_bonus_cents, annual_bonus_month, annual_bonus_target_account_id,
        monthly_payment_cents, monthly_payment_source_account_id, annual_rate, expected_annual_return,
        ownership_percent, total_valuation_cents, valuation_date, linked_asset_id,
        funding_eligible, funding_available_from, color, created_at, updated_at
      )
      SELECT id, name, kind, balance_cents, monthly_savings_cents, monthly_savings_source_account_id,
        annual_bonus_cents, annual_bonus_month, annual_bonus_target_account_id,
        monthly_payment_cents, monthly_payment_source_account_id, annual_rate, expected_annual_return,
        100, NULL, NULL, NULL, 0, NULL, color, created_at, updated_at
      FROM accounts
    `);
    db.exec('DROP TABLE accounts');
    db.exec('ALTER TABLE accounts_asset_migration RENAME TO accounts');
  })();
  db.pragma('foreign_keys = ON');
  const foreignKeyProblems = db.pragma('foreign_key_check') as unknown[];
  if (foreignKeyProblems.length) throw new Error('Die Kontenmigration hat ungültige Fremdschlüssel erzeugt.');
}

accountColumns = db.prepare('PRAGMA table_info(accounts)').all() as { name: string }[];
if (!accountColumns.some((column) => column.name === 'ownership_percent')) {
  db.exec('ALTER TABLE accounts ADD COLUMN ownership_percent REAL NOT NULL DEFAULT 100');
}
if (!accountColumns.some((column) => column.name === 'total_valuation_cents')) {
  db.exec('ALTER TABLE accounts ADD COLUMN total_valuation_cents INTEGER');
}
if (!accountColumns.some((column) => column.name === 'valuation_date')) {
  db.exec('ALTER TABLE accounts ADD COLUMN valuation_date TEXT');
}
if (!accountColumns.some((column) => column.name === 'linked_asset_id')) {
  db.exec('ALTER TABLE accounts ADD COLUMN linked_asset_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL');
}
if (!accountColumns.some((column) => column.name === 'funding_eligible')) {
  db.exec('ALTER TABLE accounts ADD COLUMN funding_eligible INTEGER NOT NULL DEFAULT 0 CHECK (funding_eligible IN (0, 1))');
}
if (!accountColumns.some((column) => column.name === 'funding_available_from')) {
  db.exec('ALTER TABLE accounts ADD COLUMN funding_available_from TEXT');
}
const investmentScenarioColumns = db.prepare('PRAGMA table_info(investment_scenarios)').all() as { name: string }[];
if (!investmentScenarioColumns.some((column) => column.name === 'use_own_funds')) {
  db.exec('ALTER TABLE investment_scenarios ADD COLUMN use_own_funds INTEGER NOT NULL DEFAULT 1 CHECK (use_own_funds IN (0, 1))');
}
if (!investmentScenarioColumns.some((column) => column.name === 'minimum_loan_cents')) {
  db.exec('ALTER TABLE investment_scenarios ADD COLUMN minimum_loan_cents INTEGER NOT NULL DEFAULT 0 CHECK (minimum_loan_cents >= 0)');
}
const investmentScenarioIndex = db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'index' AND name = 'idx_investment_scenarios_updated_at'").get() as { sql: string } | undefined;
if (!investmentScenarioIndex?.sql.includes('id DESC')) {
  db.exec('DROP INDEX IF EXISTS idx_investment_scenarios_updated_at');
  db.exec('CREATE INDEX idx_investment_scenarios_updated_at ON investment_scenarios(updated_at DESC, id DESC)');
}
db.pragma('optimize');

export const closeDatabase = () => db.close();
