import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const MIGRATION_VERSION_TABLE_SQL = `
create table if not exists migration_versions (
  id text primary key,
  name text not null,
  applied_at timestamptz not null default now()
)`;

export async function runMigrations(pool, { migrationsDir } = {}) {
  if (!pool || typeof pool.query !== "function" || typeof pool.connect !== "function") {
    throw new Error("A PostgreSQL pool with query() and connect() is required");
  }
  if (!migrationsDir) throw new Error("migrationsDir is required");

  await pool.query(MIGRATION_VERSION_TABLE_SQL);
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, "en"));

  const result = { applied: [], skipped: [] };
  for (const file of files) {
    const migration = parseMigrationFileName(file);
    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtext('mowen_migrations'))");
      const existing = await client.query("select id from migration_versions where id = $1", [migration.id]);
      if (existing.rows?.length) {
        await client.query("commit");
        result.skipped.push(migration);
        continue;
      }
      if (sql.trim()) await client.query(sql);
      await client.query(
        "insert into migration_versions (id, name) values ($1, $2) on conflict (id) do nothing",
        [migration.id, migration.name],
      );
      await client.query("commit");
      result.applied.push(migration);
    } catch (error) {
      await client.query("rollback").catch(() => null);
      throw error;
    } finally {
      client.release();
    }
  }
  return result;
}

export function parseMigrationFileName(file) {
  const name = path.basename(file, ".sql");
  return { id: name, name };
}
