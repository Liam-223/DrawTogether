import { clamp } from "../core/shared-utils.js";
import { saveViewState } from "../state/view-state-storage.js";

export function createCameraController({
  canvas,
  ctx,
  view,
  boardWidth,
  boardHeight,
  edgePadding,
  moveHint,
  moveHintDelayMs,
  viewStorageKey,
  initialized = false,
  getBoardExpired,
  redrawScene
}) {
  let canvasPixelRatio = window.devicePixelRatio || 1;
  let hasInitializedView = initialized;
  let persistTimeoutId = null;
  let moveHintTimeoutId = null;

  function clampOffset(viewportSize, contentSize, preferredOffset) {
    if (contentSize + edgePadding * 2 <= viewportSize) {
      return (viewportSize - contentSize) / 2;
    }

    return clamp(preferredOffset, viewportSize - contentSize - edgePadding, edgePadding);
  }

  function clampView() {
    const rect = canvas.getBoundingClientRect();
    view.offsetX = clampOffset(rect.width, boardWidth * view.scale, view.offsetX);
    view.offsetY = clampOffset(rect.height, boardHeight * view.scale, view.offsetY);
  }

  function centerView() {
    const rect = canvas.getBoundingClientRect();
    view.offsetX = (rect.width - boardWidth * view.scale) / 2;
    view.offsetY = (rect.height - boardHeight * view.scale) / 2;
    clampView();
  }

  function scheduleViewStateSave() {
    if (persistTimeoutId) {
      return;
    }

    persistTimeoutId = setTimeout(() => {
      persistTimeoutId = null;
      saveViewState(viewStorageKey, view);
    }, 120);
  }

  function saveNow() {
    saveViewState(viewStorageKey, view);
  }

  function clearMoveHintTimer() {
    if (!moveHintTimeoutId) {
      return;
    }

    clearTimeout(moveHintTimeoutId);
    moveHintTimeoutId = null;
  }

  function hideMoveHint() {
    if (!moveHint) {
      return;
    }

    moveHint.classList.remove("is-visible");
    moveHint.hidden = true;
  }

  function getDefaultOffsets() {
    const rect = canvas.getBoundingClientRect();
    return {
      offsetX: clampOffset(rect.width, boardWidth, (rect.width - boardWidth) / 2),
      offsetY: clampOffset(rect.height, boardHeight, (rect.height - boardHeight) / 2)
    };
  }

  function isAtDefaultPosition() {
    if (Math.abs(view.scale - 1) > 0.0001) {
      return false;
    }

    const defaults = getDefaultOffsets();
    const epsilon = 0.75;
    return (
      Math.abs(view.offsetX - defaults.offsetX) <= epsilon &&
      Math.abs(view.offsetY - defaults.offsetY) <= epsilon
    );
  }

  function syncMoveHintTimer() {
    if (!moveHint) {
      return;
    }

    clearMoveHintTimer();

    if (getBoardExpired() || !isAtDefaultPosition()) {
      hideMoveHint();
      return;
    }

    moveHintTimeoutId = setTimeout(() => {
      moveHintTimeoutId = null;
      if (getBoardExpired() || !isAtDefaultPosition()) {
        hideMoveHint();
        return;
      }

      moveHint.hidden = false;
      moveHint.classList.add("is-visible");
    }, moveHintDelayMs);
  }

  function resizeCanvas() {
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvasPixelRatio = ratio;

    canvas.width = Math.floor(rect.width * ratio);
    canvas.height = Math.floor(rect.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    if (!hasInitializedView) {
      centerView();
      hasInitializedView = true;
    } else {
      clampView();
    }

    scheduleViewStateSave();
    syncMoveHintTimer();
    redrawScene();
  }

  return {
    bind() {
      window.addEventListener("resize", resizeCanvas);
    },
    centerView,
    clampView,
    clearMoveHintTimer,
    getCanvasPixelRatio: () => canvasPixelRatio,
    hideMoveHint,
    resizeCanvas,
    saveNow,
    scheduleViewStateSave,
    syncMoveHintTimer
  };
}
