import { getFeatureByAction } from "./featureCatalog.js";

export function createFeatureActionController(deps = {}) {
  const {
    els = {},
    switchMainView = () => {},
    switchTab = () => {},
    openStandaloneAdminPage = () => {},
    windowRef = globalThis.window,
  } = deps;
  let eventsBound = false;

  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;
    els.featureMapGrid?.addEventListener("click", handleFeatureMapAction);
  }

  function handleFeatureMapAction(event) {
    const button = event.target?.closest?.("[data-feature-action]");
    if (!button) return false;
    const feature = getFeatureByAction(button.dataset?.featureAction);
    if (!feature) return false;
    activateFeature(feature.action);
    return true;
  }

  function activateFeature(action) {
    const focusLater = (element) => {
      const focus = () => element?.focus?.({ preventScroll: false });
      if (windowRef?.setTimeout) windowRef.setTimeout(focus, 0);
      else focus();
    };
    if (action === "documents") {
      switchMainView("editor");
      focusLater(els.searchInput);
      return true;
    }
    if (action === "editor") {
      switchMainView("editor");
      focusLater(els.contentEditor);
      return true;
    }
    if (action === "writer-use") {
      switchMainView("editor");
      switchTab("style");
      focusLater(els.styleList || els.newStyleBtn);
      return true;
    }
    if (action === "writer-build") {
      switchMainView("editor");
      switchTab("style");
      els.newStyleBtn?.click?.();
      return true;
    }
    if (action === "draft") {
      switchMainView("editor");
      switchTab("generate");
      focusLater(els.generatePrompt);
      return true;
    }
    if (action === "ppt") {
      switchMainView("ppt");
      focusLater(els.pptPromptInput);
      return true;
    }
    if (action === "cloud-sync") {
      switchMainView("cloud");
      focusLater(els.cloudSaveDocBtn);
      return true;
    }
    if (action === "billing") {
      switchMainView("cloud");
      focusLater(els.cloudManualPackageSelect);
      return true;
    }
    if (action === "admin") {
      return openStandaloneAdminPage();
    }
    return false;
  }

  return {
    bindEvents,
    handleFeatureMapAction,
    activateFeature,
  };
}
