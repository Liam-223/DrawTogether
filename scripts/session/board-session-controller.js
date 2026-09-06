import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getDatabase,
  get,
  ref,
  push,
  set,
  update,
  remove,
  query,
  orderByChild,
  endAt,
  onChildAdded,
  onValue,
  onDisconnect,
  goOnline,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import {
  createStateStore,
  hashAccessCode,
  isPermissionDeniedError,
  normalizeOpenBoardsCount,
  resolveBoardPolicyDraft,
  sanitizePolicyAccessCodeHash,
  isPolicyProtected,
  isValidBoardEvent
} from "./board-session-utils.js";
import { createSessionEventHub } from "./session-event-hub.js";
import { createLiveCollaboration } from "./live-collaboration.js";
import { authorizeBoardSession } from "./board-authorization.js";

const BOARD_TIMER_TICK_MS = 1_000;
const MAX_TIMEOUT_MS = 2_147_483_647;

export function createBoardSessionController({
  firebase,
  board,
  access,
  runtime
}) {
  const {
    firebaseConfig,
    boardTtlMs,
    presenceThrottleMs
  } = firebase;
  const {
    boardId,
    localUserId,
    sessionId,
    joinedAt
  } = board;
  const {
    promptForOptionalNewBoardAccessCode,
    promptForBoardJoinCode,
    loadCachedBoardAccessCode,
    saveCachedBoardAccessCode,
    showBoardNotice,
    redirectToNewBoard
  } = access;
  const {
    getProfile,
    getCursorState,
    getLiveStroke,
    applyLocalEvent,
    onLocalBoardCleared
  } = runtime;

  const eventHub = createSessionEventHub();

  const stateStore = createStateStore(
    {
      connected: false,
      permissionDenied: false,
      databaseError: false,
      boardDeleteAt: null,
      openBoardsCount: null,
      openBoardsUnavailable: false,
      boardExpired: false,
      boardOwnerUid: "",
      isBoardOwner: false
    },
    eventHub.emitStateChange
  );
  const getState = stateStore.getState;
  const updateState = stateStore.updateState;

  let database = null;
  let authUid = "";
  let boardRootRef = null;
  let boardAccessSessionRef = null;
  let boardPolicyRef = null;
  let boardSecretRef = null;
  let boardAccessSessionsRootRef = null;
  let myPresenceRef = null;
  let myLiveStrokeRef = null;
  let eventsRef = null;
  let openBoardsCountRef = null;
  let boardCountdownIntervalId = null;
  let boardExpireTimeoutId = null;
  let activeAccessCodeHash = "";
  let databaseSocketConnected = false;

  const liveCollaboration = createLiveCollaboration({
    presenceThrottleMs,
    localUserId,
    sessionId,
    joinedAt,
    getAuthUid: () => authUid,
    getState,
    getProfile,
    getCursorState,
    getLiveStroke,
    onError: handleCollaborationError,
    onRemoteLiveStrokes: eventHub.emitLiveStrokesChange
  });

  function clearExpiryTimers() {
    if (boardCountdownIntervalId) {
      clearInterval(boardCountdownIntervalId);
      boardCountdownIntervalId = null;
    }

    if (boardExpireTimeoutId) {
      clearTimeout(boardExpireTimeoutId);
      boardExpireTimeoutId = null;
    }
  }

  function handleDatabaseError(error) {
    if (isPermissionDeniedError(error)) {
      updateState({
        permissionDenied: true,
        connected: false
      });
      return;
    }

    updateState({ databaseError: true });
  }

  function handleCollaborationError(error) {
    console.warn("Realtime collaboration sync failed:", error);
  }

  function markDatabaseHealthy() {
    const state = getState();
    if (state.permissionDenied || state.databaseError) {
      updateState({ permissionDenied: false, databaseError: false });
    }
  }

  function handleOpenBoardsError(error) {
    if (isPermissionDeniedError(error)) {
      updateState({
        openBoardsUnavailable: true,
        openBoardsCount: null
      });
    }
  }

  async function expireBoardNow(attemptCleanup = true) {
    if (getState().boardExpired) {
      return;
    }

    updateState({
      boardExpired: true,
      connected: false,
      permissionDenied: false
    });
    clearExpiryTimers();
    liveCollaboration.resetRemoteLiveStrokes();
    eventHub.emitExpire();

    if (!attemptCleanup || !database || !getState().isBoardOwner) {
      return;
    }

    const cleanupResults = await Promise.allSettled([
      remove(ref(database, `boards/${boardId}`)),
      remove(boardSecretRef),
      remove(boardAccessSessionsRootRef)
    ]);

    await remove(boardPolicyRef).catch(handleDatabaseError);

    if (cleanupResults[0].status === "fulfilled") {
      await adjustOpenBoardsCount(-1);
    }
  }

  function scheduleBoardExpiry(deleteAt) {
    updateState({ boardDeleteAt: deleteAt || null });
    clearExpiryTimers();

    if (!deleteAt) {
      return;
    }

    const remaining = deleteAt - Date.now();
    if (remaining <= 0) {
      expireBoardNow(true);
      return;
    }

    boardCountdownIntervalId = setInterval(() => {
      eventHub.emitStateChange(getState());
    }, BOARD_TIMER_TICK_MS);
    boardExpireTimeoutId = setTimeout(() => {
      expireBoardNow(true);
    }, Math.min(remaining, MAX_TIMEOUT_MS));
  }

  async function adjustOpenBoardsCount(delta) {
    if (!openBoardsCountRef || !Number.isFinite(delta) || delta === 0) {
      return;
    }

    try {
      const result = await runTransaction(openBoardsCountRef, (current) => {
        const baseCount = normalizeOpenBoardsCount(current);
        const safeBase = Number.isFinite(baseCount) ? baseCount : 0;
        return Math.max(0, safeBase + delta);
      });

      const nextValue = normalizeOpenBoardsCount(result?.snapshot?.val());
      updateState({
        openBoardsCount: Number.isFinite(nextValue) ? nextValue : null,
        openBoardsUnavailable: false
      });
    } catch (error) {
      handleOpenBoardsError(error);
    }
  }

  function publishEvent(event) {
    if (getState().boardExpired || !eventsRef || !boardRootRef || !isValidBoardEvent(event)) {
      return Promise.resolve();
    }

    const eventPayload = {
      ...event,
      authorUid: authUid,
      at: serverTimestamp()
    };

    let writePromise;
    if (event.type === "stroke") {
      const eventRef = push(eventsRef);
      if (!eventRef.key) {
        return Promise.reject(new Error("Unable to allocate event id."));
      }

      writePromise = update(boardRootRef, {
        [`events/${eventRef.key}`]: eventPayload,
        [`strokeOwners/${event.id}`]: authUid
      });
    } else {
      writePromise = set(push(eventsRef), eventPayload);
    }

    return writePromise.catch((error) => {
      handleDatabaseError(error);
      throw error;
    });
  }

  function publishOrApplyEvent(event) {
    if (!isValidBoardEvent(event)) {
      return Promise.resolve(false);
    }

    if (eventsRef) {
      return publishEvent(event).then(() => true);
    }

    applyLocalEvent(event);
    return Promise.resolve(true);
  }

  async function clearBoardHistory() {
    const state = getState();
    if (state.boardExpired || !state.isBoardOwner || !eventsRef || !boardRootRef) {
      return false;
    }

    const clearRef = push(eventsRef);
    if (!clearRef.key) {
      throw new Error("Unable to allocate clear event id.");
    }

    const clearEvent = {
      type: "clear",
      userId: localUserId,
      authorUid: authUid,
      at: serverTimestamp()
    };

    try {
      // Publish the clear marker before compacting history so connected clients reset first.
      await set(clearRef, clearEvent);
      onLocalBoardCleared?.();

      const clearSnapshot = await get(clearRef);
      const clearAt = Number(clearSnapshot.child("at").val());
      if (!Number.isFinite(clearAt)) {
        return true;
      }

      // Keep anything written at or after the marker.
      const oldEventsQuery = query(eventsRef, orderByChild("at"), endAt(clearAt - 1));
      const oldEventsSnapshot = await get(oldEventsQuery);
      const cleanupPatch = {};

      oldEventsSnapshot.forEach((snapshot) => {
        const eventId = snapshot.key;
        const oldEvent = snapshot.val();
        if (!eventId) {
          return;
        }

        cleanupPatch[`events/${eventId}`] = null;

        if (oldEvent?.type === "stroke" && typeof oldEvent.id === "string" && oldEvent.id) {
          cleanupPatch[`strokeOwners/${oldEvent.id}`] = null;
        }
      });

      if (Object.keys(cleanupPatch).length > 0) {
        await update(boardRootRef, cleanupPatch);
      }

      return true;
    } catch (error) {
      handleDatabaseError(error);
      throw error;
    }
  }

  async function activateRealtimeConnection() {
    if (getState().boardExpired) {
      return;
    }

    updateState({
      connected: true,
      permissionDenied: false,
      databaseError: false
    });

    if (myPresenceRef) {
      try {
        await onDisconnect(myPresenceRef).remove();
      } catch (error) {
        handleCollaborationError(error);
      }
    }

    await liveCollaboration.queuePresenceSync(true);
    await liveCollaboration.queueLiveStrokeSync(true);
  }

  async function initialize() {
    const firebaseApp = initializeApp(firebaseConfig);
    database = getDatabase(firebaseApp);
    const auth = getAuth(firebaseApp);
    const authResult = await signInAnonymously(auth);
    authUid = String(authResult.user?.uid || "").trim();
    if (!authUid) {
      throw new Error("Anonymous authentication failed.");
    }

    const boardPath = `boards/${boardId}`;
    const boardPolicyPath = `boardAccessPolicies/${boardId}`;
    const boardSecretPath = `boardAccessSecrets/${boardId}`;
    const boardAccessSessionsPath = `boardAccessSessions/${boardId}`;
    const connectedRef = ref(database, ".info/connected");
    openBoardsCountRef = ref(database, "publicStats/openBoards");
    boardRootRef = ref(database, boardPath);
    const presenceRef = ref(database, `${boardPath}/presence`);
    myPresenceRef = ref(database, `${boardPath}/presence/${sessionId}`);
    myLiveStrokeRef = ref(database, `${boardPath}/presence/${sessionId}/liveStroke`);
    liveCollaboration.setRefs({ presenceRef: myPresenceRef, liveStrokeRef: myLiveStrokeRef });
    eventsRef = ref(database, `${boardPath}/events`);
    boardPolicyRef = ref(database, boardPolicyPath);
    boardSecretRef = ref(database, boardSecretPath);
    boardAccessSessionsRootRef = ref(database, boardAccessSessionsPath);
    boardAccessSessionRef = ref(database, `${boardAccessSessionsPath}/${authUid}`);

    let wasBoardMissing = false;
    let existingPolicy = null;

    try {
      const policySnapshot = await get(boardPolicyRef);
      existingPolicy = policySnapshot.val();
      wasBoardMissing = !existingPolicy || typeof existingPolicy.createdAt !== "number";
    } catch (error) {
      handleDatabaseError(error);
    }

    const boardWasExpired = Boolean(
      existingPolicy &&
      typeof existingPolicy.createdAt === "number" &&
      Number(existingPolicy.deleteAt) <= Date.now()
    );
    let requestedAccessCode = "";
    let resolvedPolicy = existingPolicy || null;

    if (wasBoardMissing || boardWasExpired) {
      requestedAccessCode = await promptForOptionalNewBoardAccessCode();
      const requestedAccessCodeHash = await hashAccessCode(requestedAccessCode);

      const transactionResult = await runTransaction(boardPolicyRef, (current) => {
        return resolveBoardPolicyDraft({
          current,
          now: Date.now(),
          boardTtlMs,
          requestedProtected: Boolean(requestedAccessCodeHash),
          authUid
        });
      });

      resolvedPolicy = transactionResult?.snapshot?.val() || null;
      const boardWasReset = boardWasExpired &&
        Number(resolvedPolicy?.createdAt) > Number(existingPolicy?.createdAt);

      if (boardWasReset) {
        await Promise.allSettled([
          remove(ref(database, `boards/${boardId}`)),
          remove(boardAccessSessionsRootRef)
        ]);
      }

      const policyCreatedByThisClient =
        String(resolvedPolicy?.ownerUid || "") === authUid &&
        Number(resolvedPolicy?.createdAt) !== Number(existingPolicy?.createdAt);

      if (policyCreatedByThisClient) {
        try {
          if (requestedAccessCodeHash) {
            await set(boardSecretRef, {
              ownerUid: authUid,
              accessCodeHash: requestedAccessCodeHash
            });
          } else {
            await remove(boardSecretRef);
          }
        } catch (error) {
          handleDatabaseError(error);
          await showBoardNotice(
            "The board was created, but its access policy could not be secured. Please create a new board after updating the Firebase rules included with this project.",
            "Board Security Error"
          );
          redirectToNewBoard();
          return;
        }
      }
    }

    if (!resolvedPolicy || typeof resolvedPolicy.createdAt !== "number") {
      await showBoardNotice(
        "This board is unavailable right now. You will be redirected to a new board.",
        "Board Unavailable"
      );
      redirectToNewBoard();
      return;
    }

    let protectedBoard = isPolicyProtected(resolvedPolicy);
    const legacyAccessCodeHash = sanitizePolicyAccessCodeHash(resolvedPolicy?.accessCodeHash);
    const boardOwnerUid = String(resolvedPolicy?.ownerUid || "").trim();
    const boardDeleteAt = Number(resolvedPolicy?.deleteAt);
    const boardWasCreatedNow = wasBoardMissing && boardOwnerUid === authUid;

    if (legacyAccessCodeHash && boardOwnerUid !== authUid) {
      await showBoardNotice(
        "This protected board was created with the older access format. Its owner needs to open it once after the security update before other people can join.",
        "Board Security Update"
      );
      redirectToNewBoard();
      return;
    }

    if (legacyAccessCodeHash && boardOwnerUid === authUid) {
      try {
        await set(boardSecretRef, {
          ownerUid: authUid,
          accessCodeHash: legacyAccessCodeHash
        });
        await update(boardPolicyRef, {
          protected: true,
          accessCodeHash: null
        });
        resolvedPolicy = {
          ...resolvedPolicy,
          protected: true
        };
        delete resolvedPolicy.accessCodeHash;
        protectedBoard = true;
      } catch (error) {
        handleDatabaseError(error);
        await showBoardNotice(
          "This board could not be migrated to the safer join-code format. Check the Firebase rules included with this project, then reopen the board.",
          "Board Security Error"
        );
        redirectToNewBoard();
        return;
      }
    }

    updateState({
      boardOwnerUid,
      isBoardOwner: boardOwnerUid === authUid
    });

    if (boardWasCreatedNow) {
      await adjustOpenBoardsCount(1);
    }

    if (!Number.isFinite(boardDeleteAt) || boardDeleteAt <= Date.now()) {
      await expireBoardNow(false);
      await showBoardNotice(
        "This board has expired and is no longer accessible. You will be redirected to a new board.",
        "Board Expired"
      );
      redirectToNewBoard();
      return;
    }

    const authorization = await authorizeBoardSession({
      sessionRef: boardAccessSessionRef,
      deleteAt: boardDeleteAt,
      protectedBoard,
      isOwner: boardOwnerUid === authUid,
      preferredCode: requestedAccessCode,
      loadCachedBoardAccessCode,
      saveCachedBoardAccessCode,
      promptForBoardJoinCode,
      showBoardNotice,
      onDatabaseError: handleDatabaseError,
      onExpired() {
        updateState({ boardExpired: true, connected: false, permissionDenied: false });
        eventHub.emitExpire();
      }
    });
    activeAccessCodeHash = authorization.accessCodeHash;
    if (!authorization.authorized) {
      const isOwner = boardOwnerUid === authUid;
      await showBoardNotice(
        isOwner
          ? "The board was created, but the owner session could not be authorized. Check that the included Firebase rules are published, then try again."
          : "Unable to join this board without the correct join code. You will be redirected to a new board.",
        isOwner ? "Board Access Error" : "Access Required"
      );
      redirectToNewBoard();
      return;
    }

    try {
      const countSnapshot = await get(openBoardsCountRef);
      const countValue = normalizeOpenBoardsCount(countSnapshot.val());
      updateState({
        openBoardsCount: Number.isFinite(countValue) ? countValue : null,
        openBoardsUnavailable: false
      });
    } catch (error) {
      handleOpenBoardsError(error);
    }

    onValue(boardPolicyRef, (snapshot) => {
      const policy = snapshot.val();
      markDatabaseHealthy();

      if (!policy || typeof policy.createdAt !== "number") {
        expireBoardNow(false);
        return;
      }

      const nextOwnerUid = String(policy.ownerUid || "").trim();
      updateState({
        boardOwnerUid: nextOwnerUid,
        isBoardOwner: nextOwnerUid === authUid
      });

      scheduleBoardExpiry(Number(policy.deleteAt));
    }, handleDatabaseError);

    onValue(connectedRef, (snapshot) => {
      if (getState().boardExpired) {
        updateState({ connected: false });
        return;
      }

      databaseSocketConnected = snapshot.val() === true;
      if (!databaseSocketConnected) {
        updateState({ connected: false });
        return;
      }

      void activateRealtimeConnection();
    }, handleDatabaseError);

    onValue(openBoardsCountRef, (snapshot) => {
      const countValue = normalizeOpenBoardsCount(snapshot.val());
      updateState({
        openBoardsCount: Number.isFinite(countValue) ? countValue : null,
        openBoardsUnavailable: false
      });
    }, handleOpenBoardsError);

    onValue(presenceRef, (snapshot) => {
      if (getState().boardExpired) {
        eventHub.emitPresenceChange({});
        return;
      }

      markDatabaseHealthy();
      const presence = snapshot.val() || {};
      eventHub.emitPresenceChange(presence);
      liveCollaboration.handlePresenceSnapshot(presence);
    }, handleDatabaseError);

    const eventsQuery = query(eventsRef, orderByChild("at"));
    onChildAdded(eventsQuery, (snapshot) => {
      if (getState().boardExpired) {
        return;
      }

      const event = snapshot.val();
      if (!isValidBoardEvent(event)) {
        return;
      }

      eventHub.emitRemoteEvent(event, snapshot.key || "");
    }, handleDatabaseError);
  }

  function retryConnection() {
    if (getState().boardExpired) {
      return;
    }

    updateState({ permissionDenied: false });

    if (database) {
      goOnline(database);
      if (databaseSocketConnected) {
        void activateRealtimeConnection();
      }
    }
  }

  function isBoardExpired() {
    return getState().boardExpired;
  }

  function isBoardOwner() {
    return getState().isBoardOwner;
  }

  return {
    getState,
    initialize,
    isBoardExpired,
    isBoardOwner,
    onExpire: eventHub.onExpire,
    onPresenceChange: eventHub.onPresenceChange,
    onRemoteEvent: eventHub.onRemoteEvent,
    onLiveStrokesChange: eventHub.onLiveStrokesChange,
    onStateChange: eventHub.onStateChange,
    publishOrApplyEvent,
    clearBoardHistory,
    queueLiveStrokeSync: liveCollaboration.queueLiveStrokeSync,
    clearLiveStroke: liveCollaboration.clearLiveStroke,
    queuePresenceSync: liveCollaboration.queuePresenceSync,
    retryConnection
  };
}
