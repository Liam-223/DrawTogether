import { appConfig } from "../../app-config.js";
import { clamp } from "../core/shared-utils.js";

const PROFILE_STORAGE_KEY = "drawtogether.profile.v1";
const DEFAULT_PROFILE_COLOR = "#27b2c9";
const VALID_TOOLS = new Set(["draw", "airbrush", "eraser", "pipette"]);

function randomGuestName() {
  return `Guest-${Math.floor(100 + Math.random() * 900)}`;
}

function sanitizeName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 24);
}

function sanitizeColor(value) {
  const color = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : DEFAULT_PROFILE_COLOR;
}

function sanitizeTool(value) {
  return VALID_TOOLS.has(value) ? value : "draw";
}

function sanitizeBrushSize(value, minBrushSize, maxBrushSize, defaultBrushSize) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return defaultBrushSize;
  }

  return clamp(Math.round(numeric), minBrushSize, maxBrushSize);
}

function readBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function createDefaultProfile(defaultBrushSize) {
  return {
    name: randomGuestName(),
    color: DEFAULT_PROFILE_COLOR,
    brushSize: defaultBrushSize,
    activeTool: "draw",
    showQuickColors: appConfig.board?.showQuickColorsDefault === true,
    showPattern: appConfig.board?.showPatternDefault !== false,
    showFooterContact: appConfig.ui?.showFooterContactDefault !== false
  };
}

function loadProfile(minBrushSize, maxBrushSize, defaultBrushSize) {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) {
      return createDefaultProfile(defaultBrushSize);
    }

    const saved = JSON.parse(raw);
    return {
      name: sanitizeName(saved.name) || randomGuestName(),
      color: sanitizeColor(saved.color),
      brushSize: sanitizeBrushSize(saved.brushSize, minBrushSize, maxBrushSize, defaultBrushSize),
      activeTool: sanitizeTool(saved.activeTool),
      showQuickColors: readBoolean(
        saved.showQuickColors,
        appConfig.board?.showQuickColorsDefault === true
      ),
      showPattern: readBoolean(
        saved.showPattern,
        appConfig.board?.showPatternDefault !== false
      ),
      showFooterContact: readBoolean(
        saved.showFooterContact,
        appConfig.ui?.showFooterContactDefault !== false
      )
    };
  } catch {
    return createDefaultProfile(defaultBrushSize);
  }
}

function saveProfile(profile) {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

export {
  PROFILE_STORAGE_KEY,
  createDefaultProfile,
  loadProfile,
  randomGuestName,
  sanitizeBrushSize,
  sanitizeColor,
  sanitizeName,
  sanitizeTool,
  saveProfile
};
