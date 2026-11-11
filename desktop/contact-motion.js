const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
const smooth = (start, end, value) => {
  const x = clamp((value - start) / (end - start));
  return x * x * (3 - 2 * x);
};

// One progress drives both the physical retreat and the incoming contact view.
// Solve perspective distance from the desired apparent size; never scale a TV.
export function contactSceneState(progress, viewDistance = 24) {
  const p = clamp(progress);
  const projectedScale = .10 + .90 * (1 - p) ** 2;
  return {
    progress: p,
    projectedScale,
    depth: viewDistance * (1 / projectedScale - 1),
    opacity: 1 - smooth(.10, .68, p),
    contactOpacity: smooth(.24, .82, p),
  };
}

export const contactEase = t => {
  const x = clamp(t);
  return x < .5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
};
