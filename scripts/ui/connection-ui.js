const DEFAULT_CONNECTION_LABELS = {
  connected: "Connected",
  reconnecting: "Reconnecting...",
  rulesBlocked: "Firebase rules blocked",
  databaseError: "Database error"
};

function isFirebaseConfigReady(firebaseConfig) {
  const required = [
    firebaseConfig.apiKey,
    firebaseConfig.authDomain,
    firebaseConfig.databaseURL,
    firebaseConfig.projectId,
    firebaseConfig.appId
  ];

  return required.every((item) => typeof item === "string" && item.length > 0 && !item.includes("YOUR_"));
}

function renderConnectionStatusUi({
  connectionStatus,
  retryConnectBtn,
  boardExpired,
  connected,
  permissionDenied,
  databaseError,
  labels
}) {
  const activeLabels = labels || DEFAULT_CONNECTION_LABELS;

  if (boardExpired) {
    connectionStatus.dataset.state = "disconnected";
    connectionStatus.textContent = "Board expired";
    retryConnectBtn.hidden = true;
    return;
  }

  if (permissionDenied) {
    connectionStatus.dataset.state = "disconnected";
    connectionStatus.textContent = activeLabels.rulesBlocked;
    retryConnectBtn.hidden = false;
    return;
  }

  if (databaseError) {
    connectionStatus.dataset.state = "disconnected";
    connectionStatus.textContent = activeLabels.databaseError;
    retryConnectBtn.hidden = false;
    return;
  }

  connectionStatus.dataset.state = connected ? "connected" : "disconnected";

  if (connected) {
    connectionStatus.textContent = activeLabels.connected;
    retryConnectBtn.hidden = true;
    return;
  }

  connectionStatus.textContent = activeLabels.reconnecting;
  retryConnectBtn.hidden = false;
}

function renderBoardExpiryTimerUi({ boardExpiryTimer, boardExpired, boardDeleteAt, formatRemainingTime }) {
  if (boardExpired) {
    boardExpiryTimer.textContent = "Board auto delete: 00:00:00 left";
    return;
  }

  if (!boardDeleteAt) {
    boardExpiryTimer.textContent = "Board auto delete: --:--:-- left";
    return;
  }

  const remaining = boardDeleteAt - Date.now();
  boardExpiryTimer.textContent = `Board auto delete: ${formatRemainingTime(remaining)} left`;
}

export {
  DEFAULT_CONNECTION_LABELS,
  isFirebaseConfigReady,
  renderBoardExpiryTimerUi,
  renderConnectionStatusUi
};
