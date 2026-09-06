const DEFAULT_DURATION_MS = 3200;
const MAX_VISIBLE_NOTIFICATIONS = 3;

function createBoardNotificationCenter({ container }) {
  const host = container || document.body;

  function trimOverflow() {
    while (host.children.length > MAX_VISIBLE_NOTIFICATIONS) {
      host.firstElementChild?.remove();
    }
  }

  function show({ message, tone = "info", durationMs = DEFAULT_DURATION_MS }) {
    const text = String(message || "").trim();
    if (!text) {
      return;
    }

    const notification = document.createElement("div");
    notification.className = `board-notification is-${tone}`;
    notification.textContent = text;
    notification.setAttribute("role", "status");

    host.append(notification);
    trimOverflow();

    const hideDelay = Math.max(800, Number(durationMs) || DEFAULT_DURATION_MS);
    const hideTimer = setTimeout(() => {
      notification.classList.add("is-hiding");
      setTimeout(() => {
        notification.remove();
      }, 220);
    }, hideDelay);

    return () => {
      clearTimeout(hideTimer);
      notification.remove();
    };
  }

  return {
    show,
    info(message, durationMs) {
      return show({ message, tone: "info", durationMs });
    },
    success(message, durationMs) {
      return show({ message, tone: "success", durationMs });
    },
    warning(message, durationMs) {
      return show({ message, tone: "warning", durationMs });
    }
  };
}

export { createBoardNotificationCenter };
