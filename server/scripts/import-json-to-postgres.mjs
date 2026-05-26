import { loadEnv } from "../src/config/env.js";
import { EMPTY_DATA, JsonStore, normalizeData } from "../src/db/jsonStore.js";
import { PostgresStore } from "../src/db/postgresStore.js";

const env = loadEnv({ ...process.env, STORE_DRIVER: "postgres" });
const source = new JsonStore(env.dataFile);
const target = new PostgresStore({ databaseUrl: env.databaseUrl });

await source.init();
await target.init();

const sourceData = normalizeData(await source.read());
await target.write((data) => {
  for (const key of Object.keys(EMPTY_DATA)) {
    data[key] = sourceData[key] || [];
  }
});

await target.close();
console.log(`Imported JSON data from ${env.dataFile} into PostgreSQL.`);
