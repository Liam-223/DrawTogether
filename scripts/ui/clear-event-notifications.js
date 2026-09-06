function createClearEventNotifier({ boardId, localUserId, notifications, sessionKeyPrefix }) {
  const storageKey = `${sessionKeyPrefix}.${boardId}`;
  const seenClearEventIds = loadSeenClearEventIds();

  function loadSeenClearEventIds() {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) {
        return new Set();
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return new Set();
      }

      return new Set(parsed.map((value) => String(value || "").trim()).filter(Boolean));
    } catch {
      return new Set();
    }
  }

  function persistSeenClearEventIds() {
    try {
      const values = Array.from(seenClearEventIds);
      const recentValues = values.slice(-200);
      sessionStorage.setItem(storageKey, JSON.stringify(recentValues));
    } catch {
      // Notification history is best-effort.
    }
  }

  function showClearBoardNotificationForEvent(event) {
    const isMyClear = event?.userId === localUserId;
    notifications.info(isMyClear ? "Board cleared." : "Board was cleared by the owner.");
  }

  function maybeNotifyForClearEvent(event, eventId) {
    if (event?.type !== "clear") {
      return;
    }

    const normalizedId = String(eventId || "").trim();
    if (normalizedId && seenClearEventIds.has(normalizedId)) {
      return;
    }

    showClearBoardNotificationForEvent(event);

    if (normalizedId) {
      seenClearEventIds.add(normalizedId);
      persistSeenClearEventIds();
    }
  }

  return {
    maybeNotifyForClearEvent
  };
}

export { createClearEventNotifier };
