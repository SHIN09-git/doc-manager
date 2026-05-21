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

  function showProgress(message, progress = 0, options = {}) {
    closeProgress(getCurrent());
    const progressBar = document.createElement("div");
    progressBar.className = "progress-bar";
    progressBar.setAttribute("role", "status");
    progressBar.setAttribute("aria-live", "polite");
    progressBar.innerHTML = `
      <div class="progress-row">
        <div class="progress-message"></div>
        <div class="progress-actions">
          <button class="progress-cancel" type="button" hidden>取消</button>
          <div class="progress-percent"></div>
        </div>
      </div>
      <div class="progress-track">
        <div class="progress-fill"></div>
      </div>
    `;
    const cancelButton = progressBar.querySelector(".progress-cancel");
    if (typeof options.onCancel === "function") {
      cancelButton.hidden = false;
      cancelButton.addEventListener("click", () => {
        cancelButton.disabled = true;
        cancelButton.textContent = "正在取消";
        options.onCancel();
      });
    }
    const host = document.querySelector(".editor-feedback-region") || document.body;
    host.appendChild(progressBar);
    setCurrent(progressBar);
    updateProgress(progressBar, message, progress);
    return progressBar;
  }

  async function withProgress(message, task, initialProgress = 8, options = {}) {
    const progress = showProgress(message, initialProgress, options);
    const controls = {
      update: (nextMessage, nextProgress) => updateProgress(progress, nextMessage, nextProgress),
      signal: options.signal || null,
      cancel: options.onCancel || null,
    };
    let completed = false;
    try {
      const result = await task(controls);
      completed = true;
      return result;
    } catch (error) {
      updateProgress(progress, options.signal?.aborted ? "已取消本次操作" : "操作未完成", 100);
      throw error;
    } finally {
      if (completed) updateProgress(progress, "完成收尾", 100);
      window.setTimeout(() => closeProgress(progress), completed ? 250 : 650);
    }
  }

  return {
    closeProgress,
    showProgress,
    updateProgress,
    withProgress,
  };
}
