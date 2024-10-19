export function toast(message: string, duration = 5000) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("hide");
    setTimeout(() => {
      document.body.removeChild(toast);
    }, 500);
  }, duration);
}
