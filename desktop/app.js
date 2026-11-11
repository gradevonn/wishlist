import { projects } from './projects.js';

const $ = (selector) => document.querySelector(selector);
const all = (selector) => [...document.querySelectorAll(selector)];
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const ui = {
  header: $('.header'), main: $('#main'), home: $('#home'), canvas: $('#scene'),
  archive: $('#archive'), about: $('#about'), project: $('#project'), contact: $('#contact'),
  grid: $('#archive-grid'), projectBody: $('#project-body'), announcement: $('#announcement'),
  intro: $('#intro'), hover: $('#home-hover'), fallback: $('#scene-fallback'),
};
const copy = {
  ru: {
    'nav.about': 'о нас', 'nav.archive': 'архив', 'nav.contact': 'связаться', 'archive.title': 'все кейсы',
    'home.caption': 'команда внешнего<br>пост-продакшена',
    'home.captionInline': 'команда внешнего пост-продакшена',
    'about.lead': 'Ваша внешняя<br>пост-продакшн команда.',
    'about.description': 'Внешняя команда постпродакшена для студий и агентств. Постпрод и ИИ целиком на нас.',
    'about.signature': 'Работаем под вашим именем.',
    'contact.caption': 'напишите, что у вас горит',
    close: 'закрыть', previous: 'предыдущая работа', next: 'следующая работа', skip: 'пропустить',
    customer: 'заказчик', task: 'задача', done: 'что сделали', term: 'срок',
    watch: 'смотреть целиком', raw: 'смотреть проект',
    title: 're//run — внешняя пост-продакшн команда',
    description: 'Внешняя команда постпродакшена для студий и агентств. Постпрод и ИИ целиком на нас.',
    work: 'Выбрать работу',
  },
  en: {
    'nav.about': 'about', 'nav.archive': 'archive', 'nav.contact': 'contact', 'archive.title': 'all projects',
    'home.caption': 'your outside<br>post-production team',
    'home.captionInline': 'your outside post-production team',
    'about.lead': 'Your outside<br>post-production team.',
    'about.description': 'An outside post-production team for studios and agencies. Post and AI, entirely off your plate.',
    'about.signature': 'Working under your name.',
    'contact.caption': 'Tell us what’s on fire.',
    close: 'close', previous: 'previous project', next: 'next project', skip: 'skip',
    customer: 'client', task: 'the brief', done: 'what we did', term: 'turnaround',
    watch: 'watch full film', raw: 'watch project',
    title: 're//run — your outside post-production team',
    description: 'An outside post-production team for studios and agencies. Post and AI, entirely off your plate.',
    work: 'Choose a project',
  },
};
let lang = 'ru';
try { if (['ru', 'en'].includes(localStorage.getItem('rerun-lang'))) lang = localStorage.getItem('rerun-lang'); } catch {}
let scene = null;
let sceneReady = false;
let introDone = false;
let route = '/';
let projectIndex = -1;
let returnFromProject = '/';
let returnFromContact = '/';
let focusOrigin = null;
let introTimer;
let contactProgress = 0;
let contactTarget = 0;
let contactFrame = null;
let contactLastTime = 0;
let contactSnapTimer;
let contactGestureCommit = false;
let contactFocusPending = false;
let stageReturnFocus = null;
let contactDirection = 0;
let contactSnapping = false;
let routeInitialized = false;
const text = (field) => field?.[lang] || '';
const t = (key) => copy[lang][key] || key;
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

const clamp = (value) => Math.max(0, Math.min(1, value));
const smooth = (a, b, value) => { const x = clamp((value - a) / (b - a)); return x * x * (3 - 2 * x); };
const sceneIsVisible = () => route === '/' || route === '/contact' || route.startsWith('/p/');

// One continuous stage: wheel/touch controls the same progress in both directions.
// The contact hash is only a shareable endpoint, never a replacement for the canvas.
function syncContactStage() {
  const p = contactProgress;
  const style = document.body.style;
  style.setProperty('--contact-shift', `${(1 - p) * 100}dvh`);
  style.setProperty('--contact-opacity', smooth(.10, .72, p).toFixed(4));
  style.setProperty('--stage-ui-opacity', (1 - smooth(0, .28, p)).toFixed(4));
  style.setProperty('--space-depth', p.toFixed(4));
  document.body.dataset.contactProgress = p.toFixed(3);
  document.body.dataset.stageMotion = String(p > .001 && p < .999);
  ui.contact.hidden = p <= .001 && route !== '/contact';
  ui.contact.inert = p < .985 || route !== '/contact';
  ui.header.inert = !introDone || p > .025 || route === '/contact';
  ui.home.inert = !['/', '/contact'].includes(route) && !route.startsWith('/p/') || p > .025;
  $('#work-keyboard').inert = route !== '/' || p > .025;
  scene?.setContactProgress(p);
  if (contactFocusPending && p === 1) {
    contactFocusPending = false;
    requestAnimationFrame(() => $('.contact__art').focus({ preventScroll: true }));
  }
  if (stageReturnFocus && p === 0 && route === '/') {
    const target = stageReturnFocus;
    stageReturnFocus = null;
    requestAnimationFrame(() => target.isConnected && target.focus({ preventScroll: true }));
  }
}
function contactTick(time) {
  contactFrame = null;
  const dt = Math.min((time - (contactLastTime || time - 16)) / 1000, .04);
  contactLastTime = time;
  contactProgress = reduced.matches ? contactTarget : contactProgress + (contactTarget - contactProgress) * (1 - Math.exp(-dt * 11));
  if (Math.abs(contactTarget - contactProgress) < .0008) contactProgress = contactTarget;
  syncContactStage();
  if (contactProgress !== contactTarget) contactFrame = requestAnimationFrame(contactTick);
  else {
    contactLastTime = 0;
    if (contactGestureCommit && (contactTarget === 0 || contactTarget === 1)) {
      contactGestureCommit = false;
      const next = contactTarget ? '/contact' : '/';
      if (route !== next) navigate(next, { replace: true });
    }
  }
}
function moveContact(target, { instant = false, gesture = false } = {}) {
  contactTarget = clamp(target);
  contactGestureCommit = gesture;
  if (!gesture) contactSnapping = false;
  if (instant || reduced.matches) contactProgress = contactTarget;
  syncContactStage();
  if (!contactFrame) contactFrame = requestAnimationFrame(contactTick);
}
function settleContactGesture() {
  clearTimeout(contactSnapTimer);
  const target = contactDirection > 0 && contactTarget > .12 ? 1
    : contactDirection < 0 && contactTarget < .88 ? 0 : contactTarget >= .5 ? 1 : 0;
  contactSnapping = true;
  moveContact(target, { gesture: true });
}
function scrubContact(delta, { touch = false } = {}) {
  const direction = Math.sign(delta);
  const base = contactSnapping || contactDirection && direction !== contactDirection ? contactProgress : contactTarget;
  contactSnapping = false;
  contactDirection = direction;
  clearTimeout(contactSnapTimer);
  const target = reduced.matches ? (delta > 0 ? 1 : 0) : base + delta / Math.max(480, innerHeight * .7);
  moveContact(target, { gesture: true });
  if (!touch) contactSnapTimer = setTimeout(settleContactGesture, 145);
}

function getRoute() {
  const raw = location.hash.slice(1) || '/';
  if (raw === '/archive' || raw === '/contact' || raw === '/about' || raw === '/') return raw;
  if (raw.startsWith('/p/')) {
    try { if (projects.some((p) => p.media === decodeURIComponent(raw.slice(3)))) return raw; } catch {}
  }
  return '/';
}
function navigate(next, { replace = false, restoreFocus = false } = {}) {
  if (next === route && !replace) return;
  if (!replace) focusOrigin = document.activeElement;
  const previous = route;
  const oldState = history.state;
  const depth = replace ? (oldState?.rerunDepth || 0) : (oldState?.rerunDepth || 0) + 1;
  const state = { rerunDepth: depth, rerunRoute: next, returnRoute: replace ? oldState?.returnRoute : previous };
  history[replace ? 'replaceState' : 'pushState'](state, '', `#${next}`);
  applyRoute(!restoreFocus);
  if (restoreFocus && focusOrigin?.isConnected) requestAnimationFrame(() => focusOrigin.focus({ preventScroll: true }));
}
function closeView() {
  if (history.state?.rerunDepth > 0) {
    history.back();
    return;
  }
  navigate(route.startsWith('/p/') ? returnFromProject : returnFromContact, { replace: true, restoreFocus: true });
}
function openProject(index) {
  if (!Number.isInteger(index) || !projects[index]) return;
  if (!route.startsWith('/p/')) returnFromProject = route;
  navigate(`/p/${projects[index].media}`);
}
function nextProject(step) {
  if (projectIndex < 0) return;
  const index = (projectIndex + step + projects.length) % projects.length;
  navigate(`/p/${projects[index].media}`, { replace: true });
}

function renderArchive() {
  ui.grid.innerHTML = projects.map((p, i) => `
    <button class="archive-card" type="button" data-project="${i}" aria-label="${escape(text(p.client))}">
      <span class="archive-card__image">
        <img src="./assets/work/${p.media}.jpg" alt="" width="960" height="540" loading="lazy" />
        ${p.motion ? `<video muted loop playsinline preload="none" aria-hidden="true" poster="./assets/work/${p.media}.jpg"><source src="./assets/work/${p.media}.webm" type="video/webm"><source src="./assets/work/${p.media}.mp4" type="video/mp4"></video>` : ''}
      </span>
      <span class="archive-card__name">${escape(text(p.client))}</span>
    </button>`).join('');
  ui.grid.querySelectorAll('.archive-card').forEach((card) => {
    const video = card.querySelector('video');
    card.addEventListener('click', () => openProject(Number(card.dataset.project)));
    if (!video) return;
    const start = () => {
      if (reduced.matches || ui.archive.hidden) return;
      all('.archive-card video').forEach((other) => { if (other !== video) other.pause(); });
      video.play().catch(() => {});
    };
    const stop = () => { video.pause(); card.classList.remove('is-playing'); };
    video.addEventListener('playing', () => card.classList.add('is-playing'));
    card.addEventListener('pointerenter', start);
    card.addEventListener('pointerleave', stop);
    card.addEventListener('focus', start);
    card.addEventListener('blur', stop);
  });
}
function renderProject() {
  if (projectIndex < 0) return;
  const p = projects[projectIndex];
  const rows = ['customer', 'task', 'done', 'term'].filter((key) => text(p[key])).map((key) => `
    <div class="project__row"><dt class="project__key">${t(key)}</dt><dd class="project__value">${escape(text(p[key]).replace(/\.$/, ''))}</dd></div>`).join('');
  ui.projectBody.innerHTML = `
    <div class="project__heading">
      <div class="project__meta"><span class="project__index">${String(projectIndex + 1).padStart(2, '0')}/${String(projects.length).padStart(2, '0')}</span><span class="project__format">${escape(text(p.format))}</span></div>
      <h1 class="project__title" id="project-title" tabindex="-1">${p.media === 'waterpolo' && lang === 'ru' ? 'Федерация водных<br>видов спорта' : escape(text(p.client))}</h1>
      <img class="project__divider" src="./desktop/assets/divider.svg" alt="" width="541" height="1">
    </div>
    <dl class="project__specs">${rows}</dl>
    <div class="project__links">
      ${p.link || p.motion ? `<a href="${escape(p.link || `./assets/work/${p.media}.mp4`)}" target="_blank" rel="noreferrer">${t('watch')}<img class="project__link-dot" src="./desktop/assets/link-dot.svg" alt="" width="8" height="8"><img class="project__link-underline" src="./desktop/assets/underline.svg" alt="" width="165" height="1"></a>` : ''}
    </div>`;
  $('#project-counter').textContent = `${String(projectIndex + 1).padStart(2, '0')} / ${String(projects.length).padStart(2, '0')}`;
  ui.project.scrollTop = 0;
}
function renderKeyboard() {
  $('#work-keyboard').innerHTML = projects.map((p, i) => `<button type="button" data-index="${i}">${String(i + 1).padStart(2, '0')} — ${escape(text(p.client))}</button>`).join('');
  $('#work-keyboard').setAttribute('aria-label', t('work'));
  $('#work-keyboard').querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => openProject(Number(button.dataset.index)));
    button.addEventListener('focus', () => { ui.hover.textContent = text(projects[Number(button.dataset.index)].client); });
    button.addEventListener('blur', () => { ui.hover.textContent = ''; });
  });
}
function renderFallback() {
  ui.fallback.innerHTML = projects.map((p, i) => `<button type="button" data-index="${i}" aria-label="${escape(text(p.client))}"><img src="./assets/work/${p.media}.jpg" alt="" /><span>${escape(text(p.client))}</span></button>`).join('');
  ui.fallback.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => openProject(Number(button.dataset.index))));
}
function applyLanguage(next) {
  lang = next;
  document.documentElement.lang = lang;
  document.title = t('title');
  $('meta[name=description]').content = t('description');
  all('[data-copy]').forEach((element) => { element.innerHTML = t(element.dataset.copy); });
  all('[data-label]').forEach((element) => element.setAttribute('aria-label', t(element.dataset.label)));
  all('[data-language]').forEach((element) => element.setAttribute('aria-pressed', String(element.dataset.language === lang)));
  try { localStorage.setItem('rerun-lang', lang); } catch {}
  renderArchive();
  renderKeyboard();
  if (projectIndex >= 0) renderProject();
  if (!ui.fallback.hidden) renderFallback();
  window.RERUN.lang = lang;
}

function applyRoute(moveFocus = false) {
  const previous = route;
  route = getRoute();
  const isProject = route.startsWith('/p/');
  const view = isProject ? 'project' : route.slice(1) || 'home';
  const returningToHome = view === 'home' && (previous === '/contact' || contactProgress > .001);
  if (returningToHome) stageReturnFocus = focusOrigin?.isConnected && focusOrigin !== document.body && !focusOrigin.closest('[hidden],#contact') ? focusOrigin : $('.header__brand');
  else if (view !== 'home') stageReturnFocus = null;
  if (view === 'contact' && previous !== '/contact') returnFromContact = history.state?.returnRoute || previous || '/';
  if (isProject && !previous.startsWith('/p/')) returnFromProject = history.state?.returnRoute || previous || '/';
  document.body.dataset.view = view;
  clearTimeout(contactSnapTimer);
  contactGestureCommit = false;
  contactFocusPending = moveFocus && view === 'contact';
  ui.archive.hidden = view !== 'archive';
  ui.about.hidden = view !== 'about';
  ui.project.hidden = !isProject;
  ui.home.inert = !['home', 'project'].includes(view);
  ui.header.inert = view === 'contact';
  $('#work-keyboard').inert = view !== 'home';
  ui.hover.textContent = '';
  all('.header__nav a').forEach((a) => {
    if (a.getAttribute('href') === `#${route}`) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  all('.archive-card video').forEach((video) => video.pause());
  all('.archive-card').forEach((card) => card.classList.remove('is-playing'));
  projectIndex = isProject ? projects.findIndex((p) => p.media === decodeURIComponent(route.slice(3))) : -1;
  if (projectIndex >= 0) {
    renderProject();
    if (sceneReady) scene.focus(projectIndex);
    ui.announcement.textContent = text(projects[projectIndex].client);
  } else if (sceneReady) scene.reset();
  moveContact(view === 'contact' ? 1 : 0, { instant: !routeInitialized || !['home', 'contact'].includes(view) });
  routeInitialized = true;
  if (scene) scene.setActive(!document.hidden && sceneIsVisible());
  const target = isProject ? $('#project-title') : view === 'contact' ? $('.contact__art') : view === 'archive' ? $('#archive-title') : view === 'about' ? $('#about-title') : null;
  if (moveFocus && introDone) {
    if (target && view !== 'contact') requestAnimationFrame(() => target.focus({ preventScroll: true }));
    else if (!returningToHome && focusOrigin?.isConnected && !focusOrigin.closest('[hidden]')) requestAnimationFrame(() => focusOrigin.focus({ preventScroll: true }));
  }
}

function endIntro() {
  if (introDone) return;
  introDone = true;
  clearTimeout(introTimer);
  document.body.classList.remove('is-intro');
  ui.intro.hidden = true;
  ui.intro.setAttribute('aria-hidden', 'true');
  ui.header.inert = route === '/contact';
  ui.main.inert = false;
  syncContactStage();
  if (sceneReady) scene.reveal();
  if (document.activeElement === $('#intro-skip')) $('.header__brand').focus({ preventScroll: true });
}
function startIntro() {
  const params = new URLSearchParams(location.search);
  const skip = params.get('boot') === 'off' || reduced.matches || route !== '/';
  if (skip) { endIntro(); return; }
  document.body.classList.add('is-intro');
  ui.intro.setAttribute('aria-hidden', 'false');
  ui.header.inert = true;
  ui.main.inert = true;
  introTimer = setTimeout(endIntro, 3150);
}
async function mountScene() {
  try {
    if (new URLSearchParams(location.search).get('scene') === 'off') {
      showFallback();
      return;
    }
    const { DesktopScene } = await import('./scene.js');
    scene = new DesktopScene({
      canvas: ui.canvas,
      projects,
      onSelect(value) {
        const index = typeof value === 'number' ? value : Number.isInteger(value?.index) ? value.index : projects.indexOf(value?.project || value);
        openProject(index);
      },
      onHover(value) {
        const index = typeof value === 'number' ? value : Number.isInteger(value?.index) ? value.index : projects.indexOf(value?.project || value);
        ui.hover.textContent = index >= 0 && projects[index] && route === '/' ? text(projects[index].client) : '';
      },
      onReady() {
        // The constructor may call this synchronously before its return value is assigned.
        queueMicrotask(() => {
          sceneReady = true;
          if (introDone) scene?.reveal();
          if (projectIndex >= 0) scene?.focus(projectIndex);
          scene?.setContactProgress(contactProgress);
        });
      },
    });
    scene.setReducedMotion(reduced.matches);
    scene.setActive(!document.hidden && sceneIsVisible());
    window.RERUN.scene = scene;
  } catch (error) {
    console.error('[re//run] 3D scene unavailable; showing portfolio fallback.', error);
    showFallback();
  }
}

function showFallback() {
  scene?.dispose();
  scene = null;
  sceneReady = false;
  ui.canvas.hidden = true;
  ui.fallback.hidden = false;
  renderFallback();
  endIntro();
}

ui.canvas.addEventListener('rerun:webgl-lost', showFallback);

window.RERUN = { projects, lang, navigate, openProject, get route() { return route; } };
applyLanguage(lang);
route = getRoute();
history.replaceState({ rerunDepth: 0, rerunRoute: route, returnRoute: '/' }, '', `#${route}`);
applyRoute();
startIntro();
mountScene();

let pointerDownRoute = null;
let pointerDownPosition = null;
document.addEventListener('pointerdown', (event) => {
  pointerDownRoute = route;
  pointerDownPosition = { x: event.clientX, y: event.clientY };
}, { capture: true });

document.addEventListener('click', (event) => {
  if (event.target.closest('a[href="#main"]')) {
    event.preventDefault(); ui.main.focus({ preventScroll: true }); return;
  }
  const a = event.target.closest('a[href^="#/"]');
  if (a && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    navigate(a.getAttribute('href').slice(1));
    return;
  }
  // The opening pointer event began on home, so it cannot also dismiss a project.
  if (!route.startsWith('/p/') || !pointerDownRoute?.startsWith('/p/')) return;
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  if (event.target.closest('.project,a,button,input,textarea,select,[contenteditable]')) return;
  if (pointerDownPosition && Math.hypot(event.clientX - pointerDownPosition.x, event.clientY - pointerDownPosition.y) > 7) return;
  if (scene?.hitTestSelected?.(event.clientX, event.clientY)) return;
  focusOrigin = $('.header__brand');
  navigate('/', { replace: true, restoreFocus: true });
});
all('[data-language]').forEach((button) => button.addEventListener('click', () => applyLanguage(button.dataset.language)));
$('#project-close').addEventListener('click', closeView);
$('#contact-close').addEventListener('click', closeView);
$('#project-prev').addEventListener('click', () => nextProject(-1));
$('#project-next').addEventListener('click', () => nextProject(1));
$('#intro-skip').addEventListener('click', endIntro);
window.addEventListener('hashchange', () => applyRoute(true));
window.addEventListener('popstate', () => applyRoute(true));
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (!introDone) { endIntro(); return; }
    if (route === '/' && contactProgress > 0) { event.preventDefault(); clearTimeout(contactSnapTimer); moveContact(0); return; }
    if (route !== '/') { event.preventDefault(); closeView(); }
  }
  if (introDone && (route === '/' && event.key === 'ArrowDown' || route === '/contact' && event.key === 'ArrowUp')) {
    event.preventDefault(); clearTimeout(contactSnapTimer); moveContact(route === '/' ? 1 : 0, { instant: true, gesture: true });
  }
  if (projectIndex >= 0 && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) {
    if (event.key === 'ArrowRight') { event.preventDefault(); nextProject(1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); nextProject(-1); }
  }
});
window.addEventListener('wheel', (event) => {
  if (!introDone || !['/', '/contact'].includes(route) || event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
  event.preventDefault();
  const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
  if (delta) scrubContact(delta);
}, { passive: false });
let touchStart = null;
let touchPrevious = null;
window.addEventListener('touchstart', (event) => {
  const touch = event.touches.length === 1 ? event.touches[0] : null;
  touchStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
  touchPrevious = touch?.clientY ?? null;
}, { passive: true });
window.addEventListener('touchmove', (event) => {
  if (!introDone || !['/', '/contact'].includes(route) || touchStart === null || event.touches.length !== 1) return;
  const touch = event.touches[0];
  if (Math.abs(touch.clientX - touchStart.x) > Math.abs(touch.clientY - touchStart.y)) return;
  event.preventDefault();
  scrubContact(touchPrevious - touch.clientY, { touch: true });
  touchPrevious = touch.clientY;
}, { passive: false });
const endTouch = () => {
  if (touchStart && contactGestureCommit) settleContactGesture();
  touchStart = null;
  touchPrevious = null;
};
window.addEventListener('touchend', endTouch, { passive: true });
window.addEventListener('touchcancel', endTouch, { passive: true });
document.addEventListener('visibilitychange', () => {
  scene?.setActive(!document.hidden && sceneIsVisible());
  if (document.hidden) all('video').forEach((video) => video.pause());
});
reduced.addEventListener('change', () => {
  scene?.setReducedMotion(reduced.matches);
  if (reduced.matches) { endIntro(); moveContact(contactTarget >= .5 ? 1 : 0, { instant: true, gesture: contactGestureCommit }); all('video').forEach((video) => video.pause()); }
});
window.addEventListener('resize', () => scene?.resize());
window.addEventListener('pagehide', () => scene?.setActive(false));
window.addEventListener('pageshow', () => scene?.setActive(!document.hidden && sceneIsVisible()));
