export function createProgressController({ getCurrent, setCurrent }) {
  function closeProgress(progressBar) {
    if (!progressBar) return;
    progressBar.remove();
    if (getCurrent() === progressBar) setCurrent(null);
  }

  function updateProgress(progressBar, message, progress = 0) {
    if (!progressBar) return;
    const safeProgress = Math.max(0, Math.min(100, Number(progress) || 0));
    progressBar.querySelector(".progress-message").textContent = message || "处理中";
    progressBar.querySelector(".progress-percent").textContent = `${Math.round(safeProgress)}%`;
    progressBar.querySelector(".progress-fill").style.width = `${safeProgress}%`;
  }

  function showProgress(message, progress = 0) {
    closeProgress(getCurrent());
    const progressBar = document.createElement("div");
    progressBar.className = "progress-bar";
    progressBar.setAttribute("role", "status");
    progressBar.setAttribute("aria-live", "polite");
    progressBar.innerHTML = `
      <div class="progress-row">
        <div class="progress-message"></div>
        <div class="progress-percent"></div>
      </div>
      <div class="progress-track">
        <div class="progress-fill"></div>
      </div>
    `;
    const host = document.querySelector(".editor-feedback-region") || document.body;
    host.appendChild(progressBar);
    setCurrent(progressBar);
    updateProgress(progressBar, message, progress);
    return progressBar;
  }

  async function withProgress(message, task, initialProgress = 8) {
    const progress = showProgress(message, initialProgress);
    try {
      return await task({
        update: (nextMessage, nextProgress) => updateProgress(progress, nextMessage, nextProgress),
      });
    } finally {
      updateProgress(progress, "完成收尾", 100);
      window.setTimeout(() => closeProgress(progress), 250);
    }
  }

  return {
    closeProgress,
    showProgress,
    updateProgress,
    withProgress,
  };
}
