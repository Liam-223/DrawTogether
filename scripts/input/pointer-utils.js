import { clamp, clampPressure } from "../core/shared-utils.js";

export function isInsideBoard(x, y, boardWidth, boardHeight) {
  return x >= 0 && x <= boardWidth && y >= 0 && y <= boardHeight;
}

export function getPointerPosition(canvas, event, view) {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  return {
    x,
    y,
    worldX: (x - view.offsetX) / view.scale,
    worldY: (y - view.offsetY) / view.scale
  };
}

export function getPenPressure(event, minPressure) {
  if (event.pointerType !== "pen") {
    return undefined;
  }

  return clampPressure(event.pressure, minPressure);
}

export function createStrokePoint(x, y, pressure, boardWidth, boardHeight, minPressure) {
  const point = {
    x: Math.round(clamp(x, 0, boardWidth) * 10) / 10,
    y: Math.round(clamp(y, 0, boardHeight) * 10) / 10
  };

  if (Number.isFinite(pressure)) {
    point.p = Math.round(clampPressure(pressure, minPressure) * 100) / 100;
  }

  return point;
}

export function pointerDistance(first, second) {
  return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
}

export function pointerMidpoint(first, second) {
  return {
    clientX: (first.clientX + second.clientX) / 2,
    clientY: (first.clientY + second.clientY) / 2
  };
}
