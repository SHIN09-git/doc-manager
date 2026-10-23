import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";

import { resolveStaticFilePath } from "../e2e/serve-static.mjs";

test("static server resolves files only inside the configured root", () => {
  const root = path.resolve("test-fixtures", "school-doc-manager");
  assert.equal(
    resolveStaticFilePath("/index.html", root),
    path.join(root, "index.html"),
  );
  assert.equal(resolveStaticFilePath("/../school-doc-manager-private/secret.txt", root), null);
  assert.equal(resolveStaticFilePath("/../../outside.txt", root), null);
});
