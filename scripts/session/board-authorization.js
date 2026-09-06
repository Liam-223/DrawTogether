import {
  serverTimestamp,
  set
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";
import { hashAccessCode, isPermissionDeniedError } from "./board-session-utils.js";

export async function authorizeBoardSession({
  sessionRef,
  deleteAt,
  protectedBoard,
  isOwner,
  preferredCode = "",
  loadCachedBoardAccessCode,
  saveCachedBoardAccessCode,
  promptForBoardJoinCode,
  showBoardNotice,
  onDatabaseError,
  onExpired
}) {
  if (!sessionRef) {
    return { authorized: false, accessCodeHash: "" };
  }

  const effectiveDeleteAt = Number(deleteAt);
  if (!Number.isFinite(effectiveDeleteAt) || effectiveDeleteAt <= Date.now()) {
    onExpired();
    return { authorized: false, accessCodeHash: "" };
  }

  async function tryCode(rawCode) {
    const code = String(rawCode || "").trim().toLowerCase();

    if ((protectedBoard && !code && !isOwner) || (!protectedBoard && code)) {
      return null;
    }

    const accessCodeHash = protectedBoard && code ? await hashAccessCode(code) : "";
    const session = {
      authorizedAt: serverTimestamp(),
      expireAt: effectiveDeleteAt
    };

    if (protectedBoard && !isOwner && accessCodeHash) {
      session.accessCodeHash = accessCodeHash;
    }

    try {
      await set(sessionRef, session);

      if (code) {
        saveCachedBoardAccessCode(code);
      } else if (protectedBoard && isOwner && preferredCode) {
        saveCachedBoardAccessCode(preferredCode);
      } else if (!protectedBoard) {
        saveCachedBoardAccessCode("");
      }

      return { authorized: true, accessCodeHash };
    } catch (error) {
      if (isPermissionDeniedError(error) && protectedBoard) {
        return null;
      }

      onDatabaseError(error);
      return null;
    }
  }

  if (!protectedBoard || isOwner) {
    return (await tryCode("")) || { authorized: false, accessCodeHash: "" };
  }

  const cachedCode = loadCachedBoardAccessCode();
  const candidates = preferredCode ? [preferredCode] : [];
  if (cachedCode && cachedCode !== preferredCode) {
    candidates.push(cachedCode);
  }

  for (const code of candidates) {
    const result = await tryCode(code);
    if (result) {
      return result;
    }
  }

  while (true) {
    const enteredCode = await promptForBoardJoinCode(cachedCode || "");
    if (enteredCode === null) {
      return { authorized: false, accessCodeHash: "" };
    }

    if (!enteredCode) {
      await showBoardNotice("Join code is required for this board.", "Access Required");
      continue;
    }

    const result = await tryCode(enteredCode);
    if (result) {
      return result;
    }

    await showBoardNotice("Incorrect join code.", "Wrong Code");
  }
}
