export function createSessionEventHub() {
  const listeners = {
    state: new Set(),
    presence: new Set(),
    remoteEvent: new Set(),
    liveStrokes: new Set(),
    expire: new Set()
  };

  function subscribe(group, listener) {
    if (typeof listener !== "function") {
      return () => {};
    }

    listeners[group].add(listener);
    return () => listeners[group].delete(listener);
  }

  return {
    onStateChange: (listener) => subscribe("state", listener),
    onPresenceChange: (listener) => subscribe("presence", listener),
    onRemoteEvent: (listener) => subscribe("remoteEvent", listener),
    onLiveStrokesChange: (listener) => subscribe("liveStrokes", listener),
    onExpire: (listener) => subscribe("expire", listener),

    emitStateChange(state) {
      for (const listener of listeners.state) listener(state);
    },
    emitPresenceChange(presence) {
      for (const listener of listeners.presence) listener(presence || {});
    },
    emitRemoteEvent(event, eventId) {
      for (const listener of listeners.remoteEvent) listener(event, eventId);
    },
    emitLiveStrokesChange(strokes) {
      for (const listener of listeners.liveStrokes) listener(strokes);
    },
    emitExpire() {
      for (const listener of listeners.expire) listener();
    }
  };
}
