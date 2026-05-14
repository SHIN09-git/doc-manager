export function showToast(container, message, tone = "info") {
  if (!container) return;
  const item = document.createElement("div");
  const normalizedTone = tone === "error" ? "error" : tone === "warn" ? "warn" : "info";
  item.className = `toast ${normalizedTone}`;
  item.setAttribute("role", normalizedTone === "error" ? "alert" : "status");
  item.innerHTML = `
    <span class="toast-dot" aria-hidden="true"></span>
    <span class="toast-message"></span>
    <button class="toast-close" type="button" aria-label="关闭通知">
      <i data-lucide="x"></i>
    </button>
  `;
  item.querySelector(".toast-message").textContent = message;
  item.querySelector(".toast-close").addEventListener("click", () => item.remove());
  container.appendChild(item);
  if (window.lucide) window.lucide.createIcons();
  window.setTimeout(() => {
    item.classList.add("leaving");
    window.setTimeout(() => item.remove(), 180);
  }, 3600);
}
