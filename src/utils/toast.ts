export function toast(message: string, duration = 4000) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;

  toast.addEventListener("click", () => {
      hideToast(toast);
  });

  // Find or create the toast container
  let container = document.getElementById("toast-container");
  if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      document.body.appendChild(container);
  }

  // Append the toast to the container
  container.appendChild(toast);

  setTimeout(() => {
      hideToast(toast);
  }, duration);
}

function hideToast(toast: HTMLElement) {
  toast.classList.add("hide");
  setTimeout(() => {
      toast?.parentElement?.removeChild(toast);
  }, 500);
}