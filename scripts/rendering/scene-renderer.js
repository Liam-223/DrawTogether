import { computeVisibleOps } from "../history/history-utils.js";
import { drawAirbrushStroke } from "./airbrush-render.js";
import {
  drawStroke,
  getStrokeCacheKey,
  promoteLiveAirbrushBitmapToCache,
  pruneStrokeCaches
} from "./stroke-renderer.js";

const GRID_SPACING = 20;

function drawBoardBackground(ctx, view, board, rect, showPattern) {
  const scale = view.scale;
  const startX = view.offsetX;
  const startY = view.offsetY;
  const width = board.width * scale;
  const height = board.height * scale;

  ctx.fillStyle = board.backgroundColor;
  ctx.fillRect(0, 0, rect.width, rect.height);

  ctx.fillStyle = board.surfaceColor;
  ctx.fillRect(startX, startY, width, height);

  const grid = GRID_SPACING * scale;
  if (!showPattern || grid < 6) {
    return;
  }

  ctx.strokeStyle = board.gridColor;
  ctx.lineWidth = 1;
  ctx.beginPath();

  for (let x = startX; x <= startX + width; x += grid) {
    ctx.moveTo(x, startY);
    ctx.lineTo(x, startY + height);
  }

  for (let y = startY; y <= startY + height; y += grid) {
    ctx.moveTo(startX, y);
    ctx.lineTo(startX + width, y);
  }

  ctx.stroke();
}

function maskOutsideBoard(targetCtx, view, board, rect) {
  const boardX = view.offsetX;
  const boardY = view.offsetY;
  const visibleBoardWidth = board.width * view.scale;
  const visibleBoardHeight = board.height * view.scale;
  const boardRight = boardX + visibleBoardWidth;
  const boardBottom = boardY + visibleBoardHeight;

  targetCtx.fillStyle = board.backgroundColor;

  if (boardY > 0) {
    targetCtx.fillRect(0, 0, rect.width, Math.min(rect.height, boardY));
  }

  if (boardBottom < rect.height) {
    targetCtx.fillRect(
      0,
      Math.max(0, boardBottom),
      rect.width,
      rect.height - Math.max(0, boardBottom)
    );
  }

  const verticalStart = Math.max(0, boardY);
  const verticalEnd = Math.min(rect.height, boardBottom);
  const verticalHeight = Math.max(0, verticalEnd - verticalStart);

  if (verticalHeight > 0 && boardX > 0) {
    targetCtx.fillRect(0, verticalStart, Math.min(rect.width, boardX), verticalHeight);
  }

  if (verticalHeight > 0 && boardRight < rect.width) {
    targetCtx.fillRect(
      Math.max(0, boardRight),
      verticalStart,
      rect.width - Math.max(0, boardRight),
      verticalHeight
    );
  }
}

function clipToBoard(ctx, view, board) {
  ctx.beginPath();
  ctx.rect(
    view.offsetX,
    view.offsetY,
    board.width * view.scale,
    board.height * view.scale
  );
  ctx.clip();
}

function ensureLayer(layer) {
  if (layer.canvas) {
    return;
  }

  layer.canvas = document.createElement("canvas");
  layer.ctx = layer.canvas.getContext("2d");
}

function ensureLayerSize(layer, width, height) {
  if (layer.canvas.width === width && layer.canvas.height === height) {
    return false;
  }

  layer.canvas.width = width;
  layer.canvas.height = height;
  return true;
}

function setLayerTransform(layer, ratio) {
  layer.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function createVisibleOpsStore(getSharedEvents) {
  let visibleOpsCache = [];
  let visibleOpsDirty = true;

  return {
    getVisibleOps() {
      if (!visibleOpsDirty) {
        return visibleOpsCache;
      }

      visibleOpsCache = computeVisibleOps(getSharedEvents());
      visibleOpsDirty = false;
      return visibleOpsCache;
    },
    invalidate() {
      visibleOpsDirty = true;
      visibleOpsCache = [];
    }
  };
}

export function createSceneRenderer({
  canvas,
  ctx,
  view,
  board,
  runtime
}) {
  const {
    getCanvasPixelRatio,
    minPressure,
    getShowPattern,
    getSharedEvents,
    getCurrentStrokeState,
    getRemoteLiveStrokes,
    updateBrushPreview
  } = runtime;
  const strokeLayer = { canvas: null, ctx: null };
  const previewLayer = { canvas: null, ctx: null };
  const liveAirbrushLayer = { canvas: null, ctx: null };
  let strokeLayerViewSignature = "";
  let strokeLayerDirty = true;
  let liveAirbrushStrokeId = null;
  let liveAirbrushPointCount = 0;
  let liveAirbrushViewSignature = "";
  const strokeScreenPointCache = new Map();
  const airbrushBitmapCache = new Map();
  const pressureStatsCache = new Map();
  const renderState = {
    view,
    minPressure,
    strokeScreenPointCache,
    airbrushBitmapCache,
    pressureStatsCache
  };
  const visibleOpsStore = createVisibleOpsStore(getSharedEvents);

  function invalidateSharedRenderCache() {
    visibleOpsStore.invalidate();
    strokeLayerDirty = true;
  }

  function clearLiveAirbrushLayer(rect) {
    if (!liveAirbrushLayer.canvas) {
      return;
    }

    liveAirbrushLayer.ctx.clearRect(0, 0, rect.width, rect.height);
    liveAirbrushStrokeId = null;
    liveAirbrushPointCount = 0;
    liveAirbrushViewSignature = "";
  }

  function renderLiveAirbrush(stroke, rect, ratio, viewSignature) {
    ensureLayer(liveAirbrushLayer);
    const resized = ensureLayerSize(liveAirbrushLayer, canvas.width, canvas.height);
    setLayerTransform(liveAirbrushLayer, ratio);

    const strokeId = getStrokeCacheKey(stroke) || stroke.id;
    const pointCount = stroke.points.length;
    const needsFullRedraw =
      resized ||
      liveAirbrushStrokeId !== strokeId ||
      liveAirbrushViewSignature !== viewSignature ||
      pointCount < liveAirbrushPointCount;

    let startPointIndex = Math.max(0, liveAirbrushPointCount - 1);
    if (needsFullRedraw) {
      liveAirbrushLayer.ctx.clearRect(0, 0, rect.width, rect.height);
      startPointIndex = 0;
    }

    if (needsFullRedraw || pointCount > liveAirbrushPointCount) {
      const localPoints = [];
      for (let i = startPointIndex; i < pointCount; i += 1) {
        const point = stroke.points[i];
        localPoints.push({
          x: point.x * view.scale + view.offsetX,
          y: point.y * view.scale + view.offsetY,
          p: Number.isFinite(point?.p) ? point.p : undefined
        });
      }

      if (localPoints.length > 1) {
        liveAirbrushLayer.ctx.save();
        clipToBoard(liveAirbrushLayer.ctx, view, board);
        drawAirbrushStroke(
          liveAirbrushLayer.ctx,
          localPoints,
          stroke.color,
          stroke.size * view.scale,
          stroke.id,
          startPointIndex
        );
        liveAirbrushLayer.ctx.restore();
      }
    }

    liveAirbrushStrokeId = strokeId;
    liveAirbrushPointCount = pointCount;
    liveAirbrushViewSignature = viewSignature;
  }

  function renderFromSharedState() {
    const rect = canvas.getBoundingClientRect();
    const { drawing, currentStroke } = getCurrentStrokeState();
    const hasLiveStroke = drawing && currentStroke && currentStroke.points.length > 1;
    const isLiveEraser = hasLiveStroke && currentStroke.tool === "eraser";
    const isLiveAirbrush = hasLiveStroke && currentStroke.tool === "airbrush";

    ctx.clearRect(0, 0, rect.width, rect.height);
    drawBoardBackground(ctx, view, board, rect, getShowPattern());

    ensureLayer(strokeLayer);
    ensureLayer(previewLayer);
    if (ensureLayerSize(strokeLayer, canvas.width, canvas.height)) {
      strokeLayerDirty = true;
    }
    ensureLayerSize(previewLayer, canvas.width, canvas.height);

    const ratio = getCanvasPixelRatio();
    setLayerTransform(strokeLayer, ratio);
    setLayerTransform(previewLayer, ratio);

    const viewSignature = `${rect.width}x${rect.height}:${view.scale}:${view.offsetX}:${view.offsetY}`;
    const visibleOps = visibleOpsStore.getVisibleOps();
    const visibleStrokeIds = new Set(
      visibleOps
        .filter((op) => op.type === "stroke" && getStrokeCacheKey(op))
        .map((op) => getStrokeCacheKey(op))
    );
    const remoteLiveStrokes = (getRemoteLiveStrokes?.() || []).filter((stroke) => {
      const strokeId = getStrokeCacheKey(stroke);
      return stroke?.points?.length > 1 && (!strokeId || !visibleStrokeIds.has(strokeId));
    });
    const hasRemoteLiveEraser = remoteLiveStrokes.some((stroke) => stroke.tool === "eraser");

    // A new live airbrush stroke means the completed layer needs a refresh.
    if (isLiveAirbrush && liveAirbrushStrokeId) {
      const incomingStrokeId = getStrokeCacheKey(currentStroke) || currentStroke.id;
      if (incomingStrokeId !== liveAirbrushStrokeId) {
        strokeLayerDirty = true;
      }
    }

    // Promote the live bitmap on release so the texture stays pixel-identical.
    if (!isLiveAirbrush && liveAirbrushStrokeId) {
      const finishedStroke = visibleOps.find(
        (op) =>
          op.type === "stroke" &&
          op.tool === "airbrush" &&
          getStrokeCacheKey(op) === liveAirbrushStrokeId
      );

      if (finishedStroke && liveAirbrushViewSignature === viewSignature) {
        if (
          promoteLiveAirbrushBitmapToCache({
            stroke: finishedStroke,
            rect,
            view,
            liveAirbrushLayer,
            airbrushBitmapCache,
            minPressure,
            pressureStatsCache
          })
        ) {
          strokeLayerDirty = true;
        }
      }

      clearLiveAirbrushLayer(rect);
    }

    if (strokeLayerDirty || strokeLayerViewSignature !== viewSignature) {
      strokeLayer.ctx.clearRect(0, 0, rect.width, rect.height);
      strokeLayer.ctx.save();
      clipToBoard(strokeLayer.ctx, view, board);

      pruneStrokeCaches(visibleOps, currentStroke, [
        strokeScreenPointCache,
        airbrushBitmapCache,
        pressureStatsCache
      ]);
      for (const op of visibleOps) {
        if (op.type === "stroke") {
          drawStroke(op, strokeLayer.ctx, currentStroke, renderState);
        }
      }

      strokeLayer.ctx.restore();

      strokeLayerViewSignature = viewSignature;
      strokeLayerDirty = false;
    }

    if (isLiveAirbrush) {
      renderLiveAirbrush(currentStroke, rect, ratio, viewSignature);
    } else if (liveAirbrushStrokeId) {
      clearLiveAirbrushLayer(rect);
    }

    previewLayer.ctx.clearRect(0, 0, rect.width, rect.height);

    const previewIncludesCompletedStrokes = isLiveEraser || hasRemoteLiveEraser;
    if (previewIncludesCompletedStrokes) {
      previewLayer.ctx.drawImage(strokeLayer.canvas, 0, 0, rect.width, rect.height);
    }

    if (remoteLiveStrokes.length > 0 || (hasLiveStroke && !isLiveAirbrush)) {
      previewLayer.ctx.save();
      clipToBoard(previewLayer.ctx, view, board);

      for (const remoteStroke of remoteLiveStrokes) {
        drawStroke(remoteStroke, previewLayer.ctx, remoteStroke, renderState);
      }

      if (hasLiveStroke && !isLiveAirbrush) {
        drawStroke(currentStroke, previewLayer.ctx, currentStroke, renderState);
      }

      previewLayer.ctx.restore();
    }

    if (previewIncludesCompletedStrokes) {
      ctx.drawImage(previewLayer.canvas, 0, 0, rect.width, rect.height);
      if (isLiveAirbrush) {
        ctx.drawImage(liveAirbrushLayer.canvas, 0, 0, rect.width, rect.height);
      }
    } else {
      ctx.drawImage(strokeLayer.canvas, 0, 0, rect.width, rect.height);
      if (remoteLiveStrokes.length > 0 || (hasLiveStroke && !isLiveAirbrush)) {
        ctx.drawImage(previewLayer.canvas, 0, 0, rect.width, rect.height);
      }
      if (isLiveAirbrush) {
        ctx.drawImage(liveAirbrushLayer.canvas, 0, 0, rect.width, rect.height);
      }
    }

    maskOutsideBoard(ctx, view, board, rect);
    updateBrushPreview();
  }

  return {
    getVisibleOps: visibleOpsStore.getVisibleOps,
    invalidateSharedRenderCache,
    renderFromSharedState
  };
}
