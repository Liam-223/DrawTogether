import { appConfig } from "../../app-config.js";

const MIN_BRUSH_SIZE = Math.max(1, Number(appConfig.brush?.minSize) || 1);
const MAX_BRUSH_SIZE = Math.max(MIN_BRUSH_SIZE, Number(appConfig.brush?.maxSize) || 67);
const DEFAULT_BRUSH_SIZE = Math.max(
  MIN_BRUSH_SIZE,
  Math.min(MAX_BRUSH_SIZE, Number(appConfig.brush?.defaultSize) || MIN_BRUSH_SIZE)
);

const BOARD_TTL_MS = Math.max(1, Number(appConfig.board?.ttlHours) || 24) * 60 * 60 * 1000;
const BOARD_WIDTH = Math.max(500, Number(appConfig.board?.width) || 4200);
const BOARD_HEIGHT = Math.max(500, Number(appConfig.board?.height) || 2600);
const MIN_ZOOM = Math.max(0.05, Number(appConfig.board?.minZoom) || 0.25);
const MAX_ZOOM = Math.max(MIN_ZOOM, Number(appConfig.board?.maxZoom) || 4.5);
const BOARD_EDGE_PADDING = Math.max(0, Number(appConfig.board?.edgePadding) || 140);

const CLEAR_COUNTDOWN_SECONDS = Math.max(1, Math.floor(Number(appConfig.interaction?.clearCountdownSeconds) || 5));
const PRESENCE_THROTTLE_MS = Math.max(0, Number(appConfig.interaction?.presenceThrottleMs) || 80);
const WHEEL_ZOOM_SENSITIVITY = Math.max(0.0001, Number(appConfig.interaction?.wheelZoomSensitivity) || 0.0016);
const STROKE_POINT_MIN_DISTANCE_SQ = Math.max(
  0.2,
  Number(appConfig.interaction?.strokePointMinDistanceSqAtScale1) || 4
);
const BRUSH_RESIZE_PIXELS_PER_STEP = Math.max(1, Number(appConfig.interaction?.brushResizePixelsPerStep) || 4);
const CAMERA_MOVE_HINT_DELAY_MS = Math.max(1000, Number(appConfig.interaction?.cameraMoveHintDelayMs) || 15000);

const TOOL_BUTTON_SIZE_PX = Math.max(32, Number(appConfig.ui?.toolButtonSizePx) || 48);
const TOOL_ICON_SIZE_PX = Math.max(14, Number(appConfig.ui?.toolIconSizePx) || 24);

function applyRuntimeCssVariables(rootElement) {
  rootElement.style.setProperty("--tool-btn-size", `${TOOL_BUTTON_SIZE_PX}px`);
  rootElement.style.setProperty("--tool-icon-size", `${TOOL_ICON_SIZE_PX}px`);
}

export {
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
};
