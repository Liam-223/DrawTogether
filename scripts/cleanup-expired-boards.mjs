import {
  cert,
  deleteApp,
  initializeApp
} from "firebase-admin/app";

import { getDatabase } from "firebase-admin/database";

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
const databaseURL = process.env.FIREBASE_DATABASE_URL;

if (!serviceAccountJson) {
  throw new Error("Missing FIREBASE_SERVICE_ACCOUNT");
}

if (!databaseURL) {
  throw new Error("Missing FIREBASE_DATABASE_URL");
}

let serviceAccount;

try {
  serviceAccount = JSON.parse(serviceAccountJson);
} catch {
  throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON");
}

const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL
});

const db = getDatabase(app);

try {
  const now = Date.now();

  console.log(
    `Checking for expired boards at ${new Date(now).toISOString()}`
  );

  const policiesSnapshot = await db
    .ref("boardAccessPolicies")
    .once("value");

  const policies = policiesSnapshot.val() ?? {};

  const expiredBoardIds = [];
  let activeBoardCount = 0;

  for (const [boardId, policy] of Object.entries(policies)) {
    const deleteAt = Number(policy?.deleteAt);

    if (!Number.isFinite(deleteAt)) {
      console.warn(`Skipping ${boardId}: invalid deleteAt`);
      continue;
    }

    if (deleteAt <= now) {
      expiredBoardIds.push(boardId);
    } else {
      activeBoardCount += 1;
    }
  }

  if (expiredBoardIds.length === 0) {
    console.log("No expired boards found.");

    await db
      .ref("publicStats/openBoards")
      .set(activeBoardCount);
  } else {
    console.log(
      `Deleting ${expiredBoardIds.length} expired board(s):`,
      expiredBoardIds
    );

    const updates = {};

    for (const boardId of expiredBoardIds) {
      updates[`boards/${boardId}`] = null;
      updates[`boardAccessPolicies/${boardId}`] = null;
      updates[`boardAccessSecrets/${boardId}`] = null;
      updates[`boardAccessSessions/${boardId}`] = null;
    }

    updates["publicStats/openBoards"] = activeBoardCount;

    await db.ref().update(updates);

    console.log(
      `Cleanup complete. Deleted ${expiredBoardIds.length} board(s).`
    );

    console.log(
      `${activeBoardCount} active board(s) remain.`
    );
  }
} finally {
  await deleteApp(app);
}