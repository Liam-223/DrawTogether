import { clamp } from "../core/shared-utils.js";

function loadViewState(storageKey, minZoom, maxZoom) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    const scale = Number(parsed.scale);
    const offsetX = Number(parsed.offsetX);
    const offsetY = Number(parsed.offsetY);

    if (!Number.isFinite(scale) || !Number.isFinite(offsetX) || !Number.isFinite(offsetY)) {
      return null;
    }

    return {
      scale: clamp(scale, minZoom, maxZoom),
      offsetX,
      offsetY
    };
  } catch {
    return null;
  }
}

function saveViewState(storageKey, view) {
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        scale: view.scale,
        offsetX: view.offsetX,
        offsetY: view.offsetY
      })
    );
  } catch {
    // Ignore unavailable or full local storage.
  }
}

export {
  loadViewState,
  saveViewState
};
