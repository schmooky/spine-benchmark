export function toast(message: string, duration = 4000) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;

  toast.addEventListener("click", () => {
    hideToast(toast);
  });

  document.body.appendChild(toast);

  setTimeout(() => {
    hideToast(toast);
  }, duration);
}

function hideToast(toast: HTMLElement) {
  toast.classList.add("hide");
  setTimeout(() => {
    document.body.removeChild(toast);
  }, 500);
}
