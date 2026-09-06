import { sanitizeColor, sanitizeName } from "../state/profile-storage.js";

export function createLiveCursorRenderer({ canvas, container, view, localSessionId }) {
  return function renderLiveCursors(presence = {}) {
    container.replaceChildren();

    const width = container.clientWidth;
    const height = container.clientHeight;
    const canvasRect = canvas.getBoundingClientRect();
    const cursorRect = container.getBoundingClientRect();
    const canvasOffsetX = canvasRect.left - cursorRect.left;
    const canvasOffsetY = canvasRect.top - cursorRect.top;

    for (const [sessionId, user] of Object.entries(presence)) {
      if (sessionId === localSessionId || !user?.cursor || user.cursor.active !== true) {
        continue;
      }

      const worldX = Number(user.cursor.x);
      const worldY = Number(user.cursor.y);
      if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) {
        continue;
      }

      const screenX = worldX * view.scale + view.offsetX + canvasOffsetX;
      const screenY = worldY * view.scale + view.offsetY + canvasOffsetY;
      if (screenX < -50 || screenY < -50 || screenX > width + 50 || screenY > height + 50) {
        continue;
      }

      const cursor = document.createElement("div");
      cursor.className = "cursor";
      cursor.style.left = `${screenX}px`;
      cursor.style.top = `${screenY}px`;
      cursor.style.setProperty("--cursor-color", sanitizeColor(user.color));

      const dot = document.createElement("div");
      dot.className = "cursor-dot";

      const label = document.createElement("div");
      label.className = "cursor-label";
      label.textContent = sanitizeName(user.name) || "Guest";

      cursor.append(dot, label);
      container.append(cursor);
    }
  };
}
