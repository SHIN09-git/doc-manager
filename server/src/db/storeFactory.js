import { JsonStore } from "./jsonStore.js";
import { PostgresStore } from "./postgresStore.js";

export function createStore(env) {
  if (env.storeDriver === "postgres") {
    return new PostgresStore({
      databaseUrl: env.databaseUrl,
    });
  }
  return new JsonStore(env.dataFile);
}
