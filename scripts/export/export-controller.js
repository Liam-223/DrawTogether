import { drawAirbrushStroke } from "../rendering/airbrush-render.js";
import {
  downloadCanvasAsPng,
  getExportResolution,
  renderExportBackground,
  sanitizeExportFileName
} from "./export-utils.js";
import { clampPressure, isPressureSensitiveStroke } from "../core/shared-utils.js";

function createExportController({
  canvas,
  board,
  dialogs,
  controls,
  drawingApi,
  getVisibleOps
}) {
  const { boardId, boardWidth, boardHeight } = board;
  const { getProfile, settingsDialog, exportDialog } = dialogs;
  const {
    exportAreaSelect,
    exportIncludeGridInput,
    exportBackgroundSelect,
    exportFileNameInput,
    exportResolutionHint
  } = controls;
  const { isDrawing, getCurrentStroke } = drawingApi;

  function updateExportResolutionHint() {
    const area = exportAreaSelect.value;
    const { width, height } = getExportResolution(area, canvas.width, canvas.height, boardWidth, boardHeight);
    exportResolutionHint.textContent = `Output: ${width} x ${height}px`;
  }

  function drawStrokeForExport(stroke, targetCtx) {
    if (!stroke.points || stroke.points.length < 2) {
      return;
    }

    if (stroke.tool === "airbrush") {
      drawAirbrushStroke(targetCtx, stroke.points, stroke.color, stroke.size, stroke.id);
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
        const segmentPressure = (clampPressure(from?.p) + clampPressure(to?.p)) / 2;

        targetCtx.lineWidth = Math.max(0.35, stroke.size * segmentPressure);
        targetCtx.beginPath();
        targetCtx.moveTo(from.x, from.y);
        targetCtx.lineTo(to.x, to.y);
        targetCtx.stroke();
      }
    } else {
      targetCtx.lineWidth = stroke.size;
      targetCtx.beginPath();
      targetCtx.moveTo(stroke.points[0].x, stroke.points[0].y);

      for (let i = 1; i < stroke.points.length; i += 1) {
        targetCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }

      targetCtx.stroke();
    }

    targetCtx.globalCompositeOperation = previousComposite;
  }

  function exportViewportPng(fileBaseName) {
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = Math.max(1, Math.round(canvas.width));
    exportCanvas.height = Math.max(1, Math.round(canvas.height));
    const exportCtx = exportCanvas.getContext("2d");

    exportCtx.imageSmoothingEnabled = true;
    exportCtx.imageSmoothingQuality = "high";
    exportCtx.drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height);
    downloadCanvasAsPng(exportCanvas, fileBaseName, `drawtogether-${boardId}`);
  }

  function exportFullBoardPng(includeGrid, backgroundMode, fileBaseName) {
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = Math.max(1, Math.round(boardWidth));
    exportCanvas.height = Math.max(1, Math.round(boardHeight));
    const exportCtx = exportCanvas.getContext("2d", { alpha: backgroundMode === "transparent" });

    const drawingCanvas = document.createElement("canvas");
    drawingCanvas.width = exportCanvas.width;
    drawingCanvas.height = exportCanvas.height;
    const drawingCtx = drawingCanvas.getContext("2d");

    const visibleOps = getVisibleOps();
    for (const op of visibleOps) {
      if (op.type === "stroke") {
        drawStrokeForExport(op, drawingCtx);
      }
    }

    const currentStroke = getCurrentStroke();
    if (isDrawing() && currentStroke && currentStroke.points.length > 1) {
      drawStrokeForExport(currentStroke, drawingCtx);
    }

    renderExportBackground(exportCtx, exportCanvas.width, exportCanvas.height, includeGrid, backgroundMode);
    exportCtx.drawImage(drawingCanvas, 0, 0);

    downloadCanvasAsPng(exportCanvas, fileBaseName, `drawtogether-${boardId}`);
  }

  function openExportDialog() {
    const profile = getProfile();
    exportAreaSelect.value = "full";
    exportIncludeGridInput.checked = profile.showPattern;
    exportBackgroundSelect.value = "white";
    exportFileNameInput.value = `drawtogether-${boardId}`;
    updateExportResolutionHint();

    if (settingsDialog.open) {
      settingsDialog.close();
    }

    exportDialog.showModal();
  }

  function closeExportDialog() {
    exportDialog.close();
  }

  function executePngExport() {
    const area = exportAreaSelect.value === "viewport" ? "viewport" : "full";
    const includeGrid = exportIncludeGridInput.checked;
    const backgroundMode = exportBackgroundSelect.value === "transparent" ? "transparent" : "white";
    const fileBaseName = sanitizeExportFileName(exportFileNameInput.value);

    if (area === "viewport") {
      exportViewportPng(fileBaseName);
      return;
    }

    exportFullBoardPng(includeGrid, backgroundMode, fileBaseName);
  }

  return {
    closeExportDialog,
    executePngExport,
    openExportDialog,
    updateExportResolutionHint
  };
}

export { createExportController };
