const rootElement = document.documentElement;

function byId(id) {
  return document.getElementById(id);
}

const topbar = byId("topbar");
const boardMenu = byId("boardMenu");
const mobileMenuBtn = byId("mobileMenuBtn");
const drawingControls = byId("drawingControls");

const canvas = byId("boardCanvas");
const ctx = canvas.getContext("2d");

const colorPicker = byId("colorPicker");
const palette = byId("palette");
const recentPalette = byId("recentPalette");
const sizeSlider = byId("sizeSlider");
const sizeValue = byId("sizeValue");

const drawToolBtn = byId("drawToolBtn");
const airbrushToolBtn = byId("airbrushToolBtn");
const eraserToolBtn = byId("eraserToolBtn");
const pipetteToolBtn = byId("pipetteToolBtn");
const undoBtn = byId("undoBtn");
const redoBtn = byId("redoBtn");
const resetViewBtn = byId("resetViewBtn");
const clearBoardBtn = byId("clearBoardBtn");

const copyInviteBtn = byId("copyInviteBtn");
const settingsBtn = byId("settingsBtn");
const retryConnectBtn = byId("retryConnectBtn");
const newBoardBtn = byId("newBoardBtn");
const joinBoardBtn = byId("joinBoardBtn");
const boardCodePill = byId("boardCodePill");
const boardCodeValue = byId("boardCodeValue");
const connectionStatus = byId("connectionStatus");
const loadingScreen = byId("loadingScreen");
const peerCount = byId("peerCount");

const liveCursors = byId("liveCursors");
const mouseCoordinates = byId("mouseCoordinates");
const zoomPercentage = byId("zoomPercentage");
const boardNotifications = byId("boardNotifications");
const cameraMoveHint = byId("cameraMoveHint");

const shortcutsDialog = byId("shortcutsDialog");
const settingsDialog = byId("settingsDialog");
const settingsForm = byId("settingsForm");
const displayNameInput = byId("displayNameInput");
const identityColorInput = byId("identityColorInput");
const showQuickColorsInput = byId("showQuickColorsInput");
const showRecentColorsInput = byId("showRecentColorsInput");
const showPatternInput = byId("showPatternInput");
const showFooterContactInput = byId("showFooterContactInput");
const exportPngSettingsBtn = byId("exportPngSettingsBtn");
const cancelSettingsBtn = byId("cancelSettingsBtn");
const boardExpiryTimer = byId("boardExpiryTimer");
const openBoardsCount = byId("openBoardsCount");

const exportDialog = byId("exportDialog");
const exportPngForm = byId("exportPngForm");
const exportAreaSelect = byId("exportAreaSelect");
const exportIncludeGridInput = byId("exportIncludeGridInput");
const exportBackgroundSelect = byId("exportBackgroundSelect");
const exportFileNameInput = byId("exportFileNameInput");
const exportResolutionHint = byId("exportResolutionHint");
const cancelExportBtn = byId("cancelExportBtn");

const boardActionDialog = byId("boardActionDialog");
const boardActionForm = byId("boardActionForm");
const boardActionTitle = byId("boardActionTitle");
const boardActionMessage = byId("boardActionMessage");
const boardActionInputWrap = byId("boardActionInputWrap");
const boardActionInputLabel = byId("boardActionInputLabel");
const boardActionInput = byId("boardActionInput");
const boardActionCancelBtn = byId("boardActionCancelBtn");
const boardActionConfirmBtn = byId("boardActionConfirmBtn");

const brushPreview = document.createElement("div");
brushPreview.className = "brush-preview";
document.body.append(brushPreview);

export {
  airbrushToolBtn,
  boardActionCancelBtn,
  boardActionConfirmBtn,
  boardActionDialog,
  boardActionForm,
  boardActionInput,
  boardActionInputLabel,
  boardActionInputWrap,
  boardActionMessage,
  boardActionTitle,
  boardCodePill,
  boardCodeValue,
  boardMenu,
  boardExpiryTimer,
  boardNotifications,
  brushPreview,
  cameraMoveHint,
  cancelExportBtn,
  cancelSettingsBtn,
  canvas,
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
  exportPngSettingsBtn,
  exportResolutionHint,
  identityColorInput,
  joinBoardBtn,
  liveCursors,
  loadingScreen,
  mobileMenuBtn,
  mouseCoordinates,
  newBoardBtn,
  openBoardsCount,
  palette,
  peerCount,
  recentPalette,
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
  showRecentColorsInput,
  shortcutsDialog,
  sizeSlider,
  sizeValue,
  topbar,
  undoBtn,
  zoomPercentage
};
