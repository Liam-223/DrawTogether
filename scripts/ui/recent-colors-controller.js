import {
  MAX_RECENT_COLORS,
  sanitizeRecentColors,
  saveProfile
} from "../state/profile-storage.js";

function createRecentColorsController({
  container,
  getProfile,
  getCurrentColor,
  selectColor
}) {
  function render() {
    const colors = sanitizeRecentColors(getProfile().recentColors);
    const currentColor = String(getCurrentColor() || "").toLowerCase();

    container.parentElement?.classList.toggle("recent-colors-empty", colors.length === 0);

    container.replaceChildren(
      ...colors.map((color) => {
        const button = document.createElement("button");
        button.className = "swatch";
        button.type = "button";
        button.dataset.color = color;
        button.style.setProperty("--swatch", color);
        button.setAttribute("aria-label", `Recent color ${color}`);
        button.classList.toggle("is-active", color === currentColor);
        return button;
      })
    );
  }

  function record(color) {
    const normalized = String(color || "").trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(normalized)) {
      return;
    }

    const profile = getProfile();
    const nextColors = sanitizeRecentColors([
      normalized,
      ...(profile.recentColors || [])
    ]).slice(0, MAX_RECENT_COLORS);

    profile.recentColors = nextColors;
    saveProfile(profile);
    render();
  }

  function handleClick(event) {
    const swatch = event.target.closest(".swatch");
    if (!swatch || !container.contains(swatch)) {
      return;
    }

    const color = swatch.dataset.color;
    if (color) {
      selectColor(color);
    }
  }

  function bind() {
    container.addEventListener("click", handleClick);
    render();
  }

  return { bind, record, render };
}

export { createRecentColorsController };
