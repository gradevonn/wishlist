/* ─────────────────────────────────────────────────────────────
   Включает витрину вместо плоской сетки — но только там,
   где ей есть чем рисовать. Телефон, слабый GPU, отключённая
   анимация и отсутствие WebGL остаются на сетке: она рабочая.
   ───────────────────────────────────────────────────────────── */

import { Showroom } from "./showroom.js";

const MIN_WIDTH = 1024;

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext("webgl2") || c.getContext("webgl"))
    );
  } catch (e) {
    return false;
  }
}

function shouldMount() {
  if (window.innerWidth < MIN_WIDTH) return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return false;
  return webglAvailable();
}

const state = { showroom: null, lang: "ru" };

const el = {
  grid: document.querySelector("#work-grid"),
  stage: document.querySelector("#showroom"),
  canvas: document.querySelector("#showroom-canvas"),
  panel: document.querySelector("#showroom-panel"),
  hint: document.querySelector("#showroom-hint"),
};

const T = {
  ru: {
    hint: "кликните на телевизор",
    loading: "загружаем витрину…",
    caption: "витрина · 3D",
    close: "закрыть",
    raw: "посмотреть без шейдера",
    open: "открыть проект",
    customer: "заказчик",
    task: "задача",
    done: "что сделали",
    term: "срок",
    blank: "—",
  },
  en: {
    hint: "click a set",
    loading: "loading the showroom…",
    caption: "showroom · 3D",
    close: "close",
    raw: "watch without the shader",
    open: "open project",
    customer: "client",
    task: "the brief",
    done: "what we did",
    term: "turnaround",
    blank: "—",
  },
};

function renderPanel(project, index, total) {
  const t = T[state.lang];
  // пустое поле не показываем — как и на странице проекта
  const row = (key, value) =>
    value
      ? `
    <div class="panel__row">
      <dt class="panel__key">${t[key]}</dt>
      <dd class="panel__val">${value}</dd>
    </div>`
      : "";

  const links = [];
  if (project.link) {
    links.push(
      `<a class="panel__link" href="${project.link}" target="_blank" rel="noreferrer">${t.open} →</a>`
    );
  }
  if (project.motion) {
    links.push(
      `<a class="panel__link panel__link--ghost" href="./assets/work/${project.media}.mp4" target="_blank" rel="noreferrer">${t.raw} →</a>`
    );
  }

  el.panel.innerHTML = `
    <button class="panel__close" type="button">${t.close} ✕</button>
    <span class="panel__index">${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}</span>
    <h3 class="panel__title">${project.client[state.lang]}</h3>
    <span class="panel__format">${project.format[state.lang] || blank}</span>
    <dl class="panel__specs">
      ${row("customer", project.customer[state.lang])}
      ${row("task", project.task[state.lang])}
      ${row("done", project.done[state.lang])}
      ${row("term", project.term[state.lang])}
    </dl>
    <div class="panel__links">${links.join("")}</div>`;

  el.panel
    .querySelector(".panel__close")
    .addEventListener("click", () => state.showroom?.blur());

  el.panel.hidden = false;
  void el.panel.offsetHeight; // форсируем пересчёт, иначе перехода не будет
  el.panel.classList.add("is-open");
}

function hidePanel() {
  el.panel.classList.remove("is-open");
  setTimeout(() => {
    if (!el.panel.classList.contains("is-open")) el.panel.hidden = true;
  }, 260);
}

function mount() {
  const data = window.RERUN;
  if (!data || state.showroom) return;

  state.lang = data.lang;
  el.stage.hidden = false;
  el.grid.hidden = true;
  // По этому классу styles.css раскладывает страницу поверх
  // витрины вместо обычной ленты блоков.
  document.documentElement.classList.add("is-showroom");
  el.hint.textContent = T[state.lang].loading;

  state.showroom = new Showroom(el.canvas, data.projects, {
    onReady: () => {
      el.hint.textContent = T[state.lang].hint;
    },
    // Модели не приехали — возвращаем сетку. Пустая комната
    // хуже плоского списка работ.
    onFail: () => unmount(),
    onFocus: (project, index) => {
      renderPanel(project, index, data.projects.length);
      el.hint.classList.add("is-dim");
    },
    onBlur: () => {
      hidePanel();
      el.hint.classList.remove("is-dim");
    },
  });

  // ручка наружу: удобно щупать сцену из консоли
  window.RERUN.showroom = state.showroom;
}

function unmount() {
  if (!state.showroom) return;
  state.showroom.dispose();
  state.showroom = null;
  document.documentElement.classList.remove("is-showroom");
  el.stage.hidden = true;
  el.grid.hidden = false;
  hidePanel();
}

/* Язык переключили — перерисовываем открытую карточку. */
window.addEventListener("rerun:lang", (e) => {
  state.lang = e.detail.lang;
  if (!state.showroom) return;
  if (state.showroom.models) el.hint.textContent = T[state.lang].hint;
  const unit = state.showroom.focused;
  if (unit) renderPanel(unit.project, unit.index, window.RERUN.projects.length);
});

/* Витрина — первый экран, поэтому поднимаем её сразу,
   без ожидания прокрутки. */
function watch() {
  if (state.showroom) return;
  if (shouldMount()) mount();
}

/* Ушли скроллом с витрины — закрываем проект. Витрина теперь
   подложка всей страницы и никуда не девается, поэтому открытая
   карточка иначе висела бы поверх текста о студии. */
window.addEventListener(
  "scroll",
  () => {
    if (!state.showroom || !state.showroom.focused) return;
    if (window.scrollY > window.innerHeight * 0.25) state.showroom.blur();
  },
  { passive: true }
);

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state.showroom && !shouldMount()) unmount();
    else if (!state.showroom && shouldMount()) watch();
  }, 250);
});

if (window.RERUN) watch();
else window.addEventListener("rerun:ready", watch, { once: true });
