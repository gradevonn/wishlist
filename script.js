/* ─────────────────────────────────────────────────────────────
   re::run — данные, переключатель языка, кинескоп.

   КАК ЗАПОЛНЯТЬ ПРОЕКТ
   client   — заголовок: чей это проект, что видит зритель
   customer — ЗАКАЗЧИК: кто позвал нас. Часто это студия или
              продакшн, а не сам бренд, — в этом и весь смысл
   media    — базовое имя файлов в assets/work (без расширения).
              Есть .mp4/.webm — экран оживает, иначе стоит .jpg
   link     — куда ведёт кнопка «открыть проект». Пусто — кнопки нет
   format   — одна строка: что это за работа
   task     — ЗАДАЧА: с чем к нам пришли
   done     — ЧТО СДЕЛАЛИ: что мы закрыли
   term     — СРОК: за сколько

   Пустое поле просто не показывается — ни в витрине, ни на
   странице проекта. Сайт от этого не ломается.
   ───────────────────────────────────────────────────────────── */

const projects = [
  {
    client: { ru: "VK Fest", en: "VK Fest" },
    customer: { ru: "Goggy, продакшн", en: "Goggy, production" },
    media: "vkfest",
    motion: true,
    link: "",
    format: { ru: "Экранный контент", en: "Screen content" },
    task: { ru: "Контент на экраны фестиваля", en: "Screen content for the festival" },
    done: {
      ru: "Пиксельные ролики для экранов площадки.",
      en: "Pixel-art films for the screens on site.",
    },
    term: { ru: "2 недели", en: "2 weeks" },
  },
  {
    client: { ru: "Карандаш Фест", en: "Karandash Fest" }, // TODO: как пишем по-английски
    customer: { ru: "MEW Studios", en: "MEW Studios" },
    media: "karandash",
    motion: true,
    link: "",
    format: { ru: "Айдентика и экраны", en: "Identity and screens" },
    task: {
      ru: "Айдентика фестиваля и контент на экраны",
      en: "Festival identity and screen content",
    },
    done: {
      ru: "Айдентика и всё, что из неё растёт: интро, подложки, плашки с именами, интервью.",
      en: "The identity and everything downstream of it: intros, backplates, name cards, interviews.",
    },
    term: { ru: "неделя", en: "1 week" },
  },
  {
    client: { ru: "ПСБ", en: "PSB Bank" },
    customer: { ru: "ONY", en: "ONY" },
    media: "psb",
    motion: true,
    link: "",
    format: { ru: "Презентация ребрендинга", en: "Rebrand presentation" },
    task: {
      ru: "Контент для презентации новой айдентики",
      en: "Content for the new identity presentation",
    },
    done: {
      ru: "Показали новую айдентику в движении: интро и интерфейсы банка.",
      en: "Put the new identity in motion: an intro and the bank\u2019s interfaces.",
    },
    term: { ru: "2 недели", en: "2 weeks" },
  },
  {
    client: { ru: "Совкомбанк", en: "Sovcombank" },
    customer: { ru: "MEW Studios", en: "MEW Studios" },
    media: "sovcombank",
    motion: true,
    link: "",
    format: { ru: "Наружная реклама", en: "Outdoor campaign" },
    task: { ru: "Контент на билборды", en: "Billboard content" },
    done: {
      ru: "Собрали ролики кампании под форматы наружки.",
      en: "Built the campaign films for outdoor formats.",
    },
    term: { ru: "неделя", en: "1 week" },
  },
  {
    client: { ru: "Called a Garment × OMANKO", en: "Called a Garment × OMANKO" },
    customer: { ru: "Called a Garment, бренд", en: "Called a Garment, the brand" },
    media: "omanko-ar",
    link: "https://vimeo.com/1140697728", // TODO: проверить, что ссылка публичная
    format: { ru: "AR-инсталляция", en: "AR installation" },
    task: { ru: "AR-инсталляция для бренда", en: "An AR installation for the brand" },
    done: {
      ru: "Генерация в реальном времени: картинка реагировала на происходящее вокруг.",
      en: "Generated in real time \u2014 the image reacted to what was happening around it.",
    },
    term: { ru: "2 недели", en: "2 weeks" },
  },
  {
    client: { ru: "Катарская полицейская академия", en: "Qatar Police Academy" },
    customer: { ru: "MEW Studios", en: "MEW Studios" },
    media: "qatar",
    motion: true,
    link: "https://disk.yandex.ru/i/mRHxo2k0fjjsYg",
    format: { ru: "AI-анимация", en: "AI animation" },
    task: {
      ru: "Ролик о новом логотипе академии",
      en: "A film about the academy\u2019s new logo",
    },
    done: {
      ru: "Книга раскрывается, прилетает сокол, из него собирается герб. Всё на AI-инструментах.",
      en: "A book opens, a falcon lands, the crest assembles out of it. All on AI tools.",
    },
    term: { ru: "неделя", en: "1 week" },
  },
  {
    client: {
      ru: "Федерация водных видов спорта",
      en: "Russian Aquatics Federation", // TODO: сверить официальное имя
    },
    customer: { ru: "Goggy, продакшн", en: "Goggy, production" },
    media: "waterpolo",
    motion: true,
    link: "https://disk.yandex.ru/i/32MvovG1Sf2lmA",
    format: { ru: "AI-VFX", en: "AI VFX" },
    task: { ru: "Визуальные эффекты для ролика", en: "Visual effects for the film" },
    done: {
      ru: "Вода, брызги и тепловизор под водой — плюс сгенерированный пэкшот.",
      en: "Water, spray and thermal shots underwater \u2014 plus a generated packshot.",
    },
    term: { ru: "2 недели", en: "2 weeks" },
  },
  {
    client: { ru: "HUB", en: "HUB" },
    customer: { ru: "HUB, салон красоты", en: "HUB, a hair salon" },
    media: "hub",
    motion: true,
    link: "https://vimeo.com/1143117084",
    format: { ru: "Рекламный ролик", en: "Commercial" },
    task: { ru: "Реклама салона", en: "A commercial for the salon" },
    done: {
      ru: "Ролик в духе нулевых: плёночная фактура, ночной город, HUB из состриженных волос.",
      en: "A 2000s-style film: grain, the city at night, HUB spelled out in cut hair.",
    },
    term: { ru: "месяц", en: "1 month" },
  },
];

/* Форматы носителей — показаны в реальных пропорциях друг к другу. */
const ratios = [
  { ar: "4 / 1", ru: "led-экран", en: "led wall", label: "4:1" },
  { ar: "32 / 9", ru: "медиафасад", en: "media façade", label: "32:9" },
  { ar: "2 / 1", ru: "билборд", en: "billboard", label: "2:1" },
  { ar: "16 / 9", ru: "тв и диджитал", en: "tv & digital", label: "16:9" },
  { ar: "9 / 16", ru: "сторис", en: "stories", label: "9:16" },
];

const i18n = {
  ru: {
    "meta.description":
      "Внешняя команда постпродакшена для студий и агентств. Постпрод и ИИ целиком на нас.",
    "page.title": "re::run — внешняя команда постпродакшена",
    "hero.title": "У вас проект. У вас нет рук. Дальше&nbsp;— наша проблема.",
    "nav.cta": "написать",

    "brief.lead": "Внешняя команда постпродакшена для студий и агентств.",
    "brief.1": "Постпрод и ИИ — целиком на нас",
    "brief.2": "Подхватываем проект за сутки",
    "brief.3": "Считаем под носитель, а не под 16:9",
    "brief.4": "Работаем под вашим именем",

    "contact.title": "Напишите, что у вас горит.",

    "work.open": "открыть",
    "work.customer": "заказчик",
    "work.task": "задача",
    "work.done": "что сделали",
    "work.term": "срок",
    "work.tap": "нажмите на телевизор",
    "proj.back": "все работы",
    "proj.open": "открыть проект",
    "proj.raw": "посмотреть без шейдера",
  },

  en: {
    "meta.description":
      "An outside post-production team for studios and agencies. Post and AI, entirely off your plate.",
    "page.title": "re::run — an outside post-production team",
    "hero.title": "You\u2019ve got the job. You haven\u2019t got the hands. From here it\u2019s our problem.",
    "nav.cta": "get in touch",

    "brief.lead": "An outside post-production team for studios and agencies.",
    "brief.1": "Post and AI, entirely off your plate",
    "brief.2": "We pick up a project within a day",
    "brief.3": "We build for the surface, not for 16:9",
    "brief.4": "We work under your name",

    "contact.title": "Tell us what\u2019s on fire.",

    "work.open": "open",
    "work.customer": "client",
    "work.task": "the brief",
    "work.done": "what we did",
    "work.term": "turnaround",
    "work.tap": "tap a set",
    "proj.back": "all work",
    "proj.open": "open project",
    "proj.raw": "watch without the shader",
  },
};

/* ── Рендер ──────────────────────────────────────────────────── */

/* Рамки аппаратов: те же модели, что в витрине, отрендеренные
   анфас — с прозрачным фоном и ДЫРКОЙ на месте стекла. Видео
   кладётся под рамку, и она сама обрезает его по своей
   скруглённой апертуре, как настоящий кинескоп.

   screen — где эта дырка, в долях картинки. Числа считает
   models/_build/render_front.py, он же печатает этот блок
   целиком, когда модели пересобирают. */
const TV_FRAMES = {
  goldstar:  { w: 800, h: 819, screen: { x: 0.13625, y: 0.13248, w: 0.7275,  h: 0.53236 } },
  panasonic: { w: 800, h: 775, screen: { x: 0.09563, y: 0.09097, w: 0.80875, h: 0.64323 } },
  tecno:     { w: 800, h: 749, screen: { x: 0.13187, y: 0.11808, w: 0.73625, h: 0.59973 } },
  combo:     { w: 800, h: 872, screen: { x: 0.085,   y: 0.10436, w: 0.83,    h: 0.59576 } },
};

/* Порядок тот же, что в витрине, — за проектом закреплён свой
   аппарат, и на телефоне он такой же, как на большом экране. */
const TV_ORDER = ["goldstar", "panasonic", "tecno", "combo"];
const tvFor = (i) => TV_ORDER[i % TV_ORDER.length];

const grid = document.querySelector("#work-grid");
const projView = document.querySelector("#proj");
const ratioList = document.querySelector("#ratios"); // блока может не быть

let currentLang = "ru";

/* Один аппарат. Видео идёт в разметке РАНЬШЕ рамки: порядок в
   потоке и решает, что окажется сверху. */
function tvMarkup(p, i, lang, eager) {
  const key = tvFor(i);
  const f = TV_FRAMES[key];
  const name = p.client[lang];

  /* Стоп-кадр лежит ОТДЕЛЬНОЙ картинкой под видео, а само видео
     проявляется только когда реально пошло. Атрибута poster для
     этого мало: он показывается лишь до первого запуска, а после
     паузы или перемотки элемент отдаёт чёрный прямоугольник. */
  const still = `<img class="tv__still" src="./assets/work/${p.media}.jpg"
                      alt="${name}" loading="${eager ? "eager" : "lazy"}" />`;

  const media = p.motion
    ? still +
      `<video class="tv__media" muted loop playsinline
              preload="${eager ? "auto" : "none"}" aria-hidden="true">
         <source src="./assets/work/${p.media}.webm" type="video/webm" />
         <source src="./assets/work/${p.media}.mp4" type="video/mp4" />
       </video>`
    : still;

  const vars = [
    `--tw:${f.w}`, `--th:${f.h}`,
    `--sx:${f.screen.x}`, `--sy:${f.screen.y}`,
    `--sw:${f.screen.w}`, `--sh:${f.screen.h}`,
  ].join("; ");

  return `
    <span class="tv" style="${vars}">
      <span class="tv__screen">
        ${media}
        <span class="tv__scan" aria-hidden="true"></span>
        <span class="tv__vignette" aria-hidden="true"></span>
      </span>
      <img class="tv__frame" src="./assets/tv/${key}.webp" alt="" aria-hidden="true"
           width="${f.w}" height="${f.h}" loading="${eager ? "eager" : "lazy"}" />
    </span>`;
}

function renderWork(lang) {
  const t = i18n[lang];

  grid.innerHTML =
    `<p class="gallery__hint">${t["work.tap"]}</p>` +
    projects
      .map(
        (p, i) => `
      <button class="tvcard reveal" type="button" data-index="${i}">
        ${tvMarkup(p, i, lang, i < 2)}
        <span class="tvcard__meta">
          <span class="tvcard__name">${p.client[lang]}</span>
          ${p.format[lang] ? `<span class="tvcard__format">${p.format[lang]}</span>` : ""}
        </span>
      </button>`
      )
      .join("");

  grid.querySelectorAll(".tvcard").forEach((card) => {
    card.addEventListener("click", () => openProject(+card.dataset.index));
  });

  bindScreens();
}

/* ── Страница проекта ────────────────────────────────────────── */

function renderProject(i, lang) {
  const p = projects[i];
  const t = i18n[lang];
  /* Незаполненные поля просто не показываем. Три прочерка подряд
     читаются как сломанная страница, а не как «ещё не написали». */
  const row = (key, value) =>
    value
      ? `
    <div class="proj__row">
      <dt class="proj__key">${t["work." + key]}</dt>
      <dd class="proj__val">${value}</dd>
    </div>`
      : "";

  const links = [];
  if (p.link) {
    links.push(
      `<a class="proj__link" href="${p.link}" target="_blank" rel="noreferrer">${t["proj.open"]} →</a>`
    );
  }
  if (p.motion) {
    links.push(
      `<a class="proj__link proj__link--ghost" href="./assets/work/${p.media}.mp4" target="_blank" rel="noreferrer">${t["proj.raw"]} →</a>`
    );
  }

  projView.innerHTML = `
    <div class="proj__bar">
      <button class="proj__back" type="button">← ${t["proj.back"]}</button>
      <span class="proj__index">${String(i + 1).padStart(2, "0")} / ${String(projects.length).padStart(2, "0")}</span>
    </div>
    <div class="proj__set">${tvMarkup(p, i, lang, true)}</div>
    <div class="proj__body">
      <h2 class="proj__title">${p.client[lang]}</h2>
      ${p.format[lang] ? `<span class="proj__format">${p.format[lang]}</span>` : ""}
      <dl class="proj__specs">
        ${row("customer", p.customer[lang])}
        ${row("task", p.task[lang])}
        ${row("done", p.done[lang])}
        ${row("term", p.term[lang])}
      </dl>
      <div class="proj__links">${links.join("")}</div>
    </div>`;

  projView.querySelector(".proj__back").addEventListener("click", closeProject);

  const video = projView.querySelector("video");
  if (video && !reduceMotion) wake(video);
}

let openIndex = -1;

/* Витрина на большом экране показывает проект сама, своей
   карточкой. Вторую поверх неё открывать незачем. */
const showroomUp = () =>
  document.documentElement.classList.contains("is-showroom");

function openProject(i) {
  const hash = `#/p/${projects[i].media}`;
  if (location.hash !== hash) history.pushState(null, "", hash);
  showProject(i);
}

function showProject(i) {
  /* Ссылку на проект могли прислать с телефона, а открыть на
     большом экране. Своей страницы там нет — витрина показывает
     проект сама, поэтому просто подлетаем к нужному аппарату. */
  if (showroomUp()) {
    const showroom = window.RERUN && window.RERUN.showroom;
    if (!showroom) return;
    Promise.resolve(showroom.ready).then(() => {
      const unit = showroom.slots && showroom.slots[i];
      if (unit) showroom.focus(unit);
    });
    return;
  }

  openIndex = i;
  renderProject(i, currentLang);
  projView.hidden = false;
  document.documentElement.classList.add("is-proj");
  window.scrollTo(0, 0);
}

function hideProject() {
  if (openIndex < 0) return;
  openIndex = -1;
  const video = projView.querySelector("video");
  if (video) video.pause();
  projView.hidden = true;
  projView.innerHTML = "";
  document.documentElement.classList.remove("is-proj");
}

/* Закрываем через историю: тогда системная кнопка «назад» и
   кнопка на экране делают одно и то же, а не спорят. */
function closeProject() {
  if (location.hash.startsWith("#/p/")) history.back();
  else hideProject();
}

function routeFromHash() {
  const m = location.hash.match(/^#\/p\/(.+)$/);
  if (!m) {
    hideProject();
    return;
  }
  const i = projects.findIndex((p) => p.media === decodeURIComponent(m[1]));
  if (i < 0) hideProject();
  else showProject(i);
}

window.addEventListener("hashchange", routeFromHash);
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && openIndex >= 0) closeProject();
});

/* Экран оживает под курсором; на тач-устройствах — когда попадает в кадр. */

/* play() может отказать, пока у видео нет данных — пробуем ещё раз,
   когда первый кадр догрузился. */
function wake(video) {
  // проявляем ровно в тот момент, когда браузер показал первый кадр
  video.addEventListener("playing", () => video.classList.add("is-live"), {
    once: true,
  });

  const attempt = video.play();
  if (!attempt || !attempt.catch) return;
  attempt.catch(() => {
    video.addEventListener(
      "loadeddata",
      () => {
        const retry = video.play();
        if (retry && retry.catch) retry.catch(() => {});
      },
      { once: true }
    );
  });
}

function sleep(video) {
  video.classList.remove("is-live");
  video.pause();
  video.currentTime = 0;
}

let screenObserver = null;

function bindScreens() {
  if (screenObserver) {
    screenObserver.disconnect();
    screenObserver = null;
  }

  const videos = [...grid.querySelectorAll(".tv__media")].filter(
    (el) => el.tagName === "VIDEO"
  );
  if (!videos.length || reduceMotion) return;

  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    videos.forEach((v) => {
      const card = v.closest(".tvcard");
      card.addEventListener("pointerenter", () => wake(v));
      card.addEventListener("pointerleave", () => sleep(v));
    });
    return;
  }

  /* На телефоне играет только то, что сейчас перед глазами:
     восемь одновременных потоков — это и батарея, и трафик. */
  screenObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        // уехал из кадра — гасим и отматываем на начало
        if (e.isIntersecting) wake(e.target);
        else sleep(e.target);
      });
    },
    { threshold: 0.55 }
  );
  videos.forEach((v) => screenObserver.observe(v));
}

function renderRatios(lang) {
  if (!ratioList) return;
  ratioList.innerHTML = ratios
    .map(
      (r) => `
      <li>
        <div class="ratio__box" style="--ar: ${r.ar}"></div>
        <span class="ratio__name">${r[lang]}</span>
        <span class="ratio__ar">${r.label}</span>
      </li>`
    )
    .join("");
}

/* ── Язык ────────────────────────────────────────────────────── */

function applyLang(lang) {
  const dict = i18n[lang];
  currentLang = lang;

  document.documentElement.lang = lang;
  document.title = dict["page.title"];

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const value = dict[el.dataset.i18n];
    if (value === undefined) return;
    if (el.tagName === "META") el.setAttribute("content", value);
    else el.innerHTML = value;
  });

  document.querySelectorAll(".lang__btn").forEach((btn) => {
    btn.classList.toggle("is-on", btn.dataset.lang === lang);
    btn.setAttribute("aria-pressed", String(btn.dataset.lang === lang));
  });

  renderWork(lang);
  renderRatios(lang);
  observeReveals();
  // открытую страницу проекта перерисовываем на новом языке
  if (openIndex >= 0) renderProject(openIndex, lang);

  // витрина живёт в отдельном модуле и берёт данные отсюда
  window.RERUN = { projects, lang };
  window.dispatchEvent(new CustomEvent("rerun:lang", { detail: { lang } }));

  try {
    localStorage.setItem("rerun-lang", lang);
  } catch (e) {
    /* приватный режим — просто не запоминаем */
  }
}

function initialLang() {
  try {
    const saved = localStorage.getItem("rerun-lang");
    if (saved === "ru" || saved === "en") return saved;
  } catch (e) {
    /* нет доступа к хранилищу */
  }
  return (navigator.language || "ru").toLowerCase().startsWith("ru")
    ? "ru"
    : "en";
}

document.querySelectorAll(".lang__btn").forEach((btn) => {
  btn.addEventListener("click", () => applyLang(btn.dataset.lang));
});

/* ── Появление при скролле ───────────────────────────────────── */

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  },
  { threshold: 0.12 }
);

function observeReveals() {
  document.querySelectorAll(".reveal:not(.is-visible)").forEach((el) => {
    if (reduceMotion) el.classList.add("is-visible");
    else observer.observe(el);
  });

  // Страховка: если наблюдатель не отработал, то, что уже в кадре,
  // всё равно должно проявиться — пустого экрана быть не должно.
  clearTimeout(observeReveals.failsafe);
  observeReveals.failsafe = setTimeout(() => {
    document.querySelectorAll(".reveal:not(.is-visible)").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) {
        el.classList.add("is-visible");
      }
    });
  }, 2000);
}

/* ── Старт ───────────────────────────────────────────────────── */

applyLang(initialLang());
window.dispatchEvent(new CustomEvent("rerun:ready"));

/* Ссылку на проект можно открыть напрямую — разбираем адрес
   после того, как витрина решила, поднимается она или нет. */
requestAnimationFrame(routeFromHash);
