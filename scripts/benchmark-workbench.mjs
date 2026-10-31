import { chromium } from "@playwright/test";
import { createStaticServer, closeStaticServer } from "../e2e/serve-static.mjs";

const server = createStaticServer();
let browser;
try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.route("**/__benchmark", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><html><body></body></html>" }));
  await page.goto(`http://127.0.0.1:${server.address().port}/__benchmark`);
  const result = await page.evaluate(async () => {
    const { createDocumentRenderer } = await import("/src/modules/documents/documentRenderer.js");
    const { createSkillRenderer } = await import("/src/modules/skills/skillRenderer.js");
    const { createSkillWorkbenchController } = await import("/src/modules/skills/skillWorkbenchController.js");
    const { createWorkspacePersistenceController } = await import("/src/core/workspacePersistenceController.js");
    await import("/src/ui/icons.js");
    document.body.innerHTML = '<input id="searchInput"><span id="docCount"></span><div id="docList"></div><div id="trashModal" hidden><div id="trashModalList"></div></div><div id="styleList"></div>';
    const els = Object.fromEntries([...document.querySelectorAll("[id]")].map((node) => [node.id, node]));
    const state = {
      docs: Array.from({ length: 1200 }, (_, index) => ({ id: `doc-${index}`, title: `Document ${index}`, content: "Sample text. ".repeat(160), folderId: `folder-${index % 20}`, updatedAt: "2026-10-01T00:00:00Z", deletedAt: index >= 1000 ? "2026-10-02T00:00:00Z" : null })),
      folders: Array.from({ length: 20 }, (_, index) => ({ id: `folder-${index}`, name: `Folder ${index}` })),
      styles: Array.from({ length: 100 }, (_, index) => ({ id: `skill-${index}`, name: `Writer ${index}`, handle: `writer-${index}`, enabled: true, status: "ready", summary: "Reusable writing rules", examples: [], versions: [] })),
    };
    const ui = { selectedFolderId: "all", selectedDocId: "doc-0", selectedSkillCardId: null, persistPromise: Promise.resolve() };
    const renderer = createDocumentRenderer({ state, ui, els, getType: () => ({ name: "Document" }) });
    const skillRenderer = createSkillRenderer({ state, ui, els, isSkillEnabled: () => true });
    renderer.renderDocList();
    skillRenderer.renderStyleList();
    function measure(action, iterations = 15) {
      const times = [];
      let replacedNodes = 0;
      const observer = new MutationObserver(() => {});
      observer.observe(els.docList, { childList: true });
      observer.observe(els.styleList, { childList: true });
      for (let index = 0; index < iterations; index++) {
        const start = performance.now();
        action(index);
        times.push(performance.now() - start);
        replacedNodes += observer.takeRecords().reduce((sum, record) => sum + record.removedNodes.length, 0);
      }
      observer.disconnect();
      return { iterations, medianMs: Number(times.sort((a, b) => a - b)[Math.floor(times.length / 2)].toFixed(2)), removedListNodes: replacedNodes };
    }
    const selection = measure((index) => { ui.selectedDocId = `doc-${index + 1}`; renderer.renderDocList(); });
    const save = measure((index) => { state.docs[0].title = `Edit ${index}`; renderer.renderDocList(); });
    let progressWrites = 0;
    const workbench = createSkillWorkbenchController({ state, ui, els, persist: () => progressWrites++, eventBus: { emit: (event) => { if (event === "render:style-list") skillRenderer.renderStyleList(); } } });
    const progress = workbench.createCardProgress("skill-0");
    const training = measure((index) => progress.update(`Step ${index}`, index * 5));
    let copies = 0;
    let writes = 0;
    const persistence = createWorkspacePersistenceController({ state, ui, clone: (data) => { copies++; return structuredClone(data); }, writeWorkspaceState: async () => { writes++; }, writeStorageBootstrap: () => true, clearLegacyLocalStorageState: () => {} });
    const start = performance.now();
    const pending = Array.from({ length: 10 }, () => persistence.persist());
    await Promise.all(pending);
    return { documents: 1000, trash: 200, writers: 100, selection, save, training: { ...training, workspaceWrites: progressWrites }, saveBurst: { requests: 10, copies, writes, elapsedMs: Number((performance.now() - start).toFixed(2)) } };
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  await closeStaticServer(server);
}
