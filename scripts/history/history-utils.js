function findLastClearIndex(events) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].type === "clear") {
      return i;
    }
  }

  return -1;
}

function computeLocalHistoryState(sharedEvents, localUserId) {
  const lastClearIndex = findLastClearIndex(sharedEvents);
  const strokes = new Map();

  for (let i = lastClearIndex + 1; i < sharedEvents.length; i += 1) {
    const event = sharedEvents[i];

    switch (event.type) {
      case "stroke": {
        strokes.set(event.id, {
          id: event.id,
          ownerId: event.userId,
          visible: true,
          lastBecameVisibleAt: i,
          lastBecameHiddenAt: -1,
          lastHiddenBy: null
        });
        break;
      }
      case "visibility": {
        const target = strokes.get(event.targetId);
        if (!target) {
          break;
        }

        const nextVisible = Boolean(event.visible);

        if (nextVisible) {
          if (!target.visible) {
            target.visible = true;
            target.lastBecameVisibleAt = i;
          }
        } else if (target.visible) {
          target.visible = false;
          target.lastBecameHiddenAt = i;
          target.lastHiddenBy = event.by || null;
        }
        break;
      }
      default:
        break;
    }
  }

  let undoCandidate = null;
  let redoCandidate = null;

  for (const stroke of strokes.values()) {
    if (stroke.ownerId !== localUserId) {
      continue;
    }

    if (stroke.visible) {
      if (!undoCandidate || stroke.lastBecameVisibleAt > undoCandidate.lastBecameVisibleAt) {
        undoCandidate = stroke;
      }
      continue;
    }

    const hiddenByMe = stroke.lastHiddenBy === localUserId && stroke.lastBecameHiddenAt >= 0;
    if (!hiddenByMe) {
      continue;
    }

    if (!redoCandidate || stroke.lastBecameHiddenAt > redoCandidate.lastBecameHiddenAt) {
      redoCandidate = stroke;
    }
  }

  return {
    undoStrokeId: undoCandidate ? undoCandidate.id : null,
    redoStrokeId: redoCandidate ? redoCandidate.id : null
  };
}

function computeVisibleOps(sharedEvents) {
  const lastClearIndex = findLastClearIndex(sharedEvents);
  const visibleMap = new Map();

  for (const op of sharedEvents.slice(lastClearIndex + 1)) {
    switch (op.type) {
      case "stroke":
        visibleMap.set(op.id, op);
        break;
      case "visibility": {
        const target = visibleMap.get(op.targetId);
        if (target) {
          target.hidden = !op.visible;
        }
        break;
      }
      default:
        break;
    }
  }

  return Array.from(visibleMap.values()).filter((op) => !op.hidden);
}

export {
  computeLocalHistoryState,
  computeVisibleOps,
  findLastClearIndex
};
