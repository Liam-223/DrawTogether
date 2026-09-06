function isEditableElementTarget(target) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT")
  );
}

export function createKeyboardController({
  canvas,
  shortcutsDialog,
  keyboardToolShortcuts,
  setActiveTool,
  onUndo,
  onRedo,
  stopBrushResizeMode,
  endPan
}) {
  let spacePressed = false;
  let shiftPressed = false;

  function handleKeyDown(event) {
    const editableTarget = isEditableElementTarget(event.target);

    if (!editableTarget && !event.ctrlKey && !event.metaKey && !event.altKey && event.key === "?") {
      event.preventDefault();
      if (shortcutsDialog && !shortcutsDialog.open) {
        shortcutsDialog.showModal();
      }
      return;
    }

    if (shortcutsDialog?.open) {
      return;
    }

    if (!editableTarget && (event.ctrlKey || event.metaKey)) {
      const key = event.key.toLowerCase();

      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        onUndo();
        return;
      }

      if (key === "y" || (key === "z" && event.shiftKey)) {
        event.preventDefault();
        onRedo();
        return;
      }
    }

    if (!editableTarget && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const shortcutTool = keyboardToolShortcuts[event.key.toLowerCase()];
      if (shortcutTool) {
        event.preventDefault();
        setActiveTool(shortcutTool);
        return;
      }
    }

    if (event.key === "Shift") {
      shiftPressed = true;
    }

    if (event.code === "Space") {
      spacePressed = true;
      event.preventDefault();
    }
  }

  function handleKeyUp(event) {
    if (event.key === "Shift") {
      shiftPressed = false;
      stopBrushResizeMode();
    }

    if (event.code === "Space") {
      spacePressed = false;
      endPan();
    }
  }

  function handleWindowBlur() {
    shiftPressed = false;
    stopBrushResizeMode();
  }

  return {
    handleKeyDown,
    handleKeyUp,
    handleWindowBlur,
    isSpacePressed: () => spacePressed,
    isShiftPressed: () => shiftPressed
  };
}
