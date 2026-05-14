export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index > -1) callbacks.splice(index, 1);
  }

  emit(event, data) {
    if (!this.listeners.has(event)) return;
    this.listeners.get(event).slice().forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`EventBus listener failed for ${event}`, error);
      }
    });
  }

  clear() {
    this.listeners.clear();
  }
}

export const EVENTS = {
  RENDER_ALL: "render:all",
  RENDER_FOLDERS: "render:folders",
  RENDER_FOLDER_SELECT: "render:folder-select",
  RENDER_DOC_LIST: "render:doc-list",
  RENDER_EDITOR: "render:editor",
  RENDER_STYLE_SELECT: "render:style-select",
  RENDER_STYLE_EDITOR: "render:style-editor",
  RENDER_STYLE_EXAMPLES: "render:style-examples",
  RENDER_STYLE_LIST: "render:style-list",
  RENDER_SKILL_QUALITY: "render:skill-quality",
  RENDER_SKILL_TEST: "render:skill-test",
  RENDER_API_SETTINGS: "render:api-settings",
};

export const eventBus = new EventBus();
