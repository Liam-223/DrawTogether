import { sanitizeTool, saveProfile } from "../state/profile-storage.js";
import { clamp, rgbToHex } from "../core/shared-utils.js";

const BRUSH_PREVIEW_MIN_SIZE_PX = 8;
const BRUSH_PREVIEW_COLOR = "#000000";

function createToolUiController({
  ui,
  tools,
  brush,
  view,
  getProfile,
  stateApi
}) {
  const { canvas, ctx, palette, colorPicker, sizeSlider, sizeValue, brushPreview } = ui;
  const { toolButtons, drawTools } = tools;
  const { minBrushSize, maxBrushSize } = brush;
  const { getUiState, getActiveTool, setActiveToolState } = stateApi;
  let brushSizeEditor = null;

  function clampBrushSize(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return Number(sizeSlider.value) || minBrushSize;
    }

    return clamp(Math.round(numeric), minBrushSize, maxBrushSize);
  }

  function setBrushSize(value) {
    const clamped = clampBrushSize(value);
    sizeSlider.value = String(clamped);
    sizeValue.textContent = `${clamped}px`;

    const profile = getProfile();
    profile.brushSize = clamped;
    saveProfile(profile);
    updateBrushPreview();
  }

  function setActiveTool(tool) {
    const nextTool = sanitizeTool(tool);
    setActiveToolState(nextTool);

    for (const [toolName, button] of Object.entries(toolButtons)) {
      button.classList.toggle("is-active", nextTool === toolName);
    }

    canvas.classList.toggle("is-pipette", nextTool === "pipette");

    const profile = getProfile();
    if (profile.activeTool !== nextTool) {
      profile.activeTool = nextTool;
      saveProfile(profile);
    }

    updateBrushPreview();
  }

  function shouldShowBrushPreview() {
    const { boardExpired, isTouchGesture, isPanning } = getUiState();
    if (boardExpired || isTouchGesture || isPanning) {
      return false;
    }

    const activeTool = getActiveTool();
    return activeTool === "draw" || activeTool === "airbrush" || activeTool === "eraser";
  }

  function hideBrushPreview() {
    brushPreview.classList.remove("is-visible", "is-eraser", "is-draw");
  }

  function updateBrushPreview() {
    const { hasPreviewPointer, previewClientX, previewClientY } = getUiState();
    if (!hasPreviewPointer || !shouldShowBrushPreview()) {
      hideBrushPreview();
      return;
    }

    const activeTool = getActiveTool();
    const brushSizePx = Math.max(BRUSH_PREVIEW_MIN_SIZE_PX, Number(sizeSlider.value) * view.scale);

    brushPreview.classList.add("is-visible");
    brushPreview.classList.toggle("is-draw", drawTools.has(activeTool));
    brushPreview.classList.toggle("is-eraser", activeTool === "eraser");
    brushPreview.style.width = `${brushSizePx}px`;
    brushPreview.style.height = `${brushSizePx}px`;
    brushPreview.style.left = `${previewClientX}px`;
    brushPreview.style.top = `${previewClientY}px`;
    brushPreview.style.setProperty("--preview-color", BRUSH_PREVIEW_COLOR);
  }

  function setActiveSwatch(color) {
    const normalized = String(color || "").toLowerCase();
    for (const swatch of palette.querySelectorAll(".swatch")) {
      swatch.classList.toggle("is-active", swatch.dataset.color === normalized);
    }
  }

  function pickCanvasColor(event) {
    const rect = canvas.getBoundingClientRect();
    const px = Math.floor((event.clientX - rect.left) * (canvas.width / rect.width));
    const py = Math.floor((event.clientY - rect.top) * (canvas.height / rect.height));

    if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) {
      return;
    }

    const [r, g, b, a] = ctx.getImageData(px, py, 1, 1).data;
    if (a === 0) {
      return;
    }

    const hex = rgbToHex(r, g, b);
    colorPicker.value = hex;
    setActiveSwatch(hex);
    setActiveTool("draw");
    updateBrushPreview();
  }

  function closeBrushSizeEditor(commit) {
    if (!brushSizeEditor) {
      return;
    }

    const editor = brushSizeEditor;
    brushSizeEditor = null;

    if (commit) {
      setBrushSize(editor.value);
    }

    editor.remove();
    sizeValue.hidden = false;
    sizeValue.focus();
  }

  function openBrushSizeEditor() {
    if (brushSizeEditor) {
      brushSizeEditor.focus();
      brushSizeEditor.select();
      return;
    }

    const editor = document.createElement("input");
    editor.type = "number";
    editor.className = "size-value-editor";
    editor.min = String(minBrushSize);
    editor.max = String(maxBrushSize);
    editor.step = "1";
    editor.value = String(clampBrushSize(sizeSlider.value));
    editor.setAttribute("aria-label", `Brush size (${minBrushSize}-${maxBrushSize})`);

    brushSizeEditor = editor;
    sizeValue.hidden = true;
    sizeValue.insertAdjacentElement("afterend", editor);

    editor.focus();
    editor.select();

    editor.addEventListener("blur", () => {
      closeBrushSizeEditor(true);
    });

    editor.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        closeBrushSizeEditor(true);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        closeBrushSizeEditor(false);
      }
    });
  }

  function bindEvents() {
    sizeSlider.addEventListener("input", () => {
      setBrushSize(sizeSlider.value);
    });

    sizeValue.addEventListener("click", openBrushSizeEditor);
    sizeValue.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openBrushSizeEditor();
      }
    });

    for (const [toolName, button] of Object.entries(toolButtons)) {
      button.addEventListener("click", () => {
        setActiveTool(toolName);
      });
    }

    palette.addEventListener("click", (event) => {
      const target = event.target.closest(".swatch");
      if (!target) {
        return;
      }

      const selected = target.dataset.color;
      if (!selected) {
        return;
      }

      colorPicker.value = selected;
      setActiveSwatch(selected);
      setActiveTool("draw");
    });

    colorPicker.addEventListener("input", () => {
      setActiveSwatch(colorPicker.value);
      setActiveTool("draw");
    });
  }

  return {
    bindEvents,
    clampBrushSize,
    hideBrushPreview,
    pickCanvasColor,
    setActiveSwatch,
    setActiveTool,
    setBrushSize,
    updateBrushPreview
  };
}

export { createToolUiController };
