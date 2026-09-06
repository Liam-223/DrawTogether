import { firebaseConfig } from "./firebase-config.js";
import {
  airbrushToolBtn,
  boardCodePill,
  boardCodeValue,
  boardMenu,
  boardNotifications,
  boardActionCancelBtn,
  boardActionConfirmBtn,
  boardActionDialog,
  boardActionForm,
  boardActionInput,
  boardActionInputLabel,
  boardActionInputWrap,
  boardActionMessage,
  boardActionTitle,
  boardExpiryTimer,
  brushPreview,
  cancelExportBtn,
  cancelSettingsBtn,
  canvas,
  cameraMoveHint,
  clearBoardBtn,
  colorPicker,
  connectionStatus,
  copyInviteBtn,
  ctx,
  displayNameInput,
  drawToolBtn,
  drawingControls,
  eraserToolBtn,
  exportAreaSelect,
  exportBackgroundSelect,
  exportDialog,
  exportFileNameInput,
  exportIncludeGridInput,
  exportPngForm,
  exportResolutionHint,
  exportPngSettingsBtn,
  identityColorInput,
  joinBoardBtn,
  liveCursors,
  openBoardsCount,
  mouseCoordinates,
  loadingScreen,
  mobileMenuBtn,
  newBoardBtn,
  palette,
  peerCount,
  pipetteToolBtn,
  redoBtn,
  resetViewBtn,
  retryConnectBtn,
  rootElement,
  settingsBtn,
  settingsDialog,
  settingsForm,
  showFooterContactInput,
  showPatternInput,
  showQuickColorsInput,
  shortcutsDialog,
  sizeSlider,
  sizeValue,
  topbar,
  undoBtn,
  zoomPercentage
} from "./scripts/ui/dom-elements.js";
import {
  BOARD_EDGE_PADDING,
  BOARD_HEIGHT,
  BOARD_TTL_MS,
  BOARD_WIDTH,
  BRUSH_RESIZE_PIXELS_PER_STEP,
  CAMERA_MOVE_HINT_DELAY_MS,
  CLEAR_COUNTDOWN_SECONDS,
  DEFAULT_BRUSH_SIZE,
  MAX_BRUSH_SIZE,
  MAX_ZOOM,
  MIN_BRUSH_SIZE,
  MIN_ZOOM,
  PRESENCE_THROTTLE_MS,
  STROKE_POINT_MIN_DISTANCE_SQ,
  WHEEL_ZOOM_SENSITIVITY,
  applyRuntimeCssVariables
} from "./scripts/core/runtime-config.js";
import { loadProfile } from "./scripts/state/profile-storage.js";
import {
  countOnlineUsers,
  generateBoardId,
  getBoardId
} from "./scripts/core/shared-utils.js";
import { isFirebaseConfigReady } from "./scripts/ui/connection-ui.js";
import { createExportController } from "./scripts/export/export-controller.js";
import { createToolUiController } from "./scripts/ui/tool-ui-controller.js";
import { loadViewState } from "./scripts/state/view-state-storage.js";
import { createBoardNotificationCenter } from "./scripts/ui/board-notifications.js";
import { createClearEventNotifier } from "./scripts/ui/clear-event-notifications.js";
import { createBoardAccessController } from "./scripts/access/board-access-controller.js";
import { createSceneRenderer } from "./scripts/rendering/scene-renderer.js";
import { createBoardSessionController } from "./scripts/session/board-session-controller.js";
import { createInputController } from "./scripts/input/input-controller.js";
import { createCameraController } from "./scripts/view/camera-controller.js";
import { createSettingsController } from "./scripts/ui/settings-controller.js";
import { createLiveCursorRenderer } from "./scripts/ui/live-cursor-renderer.js";
import { createHistoryController } from "./scripts/history/history-controller.js";
import { createBoardStatusRenderer } from "./scripts/ui/board-status-renderer.js";
import { createMobileLayoutController } from "./scripts/ui/mobile-layout-controller.js";

applyRuntimeCssVariables(rootElement);

const view = {
  scale: 1,
  offsetX: 0,
  offsetY: 0
};

const boardId = getBoardId();
const inviteUrl = window.location.href;
let boardCodeVisible = false;
const VIEW_STORAGE_KEY_PREFIX = "drawtogether.view.v1";
const BOARD_ACCESS_SESSION_KEY_PREFIX = "drawtogether.board-access.v1";
const BOARD_ACCESS_CODE_PATTERN = /^[a-z0-9_-]{4,32}$/;
const CLEAR_NOTICE_SEEN_SESSION_KEY_PREFIX = "drawtogether.clear-notice-seen.v1";

function renderBoardCode() {
  boardCodeValue.textContent = boardId;
  boardCodePill.classList.toggle("is-revealed", boardCodeVisible);
  boardCodePill.setAttribute("aria-pressed", boardCodeVisible ? "true" : "false");
  boardCodePill.title = boardCodeVisible ? "Hide board code" : "Show board code";
}

boardCodePill.addEventListener("click", () => {
  boardCodeVisible = !boardCodeVisible;
  renderBoardCode();
});

renderBoardCode();

const localUserId = crypto.randomUUID();
const sessionId = crypto.randomUUID();
const joinedAt = Date.now();
let activeTool = "draw";
const sharedEvents = [];
let latestPresence = {};
let remoteLiveStrokes = [];
let profile = loadProfile(MIN_BRUSH_SIZE, MAX_BRUSH_SIZE, DEFAULT_BRUSH_SIZE);
const TOOL_BUTTONS = {
  draw: drawToolBtn,
  airbrush: airbrushToolBtn,
  eraser: eraserToolBtn,
  pipette: pipetteToolBtn
};
const DRAW_TOOLS = new Set(["draw", "airbrush"]);
const KEYBOARD_TOOL_SHORTCUTS = {
  b: "draw",
  e: "eraser",
  p: "pipette",
  a: "airbrush"
};
const BOARD_BACKGROUND_COLOR = "#f1f4f8";
const BOARD_SURFACE_COLOR = "#ffffff";
const BOARD_GRID_COLOR = "#e8edf3";
const MIN_PRESSURE = 0.12;
let boardSession = null;
const notifications = createBoardNotificationCenter({ container: boardNotifications });
const clearEventNotifier = createClearEventNotifier({
  boardId,
  localUserId,
  notifications,
  sessionKeyPrefix: CLEAR_NOTICE_SEEN_SESSION_KEY_PREFIX
});
const maybeNotifyForClearEvent = clearEventNotifier.maybeNotifyForClearEvent;

function invalidateSharedRenderCache() {
  sceneRenderer?.invalidateSharedRenderCache();
}

const viewStorageKey = `${VIEW_STORAGE_KEY_PREFIX}.${boardId}`;

let remoteRenderQueued = false;
let remoteRenderNeedsSharedInvalidation = false;

function queueRemoteRender(invalidateShared = true) {
  if (invalidateShared) {
    remoteRenderNeedsSharedInvalidation = true;
  }

  if (remoteRenderQueued) {
    return;
  }

  remoteRenderQueued = true;
  requestAnimationFrame(() => {
    remoteRenderQueued = false;

    if (boardSession?.isBoardExpired() === true) {
      remoteRenderNeedsSharedInvalidation = false;
      return;
    }

    if (remoteRenderNeedsSharedInvalidation) {
      invalidateSharedRenderCache();
      remoteRenderNeedsSharedInvalidation = false;
    }
    redrawScene();
  });
}

const persistedViewState = loadViewState(viewStorageKey, MIN_ZOOM, MAX_ZOOM);
if (persistedViewState) {
  view.scale = persistedViewState.scale;
  view.offsetX = persistedViewState.offsetX;
  view.offsetY = persistedViewState.offsetY;
}

const cameraController = createCameraController({
  canvas,
  ctx,
  view,
  boardWidth: BOARD_WIDTH,
  boardHeight: BOARD_HEIGHT,
  edgePadding: BOARD_EDGE_PADDING,
  moveHint: cameraMoveHint,
  moveHintDelayMs: CAMERA_MOVE_HINT_DELAY_MS,
  viewStorageKey,
  initialized: Boolean(persistedViewState),
  getBoardExpired: () => boardSession?.isBoardExpired() === true,
  redrawScene: () => redrawScene()
});

function applyProfileVisibility() {
  document.body.classList.toggle("palette-hidden", !profile.showQuickColors);
  document.body.classList.toggle("footer-hidden", !profile.showFooterContact);
  rootElement.classList.toggle("palette-hidden", !profile.showQuickColors);
  rootElement.classList.toggle("footer-hidden", !profile.showFooterContact);
}

function applyProfileToUI() {
  colorPicker.value = profile.color;
  identityColorInput.value = profile.color;
  displayNameInput.value = profile.name;
  showQuickColorsInput.checked = profile.showQuickColors;
  showPatternInput.checked = profile.showPattern;
  showFooterContactInput.checked = profile.showFooterContact;
  applyProfileVisibility();
}

applyProfileToUI();
rootElement.classList.remove("booting");

function dismissLoadingScreen() {
  if (!loadingScreen) {
    return;
  }

  loadingScreen.classList.add("is-hidden");
  setTimeout(() => {
    loadingScreen.remove();
  }, 200);
}

let loadingScreenDismissScheduled = false;

function scheduleLoadingScreenDismissAfterBoot() {
  if (loadingScreenDismissScheduled) {
    return;
  }

  loadingScreenDismissScheduled = true;
  setTimeout(dismissLoadingScreen, 120);
}

sizeSlider.min = String(MIN_BRUSH_SIZE);
sizeSlider.max = String(MAX_BRUSH_SIZE);

function navigateToBoard(nextBoardId) {
  const url = new URL(window.location.href);
  url.searchParams.set("board", nextBoardId);
  window.location.assign(url.toString());
}

const boardAccessController = createBoardAccessController({
  board: { boardId, inviteUrl },
  access: {
    boardAccessSessionKeyPrefix: BOARD_ACCESS_SESSION_KEY_PREFIX,
    boardAccessCodePattern: BOARD_ACCESS_CODE_PATTERN
  },
  navigateToBoard,
  actions: { newBoardBtn, joinBoardBtn, copyInviteBtn },
  dialog: {
    boardActionDialog,
    boardActionForm,
    boardActionInput,
    boardActionInputLabel,
    boardActionInputWrap,
    boardActionMessage,
    boardActionTitle,
    boardActionCancelBtn,
    boardActionConfirmBtn
  }
});
const {
  loadCachedBoardAccessCode,
  promptForBoardJoinCode,
  promptForOptionalNewBoardAccessCode,
  saveCachedBoardAccessCode,
  showBoardNotice
} = boardAccessController;

const boardStatus = createBoardStatusRenderer({
  firebaseConfig,
  connectionStatus,
  retryConnectButton: retryConnectBtn,
  boardExpiryTimer,
  openBoardsCount,
  getBoardSession: () => boardSession
});

let inputController = null;

const exportController = createExportController({
  canvas,
  board: { boardId, boardWidth: BOARD_WIDTH, boardHeight: BOARD_HEIGHT },
  dialogs: { getProfile: () => profile, settingsDialog, exportDialog },
  controls: {
    exportAreaSelect,
    exportIncludeGridInput,
    exportBackgroundSelect,
    exportFileNameInput,
    exportResolutionHint
  },
  getVisibleOps: () => sceneRenderer.getVisibleOps(),
  drawingApi: {
    isDrawing: () => inputController?.isDrawing() === true,
    getCurrentStroke: () => inputController?.getCurrentStroke() || null
  }
});

exportPngSettingsBtn.addEventListener("click", exportController.openExportDialog);
cancelExportBtn.addEventListener("click", exportController.closeExportDialog);
exportAreaSelect.addEventListener("change", exportController.updateExportResolutionHint);
exportPngForm.addEventListener("submit", (event) => {
  event.preventDefault();
  exportController.executePngExport();
  exportController.closeExportDialog();
});

exportDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  exportController.closeExportDialog();
});

const toolUiController = createToolUiController({
  ui: { canvas, ctx, palette, colorPicker, sizeSlider, sizeValue, brushPreview },
  tools: { toolButtons: TOOL_BUTTONS, drawTools: DRAW_TOOLS },
  brush: { minBrushSize: MIN_BRUSH_SIZE, maxBrushSize: MAX_BRUSH_SIZE },
  view,
  getProfile: () => profile,
  stateApi: {
    getUiState: () => {
      const interaction = inputController?.getInteractionState() || { isTouchGesture: false, isPanning: false };
      const preview = inputController?.getPreviewState() || {
        hasPreviewPointer: false,
        previewClientX: 0,
        previewClientY: 0
      };

      return {
        boardExpired: boardSession?.isBoardExpired() === true,
        isTouchGesture: interaction.isTouchGesture,
        isPanning: interaction.isPanning,
        hasPreviewPointer: preview.hasPreviewPointer,
        previewClientX: preview.previewClientX,
        previewClientY: preview.previewClientY
      };
    },
    getActiveTool: () => activeTool,
    setActiveToolState: (tool) => {
      activeTool = tool;
    }
  }
});

const {
  clampBrushSize,
  hideBrushPreview,
  pickCanvasColor,
  setActiveTool,
  setBrushSize,
  updateBrushPreview
} = toolUiController;

toolUiController.bindEvents();
setBrushSize(profile.brushSize);
setActiveTool(profile.activeTool);

createSettingsController({
  dialog: settingsDialog,
  form: settingsForm,
  openButton: settingsBtn,
  cancelButton: cancelSettingsBtn,
  inputs: {
    displayName: displayNameInput,
    identityColor: identityColorInput,
    brushSize: sizeSlider,
    showQuickColors: showQuickColorsInput,
    showPattern: showPatternInput,
    showFooterContact: showFooterContactInput
  },
  getProfile: () => profile,
  setProfile: (nextProfile) => {
    profile = nextProfile;
  },
  applyProfileToUi: applyProfileToUI,
  applyProfileVisibility,
  clampBrushSize,
  redrawScene: () => redrawScene(),
  queuePresenceSync,
  renderOpenBoardsCount: boardStatus.renderOpenBoardsCount
});

const renderLiveCursors = createLiveCursorRenderer({
  canvas,
  container: liveCursors,
  view,
  localSessionId: sessionId
});

const historyController = createHistoryController({
  sharedEvents,
  localUserId,
  undoButton: undoBtn,
  redoButton: redoBtn,
  clearButton: clearBoardBtn,
  clearCountdownSeconds: CLEAR_COUNTDOWN_SECONDS,
  getBoardSession: () => boardSession,
  publishOrApplyEvent,
  onError: handleDatabaseError
});
historyController.updateClearButtonVisibility();

const mobileLayoutController = createMobileLayoutController({
  topbar,
  menuButton: mobileMenuBtn,
  menu: boardMenu,
  controls: drawingControls,
  resetViewButton: resetViewBtn,
  clearBoardButton: clearBoardBtn,
  onLayoutChange: () => cameraController.resizeCanvas()
});
mobileLayoutController.bind();

function handleDatabaseError(error) {
  console.error(error);
}

function queuePresenceSync(force = false) {
  boardSession?.queuePresenceSync(force);
}

function queueLiveStrokeSync(force = false) {
  boardSession?.queueLiveStrokeSync(force);
}

function clearLiveStroke() {
  return boardSession?.clearLiveStroke() || Promise.resolve();
}

function publishOrApplyEvent(event) {
  return boardSession?.publishOrApplyEvent(event) || Promise.resolve(false);
}

function redrawScene(presence = latestPresence) {
  sceneRenderer.renderFromSharedState();
  renderLiveCursors(presence);
  historyController.updateButtons();
}
const sceneRenderer = createSceneRenderer({
  canvas,
  ctx,
  view,
  board: {
    width: BOARD_WIDTH,
    height: BOARD_HEIGHT,
    backgroundColor: BOARD_BACKGROUND_COLOR,
    surfaceColor: BOARD_SURFACE_COLOR,
    gridColor: BOARD_GRID_COLOR
  },
  runtime: {
    getCanvasPixelRatio: cameraController.getCanvasPixelRatio,
    minPressure: MIN_PRESSURE,
    getShowPattern: () => profile.showPattern,
    getSharedEvents: () => sharedEvents,
    getCurrentStrokeState: () => ({
      drawing: inputController?.isDrawing() === true,
      currentStroke: inputController?.getCurrentStroke() || null
    }),
    getRemoteLiveStrokes: () => remoteLiveStrokes,
    updateBrushPreview
  }
});

function applyLocalEvent(event) {
  if (event.type === "clear") {
    sharedEvents.length = 0;
  }

  sharedEvents.push({
    ...event,
    at: Date.now()
  });

  maybeNotifyForClearEvent(event, event.id || "");

  invalidateSharedRenderCache();
  redrawScene();
}

boardSession = createBoardSessionController({
  firebase: {
    firebaseConfig,
    boardTtlMs: BOARD_TTL_MS,
    presenceThrottleMs: PRESENCE_THROTTLE_MS
  },
  board: {
    boardId,
    localUserId,
    sessionId,
    joinedAt
  },
  access: {
    loadCachedBoardAccessCode,
    promptForBoardJoinCode,
    promptForOptionalNewBoardAccessCode,
    saveCachedBoardAccessCode,
    showBoardNotice,
    redirectToNewBoard: () => {
      navigateToBoard(generateBoardId());
    }
  },
  runtime: {
    getProfile: () => profile,
    getCursorState: () =>
      inputController?.getCursorState() || {
        x: BOARD_WIDTH / 2,
        y: BOARD_HEIGHT / 2,
        active: false
      },
    getLiveStroke: () => inputController?.getCurrentStroke() || null,
    applyLocalEvent
  }
});

boardSession.onStateChange(() => {
  historyController.updateClearButtonVisibility();
  boardStatus.renderAll();
});

boardSession.onPresenceChange((presence) => {
  peerCount.textContent = `${countOnlineUsers(presence)} online`;
  renderLiveCursors(presence);
});

boardSession.onRemoteEvent((event, eventId) => {
  if (event.type === "clear") {
    sharedEvents.length = 0;
  }

  sharedEvents.push(event);
  maybeNotifyForClearEvent(event, eventId);
  queueRemoteRender();
});

boardSession.onLiveStrokesChange((strokes) => {
  remoteLiveStrokes = strokes;
  queueRemoteRender(false);
});

boardSession.onExpire(() => {
  sharedEvents.length = 0;
  remoteLiveStrokes = [];
  invalidateSharedRenderCache();
  peerCount.textContent = "0 online";
  redrawScene({});
  cameraController.clearMoveHintTimer();
  cameraController.hideMoveHint();
  boardStatus.renderOpenBoardsCount();
});

inputController = createInputController({
  ui: {
    canvas,
    resetViewBtn,
      shortcutsDialog,
    mouseCoordinates,
    zoomPercentage
  },
  viewport: {
    view,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    wheelZoomSensitivity: WHEEL_ZOOM_SENSITIVITY,
    clampView: cameraController.clampView,
    centerView: cameraController.centerView,
    scheduleViewStateSave: cameraController.scheduleViewStateSave,
    syncCameraMoveHintTimer: cameraController.syncMoveHintTimer
  },
  board: {
    boardWidth: BOARD_WIDTH,
    boardHeight: BOARD_HEIGHT,
    strokePointMinDistanceSq: STROKE_POINT_MIN_DISTANCE_SQ,
    minPressure: MIN_PRESSURE,
    brushResizePixelsPerStep: BRUSH_RESIZE_PIXELS_PER_STEP
  },
  tools: {
    getActiveTool: () => activeTool,
    setActiveTool,
    getColor: () => colorPicker.value,
    getBrushSize: () => Number(sizeSlider.value),
    setBrushSize,
    pickCanvasColor,
    hideBrushPreview,
    updateBrushPreview
  },
  session: {
    isBoardExpired: () => boardSession.isBoardExpired(),
    queuePresenceSync,
    queueLiveStrokeSync,
    clearLiveStroke,
    publishOrApplyEvent
  },
  history: {
    onUndo: historyController.undo,
    onRedo: historyController.redo
  },
  rendering: {
    redrawScene
  },
  persistence: {
    saveViewState: cameraController.saveNow
  },
  shortcuts: {
    keyboardToolShortcuts: KEYBOARD_TOOL_SHORTCUTS
  },
  identity: {
    localUserId
  },
  environment: {
    documentRef: document,
    windowRef: window
  }
});

inputController.bindEvents(viewStorageKey);

retryConnectBtn.addEventListener("click", () => {
  if (boardSession.isBoardExpired()) {
    return;
  }

  boardSession.retryConnection();
});

if (!isFirebaseConfigReady(firebaseConfig)) {
  connectionStatus.dataset.state = "disconnected";
  connectionStatus.textContent = "Set Firebase config";
  peerCount.textContent = "0 online";
  retryConnectBtn.hidden = true;
  boardStatus.renderBoardExpiryTimer();
  boardStatus.renderOpenBoardsCount();
  scheduleLoadingScreenDismissAfterBoot();
} else {
  boardSession.initialize()
    .catch(handleDatabaseError)
    .finally(() => {
      scheduleLoadingScreenDismissAfterBoot();
    });
}

cameraController.bind();
boardStatus.renderBoardExpiryTimer();
boardStatus.renderOpenBoardsCount();
cameraController.resizeCanvas();
redrawScene();
