import assert from "node:assert/strict";
import test from "node:test";
import { createBrowserFileSystemAdapter } from "../src/modules/folders/fileSystemAdapter.js";

test("file system adapter reports support and delegates directory picking", async () => {
  const handle = { name: "Docs" };
  const adapter = createBrowserFileSystemAdapter({
    win: {
      showDirectoryPicker: async (options) => ({ ...handle, options }),
    },
  });

  assert.equal(adapter.isSupported(), true);
  assert.deepEqual(await adapter.pickDirectory({ mode: "read" }), { name: "Docs", options: { mode: "read" } });
});

test("file system adapter exposes iterable file entries", async () => {
  const file = { name: "notice.txt", size: 10 };
  const adapter = createBrowserFileSystemAdapter();
  const handle = {
    async *values() {
      yield { kind: "directory", name: "nested" };
      yield { kind: "file", name: "notice.txt", getFile: async () => file };
    },
  };

  const entries = [];
  for await (const entry of adapter.listFiles(handle)) {
    entries.push({ name: entry.name, file: await entry.getFile() });
  }

  assert.deepEqual(entries, [{ name: "notice.txt", file }]);
});

test("file system adapter writes text files through injected handles", async () => {
  const writes = [];
  const adapter = createBrowserFileSystemAdapter();
  const handle = {
    async getFileHandle(fileName, options) {
      return {
        fileName,
        options,
        async createWritable() {
          return {
            async write(content) {
              writes.push({ fileName, options, content });
            },
            async close() {
              writes.push({ fileName, closed: true });
            },
          };
        },
      };
    },
  };

  await adapter.writeTextFile(handle, "notice.txt", "hello");

  assert.deepEqual(writes, [
    { fileName: "notice.txt", options: { create: true }, content: "hello" },
    { fileName: "notice.txt", closed: true },
  ]);
});
