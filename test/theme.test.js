import assert from "node:assert/strict";
import test from "node:test";

import { initThemeToggle } from "../src/ui/theme.js";

test("theme initialization survives browsers that block localStorage", () => {
  const listeners = {};
  const button = {
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    setAttribute() {},
    title: "",
  };
  const root = {
    dataset: {},
    style: {},
    classList: { add() {}, remove() {} },
  };
  const storage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };

  initThemeToggle(button, root, {
    storage,
    window: {
      matchMedia: () => ({ matches: true, addEventListener() {} }),
      setTimeout: (callback) => callback(),
    },
  });

  assert.equal(root.dataset.theme, "dark");
  assert.doesNotThrow(() => listeners.click());
  assert.equal(root.dataset.theme, "light");
});
