const ACCESS_CODE_HASH_PATTERN = /^[a-f0-9]{64}$/;
const MAX_POINT_COORDINATE = 1_000_000;
const MAX_STROKE_POINTS = 10_000;
const MAX_STROKE_SIZE = 5_000;
const STROKE_TOOLS = new Set(["draw", "eraser", "airbrush"]);
const POINTER_TYPES = new Set(["mouse", "pen", "touch"]);

export function createStateStore(initialState, onStateChange) {
  const state = { ...initialState };

  function getState() {
    return { ...state };
  }

  function updateState(patch) {
    let changed = false;

    for (const [key, value] of Object.entries(patch)) {
      if (state[key] !== value) {
        state[key] = value;
        changed = true;
      }
    }

    if (changed) {
      onStateChange?.(getState());
    }
  }

  return { getState, updateState };
}

export function isPermissionDeniedError(error) {
  if (!error) {
    return false;
  }

  const code = String(error.code || "").toLowerCase();
  const message = String(error.message || "").toLowerCase();
  return code.includes("permission_denied") || message.includes("permission_denied");
}

function createBoardPolicy(now, boardTtlMs, protectedBoard, ownerUid) {
  return {
    createdAt: now,
    deleteAt: now + boardTtlMs,
    ownerUid,
    protected: protectedBoard === true
  };
}

export function resolveBoardPolicyDraft({
  current,
  now,
  boardTtlMs,
  requestedProtected,
  authUid
}) {
  if (!current || typeof current.createdAt !== "number" || Number(current.deleteAt) <= now) {
    return createBoardPolicy(now, boardTtlMs, requestedProtected, authUid);
  }

  return current;
}

export function sanitizePolicyAccessCodeHash(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ACCESS_CODE_HASH_PATTERN.test(normalized) ? normalized : "";
}

export function isPolicyProtected(policy) {
  if (!policy || typeof policy !== "object") {
    return false;
  }

  return policy.protected === true || Boolean(sanitizePolicyAccessCodeHash(policy.accessCodeHash));
}

function isBoundedString(value, maxLength) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isValidPoint(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return false;
  }

  if (Math.abs(point.x) > MAX_POINT_COORDINATE || Math.abs(point.y) > MAX_POINT_COORDINATE) {
    return false;
  }

  return point.p === undefined || (Number.isFinite(point.p) && point.p >= 0 && point.p <= 1);
}

function isValidStrokeShape(event, minPointCount = 2) {
  if (!isBoundedString(event.id, 128) || !isBoundedString(event.userId, 128)) {
    return false;
  }

  if (!isBoundedString(event.tool, 16) || !STROKE_TOOLS.has(event.tool)) {
    return false;
  }

  if (
    !Array.isArray(event.points) ||
    event.points.length < minPointCount ||
    event.points.length > MAX_STROKE_POINTS ||
    !event.points.every(isValidPoint)
  ) {
    return false;
  }

  if (!isBoundedString(event.color, 32)) {
    return false;
  }

  if (!Number.isFinite(event.size) || event.size <= 0 || event.size > MAX_STROKE_SIZE) {
    return false;
  }

  return event.pointerType === undefined || POINTER_TYPES.has(event.pointerType);
}

export function isValidBoardEvent(event) {
  if (!event || typeof event !== "object" || !isBoundedString(event.type, 16)) {
    return false;
  }

  if (event.authorUid !== undefined && !isBoundedString(event.authorUid, 128)) {
    return false;
  }

  switch (event.type) {
    case "clear":
      return isBoundedString(event.userId, 128);
    case "visibility":
      return (
        isBoundedString(event.targetId, 128) &&
        isBoundedString(event.by, 128) &&
        typeof event.visible === "boolean"
      );
    case "stroke":
      return isValidStrokeShape(event, 2);
    default:
      return false;
  }
}

export function normalizeLiveStroke(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const rawPoints = value.points;
  let points = [];

  if (Array.isArray(rawPoints)) {
    points = rawPoints.filter((point) => point !== null && point !== undefined);
  } else if (rawPoints && typeof rawPoints === "object") {
    points = Object.entries(rawPoints)
      .filter(([key]) => /^\d+$/.test(key))
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, point]) => point);
  }

  const stroke = {
    type: "stroke",
    id: value.id,
    userId: value.userId,
    authorUid: value.authorUid,
    pointerType: value.pointerType,
    tool: value.tool,
    color: value.color,
    size: value.size,
    points
  };

  if (!isValidStrokeShape(stroke, 1)) {
    return null;
  }

  return {
    ...stroke,
    updatedAt: Number.isFinite(value.updatedAt) ? value.updatedAt : 0
  };
}

export async function hashAccessCode(code) {
  const normalized = String(code || "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }

  const payload = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", payload);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizeOpenBoardsCount(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Math.max(0, Math.round(numeric));
}
