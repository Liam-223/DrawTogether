import { computeLocalHistoryState } from "./history-utils.js";

export function createHistoryController({
  sharedEvents,
  localUserId,
  undoButton,
  redoButton,
  clearButton,
  clearCountdownSeconds,
  getBoardSession,
  publishOrApplyEvent,
  onError
}) {
  const clearButtonLabel = clearButton.textContent;
  let clearCountdownIntervalId = null;

  function getLocalState() {
    return computeLocalHistoryState(sharedEvents, localUserId);
  }

  function updateButtons() {
    const boardSession = getBoardSession();
    const history = getLocalState();
    const expired = boardSession?.isBoardExpired() === true;
    undoButton.disabled = expired || !history.undoStrokeId;
    redoButton.disabled = expired || !history.redoStrokeId;
  }

  function undo() {
    const boardSession = getBoardSession();
    if (boardSession?.isBoardExpired() === true) {
      return;
    }

    const { undoStrokeId } = getLocalState();
    if (undoStrokeId) {
      publishOrApplyEvent({ type: "visibility", targetId: undoStrokeId, visible: false, by: localUserId });
    }
  }

  function redo() {
    const boardSession = getBoardSession();
    if (boardSession?.isBoardExpired() === true) {
      return;
    }

    const { redoStrokeId } = getLocalState();
    if (redoStrokeId) {
      publishOrApplyEvent({ type: "visibility", targetId: redoStrokeId, visible: true, by: localUserId });
    }
  }

  function resetClearCountdown() {
    if (clearCountdownIntervalId) {
      clearInterval(clearCountdownIntervalId);
      clearCountdownIntervalId = null;
    }

    clearButton.textContent = clearButtonLabel;
    clearButton.classList.remove("is-countdown");
  }

  function updateClearButtonVisibility() {
    const boardSession = getBoardSession();
    const canClear = boardSession?.isBoardOwner() === true && boardSession.isBoardExpired() !== true;
    if (!canClear) {
      resetClearCountdown();
    }
    clearButton.hidden = !canClear;
  }

  function startClearCountdown() {
    let remaining = clearCountdownSeconds;
    clearButton.classList.add("is-countdown");
    clearButton.textContent = `Clear in ${remaining}s`;

    clearCountdownIntervalId = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        resetClearCountdown();
        getBoardSession()?.clearBoardHistory().catch(onError);
        return;
      }
      clearButton.textContent = `Clear in ${remaining}s`;
    }, 1000);
  }

  clearButton.addEventListener("click", () => {
    const boardSession = getBoardSession();
    if (boardSession?.isBoardExpired() === true || boardSession?.isBoardOwner() !== true) {
      return;
    }

    if (clearCountdownIntervalId) {
      resetClearCountdown();
    } else {
      startClearCountdown();
    }
  });
  undoButton.addEventListener("click", undo);
  redoButton.addEventListener("click", redo);

  return {
    redo,
    undo,
    updateButtons,
    updateClearButtonVisibility
  };
}
