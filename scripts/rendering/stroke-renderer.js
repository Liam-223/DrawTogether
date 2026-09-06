import { drawAirbrushStroke } from "./airbrush-render.js";
import { getPointPressure, isPressureSensitiveStroke } from "../core/shared-utils.js";

const AIRBRUSH_RASTER_SCALE = 1;
const AIRBRUSH_LIVE_PADDING = 0.82;

function toScreenPoint(point, view) {
  return {
    x: point.x * view.scale + view.offsetX,
    y: point.y * view.scale + view.offsetY,
    p: Number.isFinite(point?.p) ? point.p : undefined
  };
}

function getPointBounds(points) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }

  return { minX, minY, maxX, maxY };
}

export function getStrokeCacheKey(stroke) {
  return String(stroke?.id || "").trim() || null;
}

function getCachedPressureStats(stroke, minPressure, pressureStatsCache) {
  const cacheKey = getStrokeCacheKey(stroke);
  const pointCount = Array.isArray(stroke?.points) ? stroke.points.length : 0;

  if (!cacheKey || pointCount === 0) {
    return {
      pointCount,
      pressureSum: 0,
      pressureMin: 1,
      pressureMax: 1
    };
  }

  const existing = pressureStatsCache.get(cacheKey);
  if (existing && existing.pointCount === pointCount) {
    return existing;
  }

  let pressureSum = 0;
  let pressureMin = 1;
  let pressureMax = 1;

  for (const point of stroke.points) {
    const pressure = getPointPressure(point, minPressure);
    pressureSum += pressure;
    if (pressure < pressureMin) {
      pressureMin = pressure;
    }
    if (pressure > pressureMax) {
      pressureMax = pressure;
    }
  }

  const computed = {
    pointCount,
    pressureSum,
    pressureMin,
    pressureMax
  };

  pressureStatsCache.set(cacheKey, computed);
  return computed;
}

function getCachedScreenPoints(stroke, view, strokeScreenPointCache) {
  const cacheKey = getStrokeCacheKey(stroke);
  if (!cacheKey) {
    return stroke.points.map((point) => toScreenPoint(point, view));
  }

  const cache = strokeScreenPointCache.get(cacheKey);
  const pointCount = stroke.points.length;

  if (
    cache &&
    cache.scale === view.scale &&
    cache.offsetX === view.offsetX &&
    cache.offsetY === view.offsetY &&
    cache.pointCount === pointCount
  ) {
    return cache.points;
  }

  const points = stroke.points.map((point) => toScreenPoint(point, view));

  strokeScreenPointCache.set(cacheKey, {
    scale: view.scale,
    offsetX: view.offsetX,
    offsetY: view.offsetY,
    pointCount,
    points
  });

  return points;
}

function getAirbrushCacheSignature(stroke, minPressure, pressureStatsCache) {
  const stats = getCachedPressureStats(stroke, minPressure, pressureStatsCache);
  return [
    stroke.points.length,
    stroke.color,
    stroke.size,
    stats.pressureSum.toFixed(3),
    stats.pressureMin.toFixed(3),
    stats.pressureMax.toFixed(3)
  ].join(":");
}

export function promoteLiveAirbrushBitmapToCache({
  stroke,
  rect,
  view,
  liveAirbrushLayer,
  airbrushBitmapCache,
  minPressure,
  pressureStatsCache
}) {
  const cacheKey = getStrokeCacheKey(stroke);
  if (!cacheKey || !liveAirbrushLayer.canvas || !stroke.points?.length || view.scale <= 0) {
    return false;
  }

  const sourceCanvas = liveAirbrushLayer.canvas;
  const pixelScaleX = sourceCanvas.width / Math.max(1, rect.width);
  const pixelScaleY = sourceCanvas.height / Math.max(1, rect.height);
  if (!Number.isFinite(pixelScaleX) || !Number.isFinite(pixelScaleY) || pixelScaleX <= 0 || pixelScaleY <= 0) {
    return false;
  }

  const bounds = getPointBounds(stroke.points);
  const paddingCss = Math.max(3, stroke.size * view.scale * AIRBRUSH_LIVE_PADDING + 3);
  const minCssX = Math.max(0, bounds.minX * view.scale + view.offsetX - paddingCss);
  const minCssY = Math.max(0, bounds.minY * view.scale + view.offsetY - paddingCss);
  const maxCssX = Math.min(rect.width, bounds.maxX * view.scale + view.offsetX + paddingCss);
  const maxCssY = Math.min(rect.height, bounds.maxY * view.scale + view.offsetY + paddingCss);

  const sourceX = Math.max(0, Math.floor(minCssX * pixelScaleX));
  const sourceY = Math.max(0, Math.floor(minCssY * pixelScaleY));
  const sourceRight = Math.min(sourceCanvas.width, Math.ceil(maxCssX * pixelScaleX));
  const sourceBottom = Math.min(sourceCanvas.height, Math.ceil(maxCssY * pixelScaleY));
  const sourceWidth = sourceRight - sourceX;
  const sourceHeight = sourceBottom - sourceY;

  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return false;
  }

  const bitmap = document.createElement("canvas");
  bitmap.width = sourceWidth;
  bitmap.height = sourceHeight;
  const bitmapCtx = bitmap.getContext("2d");
  bitmapCtx.drawImage(
    sourceCanvas,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    sourceWidth,
    sourceHeight
  );

  const cssX = sourceX / pixelScaleX;
  const cssY = sourceY / pixelScaleY;
  const cssWidth = sourceWidth / pixelScaleX;
  const cssHeight = sourceHeight / pixelScaleY;

  airbrushBitmapCache.set(cacheKey, {
    signature: getAirbrushCacheSignature(stroke, minPressure, pressureStatsCache),
    canvas: bitmap,
    worldX: (cssX - view.offsetX) / view.scale,
    worldY: (cssY - view.offsetY) / view.scale,
    worldWidth: cssWidth / view.scale,
    worldHeight: cssHeight / view.scale
  });

  return true;
}

function getCachedAirbrushBitmap({
  stroke,
  minPressure,
  airbrushBitmapCache,
  pressureStatsCache
}) {
  const rasterScale = AIRBRUSH_RASTER_SCALE;
  const rasterBrushSize = stroke.size * rasterScale;
  const radius = Math.max(0.75, rasterBrushSize * 0.55);
  const padding = Math.ceil(radius + 2);
  const signature = getAirbrushCacheSignature(stroke, minPressure, pressureStatsCache);
  const cacheKey = getStrokeCacheKey(stroke);
  const existing = cacheKey ? airbrushBitmapCache.get(cacheKey) : null;
  if (existing && existing.signature === signature) {
    return existing;
  }

  const bounds = getPointBounds(stroke.points);
  const minX = bounds.minX * rasterScale;
  const minY = bounds.minY * rasterScale;
  const maxX = bounds.maxX * rasterScale;
  const maxY = bounds.maxY * rasterScale;
  const originX = Math.floor(minX - padding);
  const originY = Math.floor(minY - padding);
  const width = Math.max(1, Math.ceil(maxX + padding) - originX);
  const height = Math.max(1, Math.ceil(maxY + padding) - originY);
  const bitmap = document.createElement("canvas");
  bitmap.width = width;
  bitmap.height = height;
  const bitmapCtx = bitmap.getContext("2d");

  const localPoints = stroke.points.map((point) => ({
    x: point.x * rasterScale - originX,
    y: point.y * rasterScale - originY,
    p: Number.isFinite(point?.p) ? point.p : undefined
  }));

  drawAirbrushStroke(bitmapCtx, localPoints, stroke.color, rasterBrushSize, stroke.id);

  const cached = {
    signature,
    canvas: bitmap,
    worldX: originX / rasterScale,
    worldY: originY / rasterScale,
    worldWidth: width / rasterScale,
    worldHeight: height / rasterScale
  };

  if (cacheKey) {
    airbrushBitmapCache.set(cacheKey, cached);
  }
  return cached;
}

function pruneCache(cache, keepKeys) {
  for (const key of cache.keys()) {
    if (!keepKeys.has(key)) {
      cache.delete(key);
    }
  }
}

export function pruneStrokeCaches(visibleOps, currentStroke, caches) {
  const keepStrokeIds = new Set();

  for (const op of visibleOps) {
    if (op.type !== "stroke") {
      continue;
    }

    const key = getStrokeCacheKey(op);
    if (key) {
      keepStrokeIds.add(key);
    }
  }

  const liveKey = getStrokeCacheKey(currentStroke);
  if (liveKey) {
    keepStrokeIds.add(liveKey);
  }

  for (const cache of caches) {
    pruneCache(cache, keepStrokeIds);
  }
}

export function drawStroke(stroke, targetCtx, currentStroke, renderState) {
  const {
    view,
    minPressure,
    strokeScreenPointCache,
    airbrushBitmapCache,
    pressureStatsCache
  } = renderState;
  if (!stroke.points || stroke.points.length < 2) {
    return;
  }

  if (stroke.tool === "airbrush") {
    if (!currentStroke || stroke.id !== currentStroke.id) {
      const cachedBitmap = getCachedAirbrushBitmap({
        stroke,
        minPressure,
        airbrushBitmapCache,
        pressureStatsCache
      });
      targetCtx.drawImage(
        cachedBitmap.canvas,
        cachedBitmap.worldX * view.scale + view.offsetX,
        cachedBitmap.worldY * view.scale + view.offsetY,
        cachedBitmap.worldWidth * view.scale,
        cachedBitmap.worldHeight * view.scale
      );
      return;
    }

    const screenPoints = getCachedScreenPoints(stroke, view, strokeScreenPointCache);
    drawAirbrushStroke(targetCtx, screenPoints, stroke.color, stroke.size * view.scale, stroke.id);
    return;
  }

  const previousComposite = targetCtx.globalCompositeOperation;
  targetCtx.lineCap = "round";
  targetCtx.lineJoin = "round";
  targetCtx.strokeStyle = stroke.color;
  targetCtx.globalCompositeOperation = stroke.tool === "eraser" ? "destination-out" : "source-over";

  if (isPressureSensitiveStroke(stroke)) {
    for (let i = 1; i < stroke.points.length; i += 1) {
      const from = stroke.points[i - 1];
      const to = stroke.points[i];
      const fromPressure = getPointPressure(from, minPressure);
      const toPressure = getPointPressure(to, minPressure);
      const segmentPressure = (fromPressure + toPressure) / 2;
      targetCtx.lineWidth = Math.max(0.35, stroke.size * segmentPressure * view.scale);
      targetCtx.beginPath();
      targetCtx.moveTo(from.x * view.scale + view.offsetX, from.y * view.scale + view.offsetY);
      targetCtx.lineTo(to.x * view.scale + view.offsetX, to.y * view.scale + view.offsetY);
      targetCtx.stroke();
    }
  } else {
    targetCtx.lineWidth = stroke.size * view.scale;
    targetCtx.beginPath();
    targetCtx.moveTo(stroke.points[0].x * view.scale + view.offsetX, stroke.points[0].y * view.scale + view.offsetY);

    for (let i = 1; i < stroke.points.length; i += 1) {
      targetCtx.lineTo(stroke.points[i].x * view.scale + view.offsetX, stroke.points[i].y * view.scale + view.offsetY);
    }

    targetCtx.stroke();
  }

  targetCtx.globalCompositeOperation = previousComposite;
}

