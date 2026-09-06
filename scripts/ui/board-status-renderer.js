import { formatRemainingTime } from "../core/shared-utils.js";
import {
  DEFAULT_CONNECTION_LABELS,
  isFirebaseConfigReady,
  renderBoardExpiryTimerUi,
  renderConnectionStatusUi
} from "./connection-ui.js";

export function createBoardStatusRenderer({
  firebaseConfig,
  connectionStatus,
  retryConnectButton,
  boardExpiryTimer,
  openBoardsCount,
  getBoardSession
}) {
  function renderConnectionStatus() {
    const state = getBoardSession()?.getState() || {
      boardExpired: false,
      connected: false,
      permissionDenied: false,
      databaseError: false
    };

    renderConnectionStatusUi({
      connectionStatus,
      retryConnectBtn: retryConnectButton,
      boardExpired: state.boardExpired,
      connected: state.connected,
      permissionDenied: state.permissionDenied,
      databaseError: state.databaseError,
      labels: DEFAULT_CONNECTION_LABELS
    });
  }

  function renderBoardExpiryTimer() {
    const state = getBoardSession()?.getState() || {
      boardExpired: false,
      boardDeleteAt: null
    };

    renderBoardExpiryTimerUi({
      boardExpiryTimer,
      boardExpired: state.boardExpired,
      boardDeleteAt: state.boardDeleteAt,
      formatRemainingTime
    });
  }

  function renderOpenBoardsCount() {
    if (!openBoardsCount) {
      return;
    }

    if (!isFirebaseConfigReady(firebaseConfig)) {
      openBoardsCount.textContent = "Open boards: unavailable";
      return;
    }

    const state = getBoardSession()?.getState() || {
      connected: false,
      openBoardsCount: null,
      openBoardsUnavailable: false
    };

    if (state.openBoardsUnavailable) {
      openBoardsCount.textContent = "Open boards: unavailable";
    } else if (Number.isFinite(state.openBoardsCount)) {
      openBoardsCount.textContent = `Open boards: ${state.openBoardsCount}`;
    } else {
      openBoardsCount.textContent = state.connected
        ? "Open boards: not configured"
        : "Open boards: syncing...";
    }
  }

  return {
    renderAll() {
      renderConnectionStatus();
      renderBoardExpiryTimer();
      renderOpenBoardsCount();
    },
    renderBoardExpiryTimer,
    renderConnectionStatus,
    renderOpenBoardsCount
  };
}
