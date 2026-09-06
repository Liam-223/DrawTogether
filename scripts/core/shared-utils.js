const BOARD_ID_RANDOM_BYTES = 8;
const BOARD_ID_PATTERN = /^[a-z0-9_-]{4,64}$/;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function generateBoardId() {
  const randomBytes = new Uint8Array(BOARD_ID_RANDOM_BYTES);
  crypto.getRandomValues(randomBytes);
  return Array.from(randomBytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function sanitizeBoardId(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (BOARD_ID_PATTERN.test(normalized)) {
    return normalized;
  }

  return "";
}

function getBoardId() {
  const url = new URL(window.location.href);
  let board = sanitizeBoardId(url.searchParams.get("board"));

  if (!board) {
    board = generateBoardId();
    url.searchParams.set("board", board);
    window.history.replaceState({}, "", url);
  }

  return board;
}

function countOnlineUsers(presence) {
  if (!presence || typeof presence !== "object") {
    return 0;
  }

  const onlineUsers = new Set();

  for (const [sessionId, entry] of Object.entries(presence)) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const identity = String(entry.authUid || entry.userId || sessionId).trim();
    if (identity) {
      onlineUsers.add(identity);
    }
  }

  return onlineUsers.size;
}

function formatRemainingTime(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b]
    .map((value) => clamp(value, 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

function clampPressure(value, minPressure = 0.12) {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return clamp(value, minPressure, 1);
}

function getPointPressure(point, minPressure = 0.12) {
  return clampPressure(point?.p, minPressure);
}

function isPressureSensitiveStroke(stroke) {
  if (!stroke || !stroke.points || stroke.points.length < 2) {
    return false;
  }

  if (stroke.pointerType === "pen") {
    return true;
  }

  return stroke.points.some((point) => Number.isFinite(point?.p));
}

export {
  clamp,
  clampPressure,
  countOnlineUsers,
  formatRemainingTime,
  generateBoardId,
  getPointPressure,
  getBoardId,
  isPressureSensitiveStroke,
  sanitizeBoardId,
  rgbToHex
};
