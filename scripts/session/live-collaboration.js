import {
  remove,
  set,
  update
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { normalizeLiveStroke } from "./board-session-utils.js";

export function createLiveCollaboration({
  presenceThrottleMs,
  localUserId,
  sessionId,
  joinedAt,
  getAuthUid,
  getState,
  getProfile,
  getCursorState,
  getLiveStroke,
  onError,
  onRemoteLiveStrokes
}) {
  let presenceRef = null;
  let liveStrokeRef = null;
  let lastPresenceWriteAt = 0;
  let lastLiveStrokeWriteAt = 0;
  let streamedStrokeId = "";
  let streamedPointCount = 0;
  let remoteSignature = "";

  function setRefs(refs) {
    presenceRef = refs.presenceRef;
    liveStrokeRef = refs.liveStrokeRef;
  }

  function queuePresenceSync(force = false) {
    const state = getState();
    if (!state.connected || !presenceRef || state.boardExpired) {
      return;
    }

    const now = Date.now();
    if (!force && now - lastPresenceWriteAt < presenceThrottleMs) {
      return;
    }

    lastPresenceWriteAt = now;
    const profile = getProfile();

    update(presenceRef, {
      authUid: getAuthUid(),
      userId: localUserId,
      joinedAt,
      name: profile.name,
      color: profile.color,
      cursor: getCursorState(),
      updatedAt: now
    }).catch(onError);
  }

  function resetLiveStrokeTracking() {
    streamedStrokeId = "";
    streamedPointCount = 0;
    lastLiveStrokeWriteAt = 0;
  }

  function clearLiveStroke() {
    resetLiveStrokeTracking();
    return liveStrokeRef ? remove(liveStrokeRef).catch(onError) : Promise.resolve();
  }

  function queueLiveStrokeSync(force = false) {
    const state = getState();
    if (!state.connected || !liveStrokeRef || state.boardExpired) {
      return;
    }

    const stroke = normalizeLiveStroke(getLiveStroke?.());
    if (!stroke) {
      return;
    }

    const now = Date.now();
    if (!force && now - lastLiveStrokeWriteAt < presenceThrottleMs) {
      return;
    }
    lastLiveStrokeWriteAt = now;

    const strokeChanged = streamedStrokeId !== stroke.id || stroke.points.length < streamedPointCount;
    if (strokeChanged) {
      streamedStrokeId = stroke.id;
      streamedPointCount = stroke.points.length;
      set(liveStrokeRef, {
        id: stroke.id,
        userId: stroke.userId,
        authorUid: getAuthUid(),
        pointerType: stroke.pointerType || null,
        tool: stroke.tool,
        color: stroke.color,
        size: stroke.size,
        points: stroke.points,
        pointCount: stroke.points.length,
        updatedAt: now
      }).catch(onError);
      return;
    }

    if (stroke.points.length <= streamedPointCount) {
      return;
    }

    const patch = {
      pointCount: stroke.points.length,
      updatedAt: now
    };
    for (let index = streamedPointCount; index < stroke.points.length; index += 1) {
      patch[`points/${index}`] = stroke.points[index];
    }

    streamedPointCount = stroke.points.length;
    update(liveStrokeRef, patch).catch(onError);
  }

  function getPointCount(liveStroke) {
    const reportedCount = Number(liveStroke.pointCount);
    if (Number.isInteger(reportedCount) && reportedCount >= 0) {
      return reportedCount;
    }

    if (Array.isArray(liveStroke.points)) {
      return liveStroke.points.length;
    }

    return liveStroke.points && typeof liveStroke.points === "object"
      ? Object.keys(liveStroke.points).length
      : 0;
  }

  function handlePresenceSnapshot(presence) {
    const signatureParts = [];

    for (const [presenceId, user] of Object.entries(presence || {})) {
      if (presenceId === sessionId || !user?.liveStroke || typeof user.liveStroke !== "object") {
        continue;
      }

      const liveStroke = user.liveStroke;
      signatureParts.push(
        `${presenceId}:${String(liveStroke.id || "")}:${Number(liveStroke.updatedAt) || 0}:${getPointCount(liveStroke)}`
      );
    }

    signatureParts.sort();
    const nextSignature = signatureParts.join("|");
    if (nextSignature === remoteSignature) {
      return;
    }
    remoteSignature = nextSignature;

    const strokes = [];
    for (const [presenceId, user] of Object.entries(presence || {})) {
      if (presenceId === sessionId) {
        continue;
      }

      const stroke = normalizeLiveStroke(user?.liveStroke);
      if (stroke && stroke.points.length > 1) {
        strokes.push(stroke);
      }
    }

    strokes.sort((a, b) => a.updatedAt - b.updatedAt || a.id.localeCompare(b.id));
    onRemoteLiveStrokes(strokes);
  }

  function resetRemoteLiveStrokes() {
    remoteSignature = "";
    onRemoteLiveStrokes([]);
  }

  return {
    setRefs,
    queuePresenceSync,
    queueLiveStrokeSync,
    clearLiveStroke,
    handlePresenceSnapshot,
    resetRemoteLiveStrokes
  };
}
