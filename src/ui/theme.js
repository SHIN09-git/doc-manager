const THEME_STORAGE_KEY = "school-doc-manager:theme";

export function initThemeToggle(button, root = document.documentElement, env = {}) {
  const windowRef = env.window || globalThis.window;
  const storage = env.storage || globalThis.localStorage;
  const mediaQuery = windowRef?.matchMedia?.("(prefers-color-scheme: dark)");
  const readSavedTheme = () => {
    try {
      return storage?.getItem?.(THEME_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  };
  const getSystemTheme = () => (mediaQuery?.matches ? "dark" : "light");
  const setTheme = (theme, persist = false) => {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    if (persist) {
      try {
        storage?.setItem?.(THEME_STORAGE_KEY, theme);
      } catch {
        // Theme persistence is optional in restricted browser contexts.
      }
    }
    if (button) {
      button.setAttribute("aria-label", theme === "dark" ? "切换到浅色模式" : "切换到深色模式");
      button.title = theme === "dark" ? "切换到浅色模式" : "切换到深色模式";
    }
  };

  const savedTheme = readSavedTheme();
  setTheme(savedTheme || root.dataset.theme || getSystemTheme());

  button?.addEventListener("click", () => {
    const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
    root.classList.add("theme-transitioning");
    setTheme(nextTheme, true);
    windowRef?.setTimeout?.(() => root.classList.remove("theme-transitioning"), 300);
  });

  mediaQuery?.addEventListener("change", (event) => {
    if (!readSavedTheme()) {
      setTheme(event.matches ? "dark" : "light");
    }
  });
}
