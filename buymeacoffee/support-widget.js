const SUPPORT_BUBBLE_DISMISSED_KEY = "drawtogether.supportBubbleDismissed";
const SUPPORT_URL = "https://www.buymeacoffee.com/liam223";
const SUPPORT_WIDGET_MARGIN_PX = 18;
const SUPPORT_WIDGET_OVERRIDE_TIMEOUT_MS = 3000;
const SUPPORT_WIDGET_RETRY_COUNT = 10;
const SUPPORT_WIDGET_RETRY_INTERVAL_MS = 150;

function isSupportBubbleDismissed() {
  return localStorage.getItem(SUPPORT_BUBBLE_DISMISSED_KEY) === "true";
}

function persistSupportBubbleDismissed() {
  localStorage.setItem(SUPPORT_BUBBLE_DISMISSED_KEY, "true");
}

function findWidgetTrigger() {
  return document.getElementById("bmc-wbtn");
}

function openSupportFallback() {
  window.open(SUPPORT_URL, "_blank", "noopener,noreferrer");
}

function applyWidgetOverrides() {
  const startedAt = Date.now();

  const timerId = window.setInterval(() => {
    const trigger = findWidgetTrigger();
    const iframe = document.getElementById("bmc-iframe");
    const closeButton = document.getElementById("bmc-close-btn");

    if (trigger) {
      trigger.style.left = `${SUPPORT_WIDGET_MARGIN_PX}px`;
      trigger.style.right = "auto";
    }

    if (iframe) {
      iframe.style.left = `${SUPPORT_WIDGET_MARGIN_PX}px`;
      iframe.style.right = "auto";
      iframe.style.transformOrigin = "left bottom";
      iframe.classList.add("support-widget-dark");
    }

    if (closeButton) {
      closeButton.style.right = "16px";
      closeButton.style.left = "auto";
    }

    if ((trigger && iframe) || Date.now() - startedAt >= SUPPORT_WIDGET_OVERRIDE_TIMEOUT_MS) {
      window.clearInterval(timerId);
    }
  }, 80);
}

function openSupportWidget() {
  applyWidgetOverrides();

  const trigger = findWidgetTrigger();
  if (trigger) {
    trigger.click();
    return;
  }

  let retriesRemaining = SUPPORT_WIDGET_RETRY_COUNT;
  const retryId = window.setInterval(() => {
    const delayedTrigger = findWidgetTrigger();
    if (delayedTrigger) {
      window.clearInterval(retryId);
      applyWidgetOverrides();
      delayedTrigger.click();
      return;
    }

    retriesRemaining -= 1;
    if (retriesRemaining <= 0) {
      window.clearInterval(retryId);
      openSupportFallback();
    }
  }, SUPPORT_WIDGET_RETRY_INTERVAL_MS);
}

function initSupportBubble() {
  applyWidgetOverrides();

  const wrapper = document.getElementById("supportBubbleWrapper");
  if (!wrapper) {
    return;
  }

  if (isSupportBubbleDismissed()) {
    wrapper.style.display = "none";
    return;
  }

  const bubbleButton = document.getElementById("supportBubbleButton");
  const closeButton = document.getElementById("supportBubbleClose");

  if (bubbleButton) {
    bubbleButton.addEventListener("click", (event) => {
      event.preventDefault();
      openSupportWidget();
    });
  }

  if (!closeButton) {
    return;
  }

  closeButton.addEventListener("click", (event) => {
    event.stopPropagation();
    wrapper.style.display = "none";
    persistSupportBubbleDismissed();
  });
}

document.addEventListener("DOMContentLoaded", initSupportBubble);
