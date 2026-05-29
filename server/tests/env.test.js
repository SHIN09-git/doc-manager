import { test } from "node:test";
import assert from "node:assert/strict";
import { loadEnv } from "../src/config/env.js";

test("APP_BASE_URL can configure the public app url alias", () => {
  const env = loadEnv({
    APP_BASE_URL: "https://mowen.example.com/index.html",
  });
  assert.equal(env.appUrl, "https://mowen.example.com/index.html");
});
