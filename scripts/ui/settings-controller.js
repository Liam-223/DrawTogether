import {
  randomGuestName,
  sanitizeColor,
  sanitizeName,
  sanitizeTool,
  saveProfile
} from "../state/profile-storage.js";

export function createSettingsController({
  dialog,
  form,
  openButton,
  cancelButton,
  inputs,
  getProfile,
  setProfile,
  applyProfileToUi,
  applyProfileVisibility,
  clampBrushSize,
  redrawScene,
  queuePresenceSync,
  renderOpenBoardsCount
}) {
  let profileSnapshot = null;
  let saved = false;

  function preview() {
    const profile = getProfile();
    profile.showQuickColors = inputs.showQuickColors.checked;
    profile.showRecentColors = inputs.showRecentColors.checked;
    profile.showPattern = inputs.showPattern.checked;
    profile.showFooterContact = inputs.showFooterContact.checked;
    applyProfileVisibility();
    redrawScene();
  }

  function restoreSnapshot() {
    if (!profileSnapshot) {
      return;
    }

    setProfile(profileSnapshot);
    profileSnapshot = null;
    applyProfileToUi();
    redrawScene();
  }

  openButton.addEventListener("click", () => {
    profileSnapshot = { ...getProfile() };
    saved = false;
    applyProfileToUi();
    renderOpenBoardsCount();
    dialog.showModal();
  });

  for (const input of [
    inputs.showQuickColors,
    inputs.showRecentColors,
    inputs.showPattern,
    inputs.showFooterContact
  ]) {
    input.addEventListener("change", preview);
  }

  cancelButton.addEventListener("click", () => dialog.close());

  dialog.addEventListener("close", () => {
    if (!saved) {
      restoreSnapshot();
    } else {
      profileSnapshot = null;
    }
    saved = false;
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const current = getProfile();
    const profile = {
      name: sanitizeName(inputs.displayName.value) || randomGuestName(),
      color: sanitizeColor(inputs.identityColor.value),
      brushSize: clampBrushSize(inputs.brushSize.value),
      activeTool: sanitizeTool(current.activeTool),
      recentColors: current.recentColors || [],
      showQuickColors: inputs.showQuickColors.checked,
      showRecentColors: inputs.showRecentColors.checked,
      showPattern: inputs.showPattern.checked,
      showFooterContact: inputs.showFooterContact.checked
    };

    setProfile(profile);
    saved = true;
    applyProfileToUi();
    saveProfile(profile);
    dialog.close();
    redrawScene();
    queuePresenceSync(true);
  });
}
