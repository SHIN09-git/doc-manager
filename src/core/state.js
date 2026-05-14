export function createStateContainer(initialState = {}) {
  const state = initialState;
  const ui = {
    selectedFolderId: state.selectedFolderId || "all",
    selectedDocId: state.selectedDocId || null,
    editingStyle: null,
    mentionTarget: null,
    mentionRange: null,
    saveTimer: null,
    searchTimer: null,
    persistPromise: Promise.resolve(),
    progressElement: null,
    generatedDraft: "",
  };

  return {
    state,
    ui,
  };
}
