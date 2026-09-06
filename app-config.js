export const appConfig = {
  board: {
    width: 4200,
    height: 2600,
    ttlHours: 24,
    minZoom: 0.25,
    maxZoom: 4.5,
    edgePadding: 140,
    showPatternDefault: true,
    showQuickColorsDefault: false
  },
  brush: {
    minSize: 1,
    maxSize: 67,
    defaultSize: 4
  },
  interaction: {
    clearCountdownSeconds: 5,
    presenceThrottleMs: 60,
    wheelZoomSensitivity: 0.0016,
    strokePointMinDistanceSqAtScale1: 4,
    brushResizePixelsPerStep: 4,
    cameraMoveHintDelayMs: 30000
  },
  ui: {
    toolButtonSizePx: 40,
    toolIconSizePx: 20,
    showFooterContactDefault: true
  }
};
