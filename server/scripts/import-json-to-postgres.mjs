import { loadEnv } from "../src/config/env.js";
import { EMPTY_DATA, JsonStore, normalizeData } from "../src/db/jsonStore.js";
import { PostgresStore } from "../src/db/postgresStore.js";
import { readBackupFile } from "../src/utils/backupFile.js";

const env = loadEnv({ ...process.env, STORE_DRIVER: "postgres" });
const target = new PostgresStore({ databaseUrl: env.databaseUrl });
const backupPath = process.argv[2] || "";

let sourceData;
if (backupPath) {
  sourceData = (await readBackupFile(backupPath, { encryptionKey: process.env.BACKUP_ENCRYPTION_KEY || "" })).data;
} else {
  const source = new JsonStore(env.dataFile);
  await source.init();
  sourceData = normalizeData(await source.read());
}
await target.init();

await target.write((data) => {
  for (const key of Object.keys(EMPTY_DATA)) {
    data[key] = sourceData[key] || [];
  }
});

await target.close();
console.log(`Imported JSON data from ${backupPath || env.dataFile} into PostgreSQL.`);
