function sanitizeExportFileName(value) {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9-_ ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  return cleaned;
}

function getExportResolution(area, canvasWidth, canvasHeight, boardWidth, boardHeight) {
  if (area === "viewport") {
    return {
      width: Math.max(1, Math.round(canvasWidth)),
      height: Math.max(1, Math.round(canvasHeight))
    };
  }

  return {
    width: Math.max(1, Math.round(boardWidth)),
    height: Math.max(1, Math.round(boardHeight))
  };
}

function renderExportBackground(targetCtx, width, height, includeGrid, backgroundMode) {
  if (backgroundMode !== "transparent") {
    targetCtx.fillStyle = "#ffffff";
    targetCtx.fillRect(0, 0, width, height);
  }

  if (!includeGrid) {
    return;
  }

  const grid = 20;
  targetCtx.strokeStyle = "#e8edf3";
  targetCtx.lineWidth = 1;
  targetCtx.beginPath();

  for (let x = 0; x <= width; x += grid) {
    targetCtx.moveTo(x, 0);
    targetCtx.lineTo(x, height);
  }

  for (let y = 0; y <= height; y += grid) {
    targetCtx.moveTo(0, y);
    targetCtx.lineTo(width, y);
  }

  targetCtx.stroke();
}

function downloadCanvasAsPng(exportCanvas, fileBaseName, fallbackBaseName) {
  const link = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.download = `${fileBaseName || fallbackBaseName}-${stamp}.png`;
  link.href = exportCanvas.toDataURL("image/png");
  link.click();
}

export {
  downloadCanvasAsPng,
  getExportResolution,
  renderExportBackground,
  sanitizeExportFileName
};
