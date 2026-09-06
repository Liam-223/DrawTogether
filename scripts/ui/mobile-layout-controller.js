function createMobileLayoutController({
  topbar,
  menuButton,
  menu,
  controls,
  resetViewButton,
  clearBoardButton,
  breakpoint = 720,
  onLayoutChange = () => {}
}) {
  const mobileQuery = window.matchMedia(`(max-width: ${breakpoint}px)`);
  const resetMarker = document.createComment("reset-view-button-home");
  const clearMarker = document.createComment("clear-board-button-home");
  let resizeObserver = null;
  let measuredHeaderHeight = null;
  let measuredToolbarHeight = null;

  resetViewButton.before(resetMarker);
  clearBoardButton.before(clearMarker);

  function isMobile() {
    return mobileQuery.matches;
  }

  function closeMenu() {
    topbar.classList.remove("is-mobile-menu-open");
    menuButton.setAttribute("aria-expanded", "false");
  }

  function openMenu() {
    if (!isMobile()) {
      return;
    }

    topbar.classList.add("is-mobile-menu-open");
    menuButton.setAttribute("aria-expanded", "true");
  }

  function toggleMenu() {
    if (topbar.classList.contains("is-mobile-menu-open")) {
      closeMenu();
    } else {
      openMenu();
    }
  }

  function moveBoardActions() {
    if (isMobile()) {
      menu.append(resetViewButton, clearBoardButton);
      return;
    }

    resetMarker.after(resetViewButton);
    clearMarker.after(clearBoardButton);
  }

  function updateLayoutMeasurements() {
    if (!isMobile()) {
      const hadMobileMeasurements = measuredHeaderHeight !== null || measuredToolbarHeight !== null;
      measuredHeaderHeight = null;
      measuredToolbarHeight = null;
      document.documentElement.style.removeProperty("--mobile-header-height");
      document.documentElement.style.removeProperty("--mobile-toolbar-height");
      if (hadMobileMeasurements) {
        onLayoutChange();
      }
      return;
    }

    const headerHeight = Math.ceil(topbar.getBoundingClientRect().height);
    const toolbarHeight = Math.ceil(controls.getBoundingClientRect().height);
    const changed = headerHeight !== measuredHeaderHeight || toolbarHeight !== measuredToolbarHeight;

    measuredHeaderHeight = headerHeight;
    measuredToolbarHeight = toolbarHeight;
    document.documentElement.style.setProperty("--mobile-header-height", `${headerHeight}px`);
    document.documentElement.style.setProperty("--mobile-toolbar-height", `${toolbarHeight}px`);

    if (changed) {
      onLayoutChange();
    }
  }

  function syncLayout() {
    closeMenu();
    moveBoardActions();
    requestAnimationFrame(updateLayoutMeasurements);
  }

  function handleDocumentPointerDown(event) {
    if (!isMobile() || !topbar.classList.contains("is-mobile-menu-open")) {
      return;
    }

    if (!topbar.contains(event.target)) {
      closeMenu();
    }
  }

  function handleMenuClick(event) {
    const button = event.target.closest("button");
    if (!button || button === clearBoardButton || button.id === "boardCodePill") {
      return;
    }

    closeMenu();
  }

  function handleKeyDown(event) {
    if (event.key === "Escape" && topbar.classList.contains("is-mobile-menu-open")) {
      closeMenu();
    }
  }

  function bind() {
    menuButton.addEventListener("click", toggleMenu);
    menu.addEventListener("click", handleMenuClick);
    document.addEventListener("pointerdown", handleDocumentPointerDown);
    document.addEventListener("keydown", handleKeyDown);
    mobileQuery.addEventListener("change", syncLayout);

    if (typeof ResizeObserver === "function") {
      resizeObserver = new ResizeObserver(updateLayoutMeasurements);
      resizeObserver.observe(topbar);
      resizeObserver.observe(controls);
    } else {
      window.addEventListener("resize", updateLayoutMeasurements);
    }

    syncLayout();
  }

  return { bind, closeMenu };
}

export { createMobileLayoutController };
