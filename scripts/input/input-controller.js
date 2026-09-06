import { clamp } from "../core/shared-utils.js";
import { createKeyboardController } from "./keyboard-controller.js";
import {
  createStrokePoint,
  getPenPressure,
  getPointerPosition,
  isInsideBoard,
  pointerDistance,
  pointerMidpoint
} from "./pointer-utils.js";

const AIRBRUSH_POINT_SPACING_MULTIPLIER = 2.6;
const MIN_POINT_SPACING_SCALE = 0.25;

export function createInputController({
  ui,
  viewport,
  board,
  tools,
  session,
  history,
  rendering,
  persistence,
  shortcuts,
  identity,
  environment = {}
}) {
  const {
    canvas,
    resetViewBtn,
    shortcutsDialog,
    mouseCoordinates,
    zoomPercentage
  } = ui;
  const {
    view,
    minZoom,
    maxZoom,
    wheelZoomSensitivity,
    clampView,
    centerView,
    scheduleViewStateSave,
    syncCameraMoveHintTimer
  } = viewport;
  const {
    boardWidth,
    boardHeight,
    strokePointMinDistanceSq,
    minPressure,
    brushResizePixelsPerStep
  } = board;
  const {
    getActiveTool,
    setActiveTool,
    getColor,
    getBrushSize,
    setBrushSize,
    pickCanvasColor,
    hideBrushPreview,
    updateBrushPreview
  } = tools;
  const {
    isBoardExpired,
    queuePresenceSync,
    queueLiveStrokeSync,
    clearLiveStroke,
    publishOrApplyEvent
  } = session;
  const {
    onUndo,
    onRedo
  } = history;
  const {
    redrawScene
  } = rendering;
  const {
    saveViewState
  } = persistence;
  const {
    keyboardToolShortcuts
  } = shortcuts;
  const {
    localUserId
  } = identity;
  const {
    documentRef = document,
    windowRef = window
  } = environment;

  let cursorState = { x: boardWidth / 2, y: boardHeight / 2, active: false };
  let drawing = false;
  let currentStroke = null;
  let drawingPointerId = null;
  let isPanning = false;
  let panPointerId = null;
  let panLastX = 0;
  let panLastY = 0;
  let isBrushResizeMode = false;
  let brushResizePointerId = null;
  let brushResizeAnchorX = 0;
  let brushResizeAnchorY = 0;
  let brushResizeRemainderPx = 0;
  let brushResizeLastClientX = 0;
  const activePointers = new Map();
  let isTouchGesture = false;
  let gestureStartDistance = 1;
  let gestureStartScale = 1;
  let gestureWorldAnchorX = 0;
  let gestureWorldAnchorY = 0;
  let hasPreviewPointer = false;
  let previewClientX = 0;
  let previewClientY = 0;
  let redrawFrameId = null;

  function queueRedrawScene() {
    if (redrawFrameId !== null) {
      return;
    }

    if (typeof windowRef.requestAnimationFrame !== "function") {
      redrawScene();
      return;
    }

    redrawFrameId = windowRef.requestAnimationFrame(() => {
      redrawFrameId = null;
      redrawScene();
    });
  }

  function flushQueuedRedrawScene() {
    if (redrawFrameId === null) {
      return;
    }

    if (typeof windowRef.cancelAnimationFrame === "function") {
      windowRef.cancelAnimationFrame(redrawFrameId);
    }
    redrawFrameId = null;
    redrawScene();
  }

  function getCursorState() {
    return { ...cursorState };
  }

  function isDrawing() {
    return drawing;
  }

  function getCurrentStroke() {
    return currentStroke;
  }

  function getPreviewState() {
    return {
      hasPreviewPointer,
      previewClientX,
      previewClientY
    };
  }

  function getInteractionState() {
    return {
      isTouchGesture,
      isPanning
    };
  }

  function updateZoomPercentage() {
    if (!zoomPercentage) {
      return;
    }

    const exactPercentage = view.scale * 100;
    const percentage = Math.round(exactPercentage);
    const isNormalView = Math.abs(view.scale - 1) < 0.0001;

    zoomPercentage.textContent = percentage === 100 && !isNormalView
      ? `${exactPercentage.toFixed(1)}%`
      : `${percentage}%`;
    zoomPercentage.hidden = isNormalView;
  }

  function updateMouseCoordinates() {
    if (!mouseCoordinates) {
      return;
    }

    if (!cursorState.active) {
      mouseCoordinates.textContent = "x: -- y: --";
      mouseCoordinates.classList.remove("is-outside");
      return;
    }

    const x = Math.round(cursorState.x);
    const y = Math.round(cursorState.y);
    mouseCoordinates.textContent = `x: ${x} y: ${y}`;
    mouseCoordinates.classList.toggle("is-outside", !isInsideBoard(cursorState.x, cursorState.y, boardWidth, boardHeight));
  }

  function beginTouchGesture() {
    if (activePointers.size < 2) {
      return;
    }

    const [firstPointer, secondPointer] = activePointers.values();
    const rect = canvas.getBoundingClientRect();
    const midpoint = pointerMidpoint(firstPointer, secondPointer);

    isTouchGesture = true;
    if (drawing || currentStroke) {
      clearLiveStroke();
    }
    drawing = false;
    currentStroke = null;
    drawingPointerId = null;
    canvas.classList.add("is-panning");

    gestureStartDistance = Math.max(1, pointerDistance(firstPointer, secondPointer));
    gestureStartScale = view.scale;
    gestureWorldAnchorX = (midpoint.clientX - rect.left - view.offsetX) / view.scale;
    gestureWorldAnchorY = (midpoint.clientY - rect.top - view.offsetY) / view.scale;
  }

  function updateTouchGesture() {
    if (!isTouchGesture || activePointers.size < 2) {
      return;
    }

    const [firstPointer, secondPointer] = activePointers.values();
    const rect = canvas.getBoundingClientRect();
    const midpoint = pointerMidpoint(firstPointer, secondPointer);
    const distance = Math.max(1, pointerDistance(firstPointer, secondPointer));
    const scaleFactor = distance / gestureStartDistance;

    view.scale = clamp(gestureStartScale * scaleFactor, minZoom, maxZoom);
    view.offsetX = midpoint.clientX - rect.left - gestureWorldAnchorX * view.scale;
    view.offsetY = midpoint.clientY - rect.top - gestureWorldAnchorY * view.scale;

    clampView();
    updateZoomPercentage();
    queueRedrawScene();
    scheduleViewStateSave();
    syncCameraMoveHintTimer();
  }

  function deactivateCursorAndPreview(syncImmediately = true) {
    cursorState = { ...cursorState, active: false };
    updateMouseCoordinates();
    queuePresenceSync(syncImmediately);
    hasPreviewPointer = false;
    hideBrushPreview();
  }

  function startBrushResizeMode(event) {
    isBrushResizeMode = true;
    brushResizePointerId = event.pointerId;
    brushResizeAnchorX = event.clientX;
    brushResizeAnchorY = event.clientY;
    brushResizeLastClientX = event.clientX;
    brushResizeRemainderPx = 0;
    if (drawing || currentStroke) {
      clearLiveStroke();
    }
    drawing = false;
    currentStroke = null;
    isPanning = false;
    panPointerId = null;
    canvas.classList.remove("is-panning");
    hasPreviewPointer = true;
    previewClientX = brushResizeAnchorX;
    previewClientY = brushResizeAnchorY;
    updateBrushPreview();

    if (documentRef.pointerLockElement !== canvas && canvas.requestPointerLock) {
      canvas.requestPointerLock();
    }
  }

  function stopBrushResizeMode() {
    if (!isBrushResizeMode) {
      return;
    }

    isBrushResizeMode = false;
    brushResizePointerId = null;
    brushResizeRemainderPx = 0;

    if (documentRef.pointerLockElement === canvas && documentRef.exitPointerLock) {
      documentRef.exitPointerLock();
    }
  }

  function handleBrushResizeMove(event) {
    if (!isBrushResizeMode) {
      return;
    }

    event.preventDefault();

    let deltaX = 0;
    if (documentRef.pointerLockElement === canvas) {
      deltaX = event.movementX;
    } else {
      deltaX = event.clientX - brushResizeLastClientX;
      brushResizeLastClientX = event.clientX;
    }

    brushResizeRemainderPx += deltaX;
    const stepDelta = brushResizeRemainderPx / brushResizePixelsPerStep;
    const wholeSteps = stepDelta < 0 ? Math.ceil(stepDelta) : Math.floor(stepDelta);

    if (wholeSteps !== 0) {
      setBrushSize(getBrushSize() + wholeSteps);
      brushResizeRemainderPx -= wholeSteps * brushResizePixelsPerStep;
    }

    hasPreviewPointer = true;
    previewClientX = brushResizeAnchorX;
    previewClientY = brushResizeAnchorY;
    updateBrushPreview();
  }

  function handlePointerDown(event) {
    if (isBoardExpired()) {
      return;
    }

    activePointers.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY,
      pointerType: event.pointerType
    });

    if (event.pointerType === "mouse" && event.button !== 0 && event.button !== 1) {
      return;
    }

    if (event.pointerType === "touch") {
      canvas.setPointerCapture(event.pointerId);

      if (activePointers.size >= 2) {
        beginTouchGesture();
        cursorState = { ...cursorState, active: false };
        updateMouseCoordinates();
        queuePresenceSync(true);
        return;
      }
    }

    if (drawing && event.pointerId !== drawingPointerId) {
      return;
    }

    if (event.button === 1 || (event.button === 0 && keyboardController.isSpacePressed())) {
      event.preventDefault();
      isPanning = true;
      panPointerId = event.pointerId;
      panLastX = event.clientX;
      panLastY = event.clientY;
      canvas.classList.add("is-panning");
      canvas.setPointerCapture(event.pointerId);
      hideBrushPreview();
      return;
    }

    if (event.pointerType === "mouse" && event.button === 0 && keyboardController.isShiftPressed()) {
      canvas.setPointerCapture(event.pointerId);
      startBrushResizeMode(event);
      return;
    }

    if (event.button === 0 && getActiveTool() === "pipette") {
      pickCanvasColor(event);
      return;
    }

    drawing = true;
    drawingPointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);

    const start = getPointerPosition(canvas, event, view);
    if (!isInsideBoard(start.worldX, start.worldY, boardWidth, boardHeight)) {
      drawing = false;
      currentStroke = null;
      drawingPointerId = null;
      return;
    }

    const clampedStart = createStrokePoint(start.worldX, start.worldY, getPenPressure(event, minPressure), boardWidth, boardHeight, minPressure);
    cursorState = { x: start.worldX, y: start.worldY, active: true };
    updateMouseCoordinates();
    queuePresenceSync();
    currentStroke = {
      type: "stroke",
      id: crypto.randomUUID(),
      userId: localUserId,
      pointerType: event.pointerType,
      tool: getActiveTool(),
      color: getColor(),
      size: getBrushSize(),
      points: [clampedStart]
    };
    queueLiveStrokeSync(true);
  }

  function handlePointerMove(event) {
    if (activePointers.has(event.pointerId)) {
      activePointers.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
        pointerType: event.pointerType
      });
    }

    if (isTouchGesture) {
      hideBrushPreview();
      updateTouchGesture();
      return;
    }

    if (isBrushResizeMode) {
      hasPreviewPointer = true;
      previewClientX = brushResizeAnchorX;
      previewClientY = brushResizeAnchorY;
      updateBrushPreview();
      return;
    }

    hasPreviewPointer = event.pointerType !== "touch";
    previewClientX = event.clientX;
    previewClientY = event.clientY;
    updateBrushPreview();

    const point = getPointerPosition(canvas, event, view);
    cursorState = { x: point.worldX, y: point.worldY, active: true };
    updateMouseCoordinates();
    queuePresenceSync();

    if (isPanning && event.pointerId === panPointerId) {
      const dx = event.clientX - panLastX;
      const dy = event.clientY - panLastY;
      panLastX = event.clientX;
      panLastY = event.clientY;
      view.offsetX += dx;
      view.offsetY += dy;
      clampView();
      queueRedrawScene();
      scheduleViewStateSave();
      syncCameraMoveHintTimer();
      hideBrushPreview();
      return;
    }

    if (!drawing || !currentStroke || event.pointerId !== drawingPointerId) {
      return;
    }

    const worldPoint = createStrokePoint(point.worldX, point.worldY, getPenPressure(event, minPressure), boardWidth, boardHeight, minPressure);
    const last = currentStroke.points[currentStroke.points.length - 1];
    const dx = worldPoint.x - last.x;
    const dy = worldPoint.y - last.y;
    const minDistanceSq = strokePointMinDistanceSq / Math.max(view.scale, MIN_POINT_SPACING_SCALE);
    const spacingMultiplier = currentStroke.tool === "airbrush"
      ? AIRBRUSH_POINT_SPACING_MULTIPLIER
      : 1;

    if (dx * dx + dy * dy > minDistanceSq * spacingMultiplier) {
      currentStroke.points.push(worldPoint);
      queueLiveStrokeSync();
      queueRedrawScene();
    }
  }

  function handlePointerUp(event) {
    activePointers.delete(event.pointerId);

    if (isBrushResizeMode && event.pointerId === brushResizePointerId) {
      stopBrushResizeMode();
      return;
    }

    if (isTouchGesture) {
      if (activePointers.size >= 2) {
        updateTouchGesture();
        return;
      }

      isTouchGesture = false;
      canvas.classList.remove("is-panning");
      cursorState = { ...cursorState, active: false };
      updateMouseCoordinates();
      queuePresenceSync(true);
      updateBrushPreview();
      return;
    }

    if (isPanning && event.pointerId === panPointerId) {
      isPanning = false;
      panPointerId = null;
      canvas.classList.remove("is-panning");
      updateBrushPreview();
      return;
    }

    if (!drawing || !currentStroke || event.pointerId !== drawingPointerId) {
      return;
    }

    flushQueuedRedrawScene();
    drawing = false;
    drawingPointerId = null;

    const pointer = getPointerPosition(canvas, event, view);
    cursorState = { x: pointer.worldX, y: pointer.worldY, active: true };
    updateMouseCoordinates();
    queuePresenceSync(true);

    queueLiveStrokeSync(true);
    const finishedStroke = currentStroke;
    currentStroke = null;

    if (finishedStroke.points.length > 1) {
      Promise.resolve(publishOrApplyEvent(finishedStroke)).finally(clearLiveStroke);
    } else {
      clearLiveStroke();
    }
  }

  function handlePointerCancel() {
    activePointers.clear();
    if (drawing || currentStroke) {
      clearLiveStroke();
    }
    drawing = false;
    currentStroke = null;
    drawingPointerId = null;
    stopBrushResizeMode();
    isPanning = false;
    isTouchGesture = false;
    panPointerId = null;
    canvas.classList.remove("is-panning");
    deactivateCursorAndPreview(true);
  }

  function handlePointerLeave() {
    deactivateCursorAndPreview(true);
  }

  function handleWheel(event) {
    event.preventDefault();

    const pointer = getPointerPosition(canvas, event, view);
    const oldScale = view.scale;
    const zoomDelta = Math.exp(-event.deltaY * wheelZoomSensitivity);
    const nextScale = clamp(oldScale * zoomDelta, minZoom, maxZoom);

    if (nextScale === oldScale) {
      return;
    }

    view.scale = nextScale;
    view.offsetX = pointer.x - pointer.worldX * view.scale;
    view.offsetY = pointer.y - pointer.worldY * view.scale;
    clampView();
    updateZoomPercentage();
    queueRedrawScene();
    scheduleViewStateSave();
    syncCameraMoveHintTimer();
  }

  function handleResetView() {
    view.scale = 1;
    centerView();
    updateZoomPercentage();
    redrawScene();
    scheduleViewStateSave();
    syncCameraMoveHintTimer();
  }

  const keyboardController = createKeyboardController({
    canvas,
    shortcutsDialog,
    keyboardToolShortcuts,
    setActiveTool,
    onUndo,
    onRedo,
    stopBrushResizeMode,
    endPan() {
      if (!isPanning) {
        return;
      }

      isPanning = false;
      panPointerId = null;
      canvas.classList.remove("is-panning");
    }
  });

  function bindEvents(viewStorageKey) {
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerCancel);
    canvas.addEventListener("pointerleave", handlePointerLeave);
    canvas.addEventListener("wheel", handleWheel, { passive: false });

    resetViewBtn.addEventListener("click", handleResetView);
    windowRef.addEventListener("beforeunload", () => saveViewState(viewStorageKey, view));
    windowRef.addEventListener("keydown", keyboardController.handleKeyDown);
    windowRef.addEventListener("keyup", keyboardController.handleKeyUp);
    windowRef.addEventListener("blur", keyboardController.handleWindowBlur);
    documentRef.addEventListener("mousemove", handleBrushResizeMove);

    updateMouseCoordinates();
    updateZoomPercentage();
  }

  return {
    bindEvents,
    getCursorState,
    getCurrentStroke,
    getInteractionState,
    getPreviewState,
    isDrawing
  };
}
