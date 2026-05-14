const THEME_STORAGE_KEY = "school-doc-manager:theme";

export function initThemeToggle(button, root = document.documentElement) {
  const mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
  const getSystemTheme = () => (mediaQuery?.matches ? "dark" : "light");
  const setTheme = (theme, persist = false) => {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    if (persist) {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
    if (button) {
      button.setAttribute("aria-label", theme === "dark" ? "切换到浅色模式" : "切换到深色模式");
      button.title = theme === "dark" ? "切换到浅色模式" : "切换到深色模式";
    }
  };

  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  setTheme(savedTheme || root.dataset.theme || getSystemTheme());

  button?.addEventListener("click", () => {
    const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
    root.classList.add("theme-transitioning");
    setTheme(nextTheme, true);
    window.setTimeout(() => root.classList.remove("theme-transitioning"), 300);
  });

  mediaQuery?.addEventListener("change", (event) => {
    if (!localStorage.getItem(THEME_STORAGE_KEY)) {
      setTheme(event.matches ? "dark" : "light");
    }
  });
}
