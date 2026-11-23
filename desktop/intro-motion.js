// A compositor-driven vertical logo exit. Original image slots stay untouched.
export const INTRO_TIMING = Object.freeze({
  duration: 3150,
  firstUntil: 1100,
  secondUntil: 1500,
  flightAt: 2050,
  logoExitAt: 2850,
  backdropClearAt: 2400,
  captionClearAt: 2230,
  exitFadeAt: 2850,
});

export function introPhaseAt(time) {
  if (time < INTRO_TIMING.firstUntil) return 'original';
  if (time < INTRO_TIMING.secondUntil) return 'collage-two';
  if (time < INTRO_TIMING.flightAt) return 'collage-three';
  return time < INTRO_TIMING.duration ? 'flight' : 'complete';
}

const REST = 'translate3d(0,-50%,0)';
// Move the complete artwork above the viewport without changing its scale
// or depth. The final 300 ms are reserved for the TV installation settling.
const EXIT = 'translate3d(0,calc(-100dvh - 100%),0)';
const at = time => time / INTRO_TIMING.duration;
const windowFrames = (from, to) => {
  const frames = [{ opacity: from === 0 ? 1 : 0, offset: 0 }];
  if (from > 0) frames.push({ opacity: 0, offset: at(from) }, { opacity: 1, offset: at(from) });
  if (to < INTRO_TIMING.duration) frames.push({ opacity: 1, offset: at(to) }, { opacity: 0, offset: at(to) });
  frames.push({ opacity: to === INTRO_TIMING.duration ? 1 : 0, offset: 1 });
  return frames;
};

export function playIntro({ element, onReveal = () => {}, onComplete = () => {}, autoplay = true, waitForReveal = null }) {
  const art = element.querySelector('.intro__art');
  const veil = document.createElement('div');
  veil.className = 'intro__veil'; veil.setAttribute('aria-hidden', 'true');
  element.prepend(veil); element.dataset.introRunning = 'true';
  const animations = [];
  let revealTimer, cancelled = false, revealed = false, completed = false;
  const gated = autoplay && waitForReveal !== null;
  let waitingForReveal = false;
  // Finish the three-logo sequence on the compositor, then retain its final
  // frame until WebGL is ready. A JS timer cannot reliably stop an animation
  // at the reveal boundary while the main thread is building the scene.
  const beforeReveal = frames => {
    const boundary = at(INTRO_TIMING.flightAt);
    const prefix = frames.filter(frame => frame.offset <= boundary)
      .map(frame => ({ ...frame, offset: frame.offset / boundary }));
    if (prefix.at(-1).offset < 1) prefix.push({ ...prefix.at(-1), offset: 1 });
    return prefix;
  };
  const tracks = [];
  const animate = (target, frames) => {
    const animation = target.animate(gated ? beforeReveal(frames) : frames, {
      duration: gated ? INTRO_TIMING.flightAt : INTRO_TIMING.duration, fill: 'both', easing: 'linear',
    });
    tracks.push({ animation, frames });
    if (!autoplay) { animation.pause(); animation.currentTime = 0; }
    animations.push(animation); return animation;
  };
  animate(element.querySelector('.intro__one'), windowFrames(0, INTRO_TIMING.firstUntil));
  animate(element.querySelector('.intro__two'), windowFrames(INTRO_TIMING.firstUntil, INTRO_TIMING.secondUntil));
  animate(element.querySelector('.intro__three'), windowFrames(INTRO_TIMING.secondUntil, INTRO_TIMING.duration));
  const master = animate(art, [
    { transform: REST, offset: 0 },
    { transform: REST, offset: at(INTRO_TIMING.flightAt), easing: 'cubic-bezier(.4,0,.6,1)' },
    { transform: EXIT, offset: at(INTRO_TIMING.logoExitAt) },
    { transform: EXIT, offset: 1 },
  ]);
  animate(art, [{ opacity: 1, offset: 0 }, { opacity: 1, offset: at(INTRO_TIMING.exitFadeAt) }, { opacity: 0, offset: 1 }]);
  animate(veil, [
    { opacity: 1, offset: 0 },
    { opacity: 1, offset: at(INTRO_TIMING.flightAt), easing: 'cubic-bezier(.22,.61,.36,1)' },
    { opacity: 0, offset: at(INTRO_TIMING.backdropClearAt) },
    { opacity: 0, offset: 1 },
  ]);
  animate(element.querySelector('.intro__caption'), [
    { opacity: 1, offset: 0 }, { opacity: 1, offset: at(INTRO_TIMING.flightAt) },
    { opacity: 0, offset: at(INTRO_TIMING.captionClearAt) }, { opacity: 0, offset: 1 },
  ]);
  const reveal = () => {
    element.dataset.introPhase = 'flight';
    if (!cancelled && !revealed) { revealed = true; onReveal(); }
  };
  const scheduleReveal = () => {
    clearTimeout(revealTimer);
    const time = Number(master.currentTime) || 0;
    if (time >= INTRO_TIMING.flightAt) reveal();
    else revealTimer = setTimeout(reveal, INTRO_TIMING.flightAt - time);
  };
  const complete = () => {
    if (!cancelled && !completed) { completed = true; element.dataset.introPhase = 'complete'; onComplete(); }
  };
  if (gated) {
    master.finished.then(async () => {
      if (cancelled) return;
      waitingForReveal = true;
      element.dataset.introPhase = 'collage-three';
      element.dataset.introWaiting = 'true';
      await waitForReveal;
      if (cancelled) return;
      waitingForReveal = false;
      delete element.dataset.introWaiting;
      for (const { animation, frames } of tracks) {
        animation.effect.setKeyframes(frames);
        animation.effect.updateTiming({ duration: INTRO_TIMING.duration });
        animation.currentTime = INTRO_TIMING.flightAt;
        animation.play();
      }
      reveal();
      await master.finished;
      complete();
    }).catch(() => {});
  } else master.finished.then(complete).catch(() => {});
  element.dataset.introPhase = 'original';
  if (autoplay && !gated) scheduleReveal();
  return {
    get currentTime() { return Math.max(0, Math.min(INTRO_TIMING.duration, Number(master.currentTime) || 0)); },
    get phase() { return waitingForReveal ? 'collage-three' : introPhaseAt(this.currentTime); },
    play() { if (!cancelled) { animations.forEach(animation => animation.play()); if (!gated) scheduleReveal(); } },
    pause() { clearTimeout(revealTimer); animations.forEach(animation => animation.pause()); },
    seek(time) {
      this.pause();
      const value = Math.max(0, Math.min(INTRO_TIMING.duration, time));
      animations.forEach(animation => { animation.currentTime = value; });
      element.dataset.introPhase = introPhaseAt(value);
      if (value >= INTRO_TIMING.flightAt) reveal();
    },
    cancel() {
      cancelled = true; clearTimeout(revealTimer); animations.forEach(animation => animation.cancel());
      veil.remove(); delete element.dataset.introRunning; delete element.dataset.introPhase; delete element.dataset.introWaiting;
    },
  };
}

// Visible diagnostic controls only for the explicit ?intro-preview=1 URL.
export function mountIntroPreview(sequence, finish) {
  const panel = document.createElement('div'); panel.className = 'intro-preview';
  panel.innerHTML = '<label for="intro-preview-time">Вступление</label><input id="intro-preview-time" type="range" min="0" max="3150" value="0" step="10" aria-label="Время вступления"><output for="intro-preview-time"></output><button type="button" data-preview-play>пуск</button><button type="button" data-preview-pause>пауза</button><button type="button" data-preview-finish>открыть сайт</button>';
  const slider = panel.querySelector('input'), output = panel.querySelector('output');
  let frame;
  const update = () => { slider.value = Math.round(sequence.currentTime); output.textContent = `${(sequence.currentTime / 1000).toFixed(2)} s · ${sequence.phase}`; frame = requestAnimationFrame(update); };
  slider.addEventListener('input', () => sequence.seek(Number(slider.value)));
  panel.querySelector('[data-preview-play]').addEventListener('click', () => sequence.play());
  panel.querySelector('[data-preview-pause]').addEventListener('click', () => sequence.pause());
  panel.querySelector('[data-preview-finish]').addEventListener('click', finish);
  document.body.append(panel); update();
  return () => { cancelAnimationFrame(frame); panel.remove(); };
}
