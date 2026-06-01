import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SYSTEM_PROMPT } from "../src/config/constants.js";
import {
  LEGACY_SCHOOL_SYSTEM_PROMPT,
  createDefaultNoticeWriterJson,
  initializeWorkspaceState,
  normalizeCloudState,
  normalizeSettings,
} from "../src/core/workspaceInitializer.js";

function createHarness(options = {}) {
  const ids = ["folder-a", "folder-b", "folder-c", "writer-a", "doc-a"];
  const calls = [];
  const state = options.state || {};
  const ui = {};
  initializeWorkspaceState({
    state,
    ui,
    defaultCloudApiBaseUrl: "http://127.0.0.1:8787/api",
    createId: () => ids.shift() || `id-${ids.length}`,
    now: () => "2026-06-01T00:00:00.000Z",
    clone: (value) => JSON.parse(JSON.stringify(value)),
    normalizeFolder: (folder) => ({ ...folder, normalizedFolder: true }),
    normalizeSkill: (skill) => ({ ...skill, normalizedSkill: true }),
    normalizeCustomTypes: (types) => (Array.isArray(types) ? types : []),
    normalizeCloudBaseUrl: (value) => `${value}`.replace(/\/+$/, ""),
    persist: () => calls.push("persist"),
  });
  return { state, ui, calls };
}

test("initializeWorkspaceState seeds missing folders, writer, document, settings, and cloud state", () => {
  const { state, ui, calls } = createHarness();

  assert.equal(state.folders.length, 3);
  assert.equal(state.folders[0].id, "folder-a");
  assert.equal(state.folders[0].normalizedFolder, true);
  assert.equal(state.styles.length, 1);
  assert.equal(state.styles[0].id, "writer-a");
  assert.equal(state.styles[0].name, "通知写作");
  assert.equal(state.styles[0].normalizedSkill, true);
  assert.equal(JSON.parse(state.styles[0].skillJson).handle, "通知写作");
  assert.equal(state.docs.length, 1);
  assert.equal(state.docs[0].folderId, "folder-a");
  assert.equal(state.docs[0].styleId, "writer-a");
  assert.equal(state.docs[0].deletedAt, "");
  assert.equal(state.settings.systemPrompt, DEFAULT_SYSTEM_PROMPT);
  assert.equal(state.cloud.apiBaseUrl, "http://127.0.0.1:8787/api");
  assert.deepEqual(state.cloud.members, []);
  assert.notEqual(ui.editingStyle, state.styles[0]);
  assert.deepEqual(calls, ["persist"]);
});

test("legacy school branding and prompt data are migrated without dropping user records", () => {
  const { state } = createHarness({
    state: {
      folders: [{ id: "existing-folder", name: "旧文件夹" }],
      styles: [{
        id: "legacy-style",
        name: "学校通知",
        handle: "学校通知",
        examples: [],
        versions: [],
      }],
      docs: [{
        id: "legacy-doc",
        title: "新学期工作安排通知",
        content: "学校办公室\n旧内容",
      }],
      settings: { systemPrompt: LEGACY_SCHOOL_SYSTEM_PROMPT },
      cloud: { authenticated: true, user: null, organizations: null, members: "bad", invitations: null },
    },
  });

  assert.equal(state.folders.length, 1);
  assert.equal(state.styles[0].name, "通知写作");
  assert.equal(state.styles[0].handle, "通知写作");
  assert.equal(JSON.parse(state.styles[0].skillJson).name, "通知写作");
  assert.equal(state.docs[0].title, "专项培训安排通知");
  assert.ok(state.docs[0].content.includes("专项培训"));
  assert.equal(state.settings.systemPrompt, DEFAULT_SYSTEM_PROMPT);
  assert.equal(state.cloud.authenticated, false);
  assert.deepEqual(state.cloud.organizations, []);
  assert.deepEqual(state.cloud.members, []);
  assert.deepEqual(state.cloud.invitations, []);
});

test("normalizers keep standalone settings and cloud helpers safe", () => {
  assert.equal(normalizeSettings({ systemPrompt: LEGACY_SCHOOL_SYSTEM_PROMPT }).systemPrompt, DEFAULT_SYSTEM_PROMPT);
  assert.deepEqual(
    normalizeCloudState({ authenticated: true, user: { id: "user-1" }, members: null }, {
      defaultCloudApiBaseUrl: "local",
      normalizeCloudBaseUrl: (value) => `normalized:${value}`,
    }),
    {
      apiBaseUrl: "normalized:local",
      authenticated: true,
      user: { id: "user-1" },
      organizations: [],
      activeOrganization: null,
      membership: null,
      members: [],
      invitations: [],
      usage: null,
      billing: null,
      model: "",
    },
  );
  assert.equal(JSON.parse(createDefaultNoticeWriterJson()).forbidden.length, 2);
});

test("initializeWorkspaceState requires an explicit mutable state object", () => {
  assert.throws(() => initializeWorkspaceState(), /mutable state object/);
});
