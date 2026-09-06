import { generateBoardId, sanitizeBoardId } from "../core/shared-utils.js";

function parseBoardCodeOrLink(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  try {
    const candidateUrl = /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsedUrl = new URL(candidateUrl);
    const fromQuery = sanitizeBoardId(parsedUrl.searchParams.get("board"));
    if (fromQuery) {
      return fromQuery;
    }

    const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
    if (pathSegments.length > 0) {
      return sanitizeBoardId(pathSegments[pathSegments.length - 1]);
    }
  } catch {
    // Plain board codes fall through to the checks below.
  }

  const directCode = sanitizeBoardId(raw);
  if (directCode) {
    return directCode;
  }

  const boardParamMatch = raw.match(/[?&#]board=([a-z0-9_-]{4,64})/i);
  if (boardParamMatch) {
    return sanitizeBoardId(boardParamMatch[1]);
  }

  return "";
}

function sanitizeBoardAccessCode(value, boardAccessCodePattern) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (!normalized || !boardAccessCodePattern.test(normalized)) {
    return "";
  }

  return normalized;
}

function createBoardDialogController({
  boardActionDialog,
  boardActionForm,
  boardActionInput,
  boardActionInputLabel,
  boardActionInputWrap,
  boardActionMessage,
  boardActionTitle,
  boardActionCancelBtn,
  boardActionConfirmBtn
}) {
  let activeResolver = null;

  function close(result) {
    if (!activeResolver) {
      return;
    }

    const resolve = activeResolver;
    activeResolver = null;

    if (boardActionDialog.open) {
      boardActionDialog.close();
    }

    resolve(result);
  }

  function open({
    title,
    message,
    confirmText,
    cancelText,
    showCancel,
    showInput,
    inputLabel,
    inputValue,
    inputPlaceholder,
    inputMaxLength,
    inputReadOnly
  }) {
    if (activeResolver) {
      close({ confirmed: false, value: "" });
    }

    boardActionTitle.textContent = title;
    boardActionMessage.textContent = message || "";
    boardActionConfirmBtn.textContent = confirmText || "Continue";
    boardActionCancelBtn.textContent = cancelText || "Cancel";
    boardActionCancelBtn.hidden = showCancel === false;

    if (showInput) {
      boardActionInputWrap.hidden = false;
      boardActionInputLabel.textContent = inputLabel || "Value";
      boardActionInput.value = inputValue || "";
      boardActionInput.placeholder = inputPlaceholder || "";
      boardActionInput.maxLength = Number.isFinite(inputMaxLength) ? inputMaxLength : 128;
      boardActionInput.readOnly = inputReadOnly === true;
    } else {
      boardActionInputWrap.hidden = true;
      boardActionInput.value = "";
      boardActionInput.placeholder = "";
      boardActionInput.readOnly = false;
    }

    return new Promise((resolve) => {
      activeResolver = resolve;
      boardActionDialog.showModal();

      if (showInput) {
        queueMicrotask(() => {
          boardActionInput.focus();
          if (inputReadOnly) {
            boardActionInput.select();
          }
        });
      } else {
        queueMicrotask(() => {
          boardActionConfirmBtn.focus();
        });
      }
    });
  }

  async function notice(message, title = "Notice") {
    await open({
      title,
      message,
      confirmText: "OK",
      showCancel: false,
      showInput: false
    });
  }

  async function confirm(message, title = "Confirm") {
    const result = await open({
      title,
      message,
      confirmText: "Continue",
      cancelText: "Cancel",
      showCancel: true,
      showInput: false
    });

    return result.confirmed === true;
  }

  function input({ title, message, label, placeholder, value, maxLength, confirmText, cancelText, readOnly }) {
    return open({
      title,
      message,
      confirmText: confirmText || "Continue",
      cancelText: cancelText || "Cancel",
      showCancel: cancelText !== null,
      showInput: true,
      inputLabel: label,
      inputPlaceholder: placeholder,
      inputValue: value,
      inputMaxLength: maxLength,
      inputReadOnly: readOnly
    });
  }

  boardActionForm.addEventListener("submit", (event) => {
    event.preventDefault();
    close({
      confirmed: true,
      value: boardActionInput.value
    });
  });

  boardActionCancelBtn.addEventListener("click", () => {
    close({ confirmed: false, value: "" });
  });

  boardActionDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close({ confirmed: false, value: "" });
  });

  return { confirm, input, notice };
}

async function promptForOptionalNewBoardAccessCode(dialog, sanitizeCode) {
  const shouldSetCode = await dialog.confirm("Protect this new board with a join code?", "Protect Board");
  if (!shouldSetCode) {
    return "";
  }

  while (true) {
    const result = await dialog.input({
      title: "Set Join Code",
      message: "Only people with this code can open the board.",
      label: "Join code",
      placeholder: "e.g. team-2026",
      value: "",
      maxLength: 32,
      confirmText: "Set Code",
      cancelText: "Skip"
    });

    if (!result.confirmed) {
      return "";
    }

    const trimmed = String(result.value || "").trim();
    if (!trimmed) {
      return "";
    }

    const code = sanitizeCode(trimmed);
    if (code) {
      return code;
    }

    await dialog.notice("Invalid join code. Use 4-32 letters, numbers, _ or -.", "Invalid Code");
  }
}

let inMemoryBoardAccessCode = "";

function readSessionValue(key) {
  try {
    return sessionStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeSessionValue(key, value) {
  try {
    if (value) {
      sessionStorage.setItem(key, value);
    } else {
      sessionStorage.removeItem(key);
    }
  } catch {
    // The in-memory copy still covers browsers that block sessionStorage.
  }
}

function loadCachedBoardAccessCode(accessSessionKey, sanitizeCode) {
  const code = sanitizeCode(readSessionValue(accessSessionKey) || inMemoryBoardAccessCode);
  inMemoryBoardAccessCode = code;
  return code;
}

function saveCachedBoardAccessCode(accessSessionKey, code) {
  const normalizedCode = String(code || "");
  inMemoryBoardAccessCode = normalizedCode;
  writeSessionValue(accessSessionKey, normalizedCode);
}

async function promptForBoardJoinCode(dialog, sanitizeCode, prefilledCode = "") {
  const result = await dialog.input({
    title: "Board Locked",
    message: "This board is protected. Enter the join code.",
    label: "Join code",
    placeholder: "Enter code",
    value: prefilledCode,
    maxLength: 32,
    confirmText: "Join Board",
    cancelText: "Cancel"
  });

  if (!result.confirmed) {
    return null;
  }

  return sanitizeCode(result.value);
}

function createBoardAccessController({
  board,
  access,
  navigateToBoard,
  actions,
  dialog
}) {
  const { boardId, inviteUrl } = board;
  const { boardAccessSessionKeyPrefix, boardAccessCodePattern } = access;
  const { newBoardBtn, joinBoardBtn, copyInviteBtn } = actions;
  const dialogController = createBoardDialogController(dialog);
  const {
    notice: showBoardNotice,
    confirm: showBoardConfirm,
    input: showBoardInput
  } = dialogController;
  const sanitizeCode = (value) => sanitizeBoardAccessCode(value, boardAccessCodePattern);
  const accessSessionKey = `${boardAccessSessionKeyPrefix}.${boardId}`;

  newBoardBtn.addEventListener("click", async () => {
    const confirmed = await showBoardConfirm("Start a new board? Your current board link will change.", "New Board");
    if (confirmed) {
      navigateToBoard(generateBoardId());
    }
  });

  joinBoardBtn.addEventListener("click", async () => {
    const result = await showBoardInput({
      title: "Join Board",
      message: "Enter a board code or invite link.",
      label: "Board code or link",
      placeholder: "e.g. a1b2c3d4 or https://...",
      value: "",
      maxLength: 300,
      confirmText: "Join",
      cancelText: "Cancel"
    });

    if (!result.confirmed) {
      return;
    }

    const nextBoardId = parseBoardCodeOrLink(result.value);
    if (!nextBoardId) {
      await showBoardNotice(
        "Invalid board code or link. Use a valid invite URL or a code with 4-64 letters, numbers, _ or -.",
        "Invalid Board"
      );
      return;
    }

    if (nextBoardId !== boardId) {
      navigateToBoard(nextBoardId);
    }
  });

  copyInviteBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      copyInviteBtn.textContent = "Copied!";
      setTimeout(() => {
        copyInviteBtn.textContent = "Copy Link";
      }, 1200);
    } catch {
      await showBoardInput({
        title: "Copy Invite Link",
        message: "Clipboard is blocked. Copy this link manually.",
        label: "Invite link",
        value: inviteUrl,
        maxLength: 500,
        confirmText: "Close",
        cancelText: null,
        readOnly: true
      });
    }
  });

  return {
    loadCachedBoardAccessCode() {
      return loadCachedBoardAccessCode(accessSessionKey, sanitizeCode);
    },
    saveCachedBoardAccessCode(code) {
      saveCachedBoardAccessCode(accessSessionKey, sanitizeCode(code));
    },
    promptForBoardJoinCode(prefilledCode = "") {
      return promptForBoardJoinCode(dialogController, sanitizeCode, prefilledCode);
    },
    promptForOptionalNewBoardAccessCode() {
      return promptForOptionalNewBoardAccessCode(dialogController, sanitizeCode);
    },
    showBoardNotice
  };
}

export { createBoardAccessController };
