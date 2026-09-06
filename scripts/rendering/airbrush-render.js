import { clampPressure } from "../core/shared-utils.js";

const TAU = Math.PI * 2;
const UINT32_RANGE = 4294967296;
const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;

function hashSeed(value) {
  const text = String(value || "airbrush");
  let hash = FNV_OFFSET_BASIS;

  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }

  return hash >>> 0;
}

// Deterministic hash noise keeps spray strokes stable without Math.random().
function random01(seed) {
  let value = seed | 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / UINT32_RANGE;
}

function drawAirbrushStroke(ctx, points, color, brushSize, seedKey, segmentIndexOffset = 0) {
  if (!points || points.length < 2) {
    return;
  }

  const sprayRadius = Math.max(0.75, brushSize * 0.55);
  const spacing = Math.max(0.95, brushSize * 0.38);
  const baseDensity = Math.max(5, Math.round(brushSize * 1.05));
  const baseDotRadius = Math.max(0.65, brushSize * 0.11);
  const seedBase = hashSeed(seedKey);
  const originalAlpha = ctx.globalAlpha;
  const usesPressure = points.some((point) => Number.isFinite(point?.p));

  ctx.fillStyle = color;

  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1];
    const to = points[i];
    const fromPressure = usesPressure ? clampPressure(from?.p) : 1;
    const toPressure = usesPressure ? clampPressure(to?.p) : 1;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(distance / spacing));
    const segmentIndex = i + segmentIndexOffset;

    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const x = from.x + dx * t;
      const y = from.y + dy * t;
      const pressure = fromPressure + (toPressure - fromPressure) * t;
      const radius = sprayRadius * pressure;
      const density = Math.max(3, Math.round(baseDensity * (0.35 + pressure * 0.65)));

      ctx.globalAlpha = originalAlpha * (0.025 + pressure * 0.035);
      ctx.beginPath();

      for (let dab = 0; dab < density; dab += 1) {
        const seed = seedBase + segmentIndex * 131 + step * 17 + dab * 7;
        const angle = random01(seed) * TAU;
        const spread = Math.sqrt(random01(seed + 19)) * radius;
        const dotRadius = baseDotRadius * pressure * (0.55 + random01(seed + 43));
        const dotX = x + Math.cos(angle) * spread;
        const dotY = y + Math.sin(angle) * spread;

        ctx.moveTo(dotX + dotRadius, dotY);
        ctx.arc(dotX, dotY, dotRadius, 0, TAU);
      }

      ctx.fill();
    }
  }

  ctx.globalAlpha = originalAlpha;
}

export { drawAirbrushStroke };
