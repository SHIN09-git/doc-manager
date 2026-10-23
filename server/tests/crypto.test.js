import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "../src/utils/crypto.js";

test("password hashing remains compatible while running asynchronously", async () => {
  const encoded = await hashPassword("correct horse battery staple");

  assert.match(encoded, /^pbkdf2\$210000\$/);
  assert.equal(await verifyPassword("correct horse battery staple", encoded), true);
  assert.equal(await verifyPassword("wrong password", encoded), false);
});

test("password verification rejects malformed or unreasonable work factors", async () => {
  assert.equal(await verifyPassword("password", "invalid"), false);
  assert.equal(await verifyPassword("password", "pbkdf2$999999999$salt$hash"), false);
});
