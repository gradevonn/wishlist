/* ─────────────────────────────────────────────────────────────
   re::run — загрузочный экран.

   Включается телевизор: щелчок, прогрев, снег, захват сигнала,
   настроечная таблица, заставка канала, выключение в точку.

   ПОЧЕМУ ЭТО ОБЫЧНЫЙ СКРИПТ ПРЯМО В ТЕЛЕ СТРАНИЦЫ
   script.js излучает rerun:ready СИНХРОННО, пока страница ещё
   парсится. Модуль или подписка внутри DOMContentLoaded приходят
   позже — событие уже прошло, и ждать его бессмысленно. Поэтому
   скрипт стоит сразу после разметки лоудера и до script.js, а
   каждая веха проверяется И событием, И текущим состоянием.

   ПРАВИЛО, НА КОТОРОМ ВСЁ ДЕРЖИТСЯ
   Раскадровку ведёт CSS. Этот скрипт умеет только УКОРОТИТЬ её —
   повесить .is-locked раньше потолка. Он не умеет её продлить и
   не умеет оставить занавес висеть: уводит слой анимация, которая
   запущена с первого кадра и доигрывает сама.
   ───────────────────────────────────────────────────────────── */

(function () {
  "use strict";

  var boot = document.getElementById("boot");
  if (!boot) return;

  var html = document.documentElement;
  var mode = html.getAttribute("data-boot") || "cold";

  /* Сколько ждать сигнала. Пол нужен, чтобы на прогретом кэше снег
     не хлопнул одним кадром и «сигнала нет» успело прочитаться.
     Потолок — чтобы медленная сеть не держала зрителя вечно. */
  /* full — полный монтаж ровно на десять секунд: у него пол и
     потолок совпадают, поэтому длительность не зависит ни от сети,
     ни от кэша. Остальные режимы тянутся по настоящей загрузке. */
  var FLOOR = mode === "full" ? 6100 : mode === "warm" ? 300 : 900;
  var CEILING = mode === "full" ? 6100 : mode === "warm" ? 900 : 5500;

  var SNOW_AT = mode === "warm" ? 250 : 1350; // когда по раскадровке начинается снег
  // от захвата сигнала до снятия слоя; при отключённой анимации
  // хвост короткий, иначе невидимый слой ещё секунду ловил бы клики
  var TAIL = mode === "still" ? 700 : mode === "warm" ? 1400 : 2550;
  var BAIL = 11000; // крайний срок, если что-то пошло не так

  var started = performance.now();
  var locked = false;
  var gone = false;

  /* ── Экран: снег ──────────────────────────────────────────────
     Маленький канвас, растянутый на стекло с pixelated. Зерно
     крупное и кадров двадцать пять в секунду: на шестидесяти шум
     сливается в ровную серую кашу и перестаёт быть снегом. */
  var canvas = boot.querySelector(".boot__snow");
  var ctx = null;
  try {
    ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
  } catch (e) {
    ctx = null;
  }

  var W = 150;
  var H = 112;
  var image = null;
  var buf = null;
  if (ctx) {
    canvas.width = W;
    canvas.height = H;
    try {
      image = ctx.createImageData(W, H);
      buf = new Uint32Array(image.data.buffer);
    } catch (e) {
      ctx = null;
    }
  }

  var progress = 0; // 0..1, настоящая загрузка
  var raf = 0;
  var lastFrame = 0;

  function grain(now) {
    raf = requestAnimationFrame(grain);
    if (locked || document.hidden) return;
    if (now - lastFrame < 42) return;
    lastFrame = now;

    // чем больше приехало, тем тише шум: сеть видно на экране
    var density = 0.85 - progress * 0.55;
    var floorLevel = 14 + progress * 26;
    for (var i = 0; i < buf.length; i++) {
      var v =
        Math.random() < density
          ? (Math.random() * 210 + 30) | 0
          : (floorLevel + Math.random() * 10) | 0;
      buf[i] = (255 << 24) | (v << 16) | (v << 8) | v;
    }
    ctx.putImageData(image, 0, 0);
  }

  if (ctx && mode !== "still") raf = requestAnimationFrame(grain);

  /* ── Экранное меню: что именно сейчас грузится ───────────────── */
  var osd = boot.querySelector(".boot__osd");
  var BUDGET = 4954948; // three.js + четыре модели, померено на диске
  function readout() {
    if (!osd) return;
    if (progress <= 0) {
      osd.textContent = "СИГНАЛ · НЕТ";
      return;
    }
    var mb = ((progress * BUDGET) / 1048576).toFixed(1);
    osd.textContent = "СИГНАЛ · " + mb + " / 4.7 МБ";
  }
  readout();

  function setProgress(v) {
    progress = v < 0 ? 0 : v > 1 ? 1 : v;
    boot.style.setProperty("--p", progress.toFixed(3));
    // период кадровой полосы меняем ступенями: менять длительность
    // живой анимации нельзя, она дёргается
    var step = progress > 0.66 ? "p-2" : progress > 0.33 ? "p-1" : "p-0";
    if (boot.getAttribute("data-p") !== step) boot.setAttribute("data-p", step);
    readout();
  }

  /* ── Вехи ─────────────────────────────────────────────────────
     Каждая проверяется и по состоянию, и по событию: подписка
     могла опоздать, а флаг уже стоит. */
  function once(check, event, name) {
    return new Promise(function (resolve) {
      if (check()) return resolve(name);
      window.addEventListener(
        event,
        function () {
          if (check()) resolve(name);
        },
        false
      );
    });
  }

  var milestones = [];

  // галерея отрисована, данные проектов на месте
  milestones.push(
    once(
      function () {
        return !!window.RERUN;
      },
      "rerun:ready",
      "данные"
    )
  );

  // витрина: ждём только если она реально поднимается
  milestones.push(
    once(
      function () {
        var p = window.RERUN_SHOWROOM;
        // skip — витрины не будет, показывать есть что уже сейчас
        // fail — упала, mount.js вернул галерею, тоже разрешение
        return p === "skip" || p === "ready" || p === "fail";
      },
      "rerun:showroom",
      "витрина"
    )
  );

  // собственные картинки лоудера: без них показывать нечего
  var art = [].slice.call(boot.querySelectorAll("img"));
  art.forEach(function (img) {
    milestones.push(
      new Promise(function (resolve) {
        if (img.complete) return resolve("картинка");
        img.addEventListener("load", function () {
          resolve("картинка");
        });
        // не приехала — не беда: на экране честно идёт снег
        img.addEventListener("error", function () {
          resolve("картинка");
        });
      })
    );
  });

  if (document.fonts && document.fonts.ready) {
    milestones.push(document.fonts.ready.catch(function () {}));
  }

  /* Байты моделей течут из showroom.js через mount.js. Опрашиваем,
     а не подписываемся: событие на каждый чанк — это лишний мусор. */
  var poll = setInterval(function () {
    var bytes = window.RERUN_BYTES || 0;
    var res = performance.getEntriesByType
      ? performance.getEntriesByType("resource")
      : [];
    for (var i = 0; i < res.length; i++) {
      if (res[i].name.indexOf("three.module.js") >= 0) {
        bytes += res[i].transferSize || res[i].decodedBodySize || 0;
      }
    }
    var byBytes = bytes / BUDGET;
    // на телефоне моделей нет вовсе — там прогресс идёт по времени
    var byTime = (performance.now() - started - SNOW_AT) / CEILING;
    setProgress(Math.max(byBytes, byTime * 0.9));
  }, 120);

  /* ── Захват сигнала ───────────────────────────────────────────
     Не раньше пола, не позже потолка. Потолок держит setTimeout, а
     не кадровый цикл: в фоновой вкладке кадры не идут вовсе. */
  function lock() {
    if (locked || gone) return;
    locked = true;
    clearInterval(poll);
    setProgress(1);
    if (raf) cancelAnimationFrame(raf);
    boot.classList.add("is-locked");

    // pointer-events снимаем в начале ухода, а не последним кадром
    setTimeout(function () {
      boot.classList.add("is-off");
    }, Math.max(0, TAIL - (mode === "still" ? 240 : mode === "warm" ? 350 : 630)));

    // снятие узла — гонка события и таймера, что первым
    var done = false;
    function remove() {
      if (done) return;
      done = true;
      gone = true;
      if (boot.parentNode) boot.parentNode.removeChild(boot);
      html.classList.remove("is-booting");
    }
    boot.addEventListener("animationend", function (e) {
      if (e.animationName === "boot-collapse") setTimeout(remove, 320);
    });
    setTimeout(remove, TAIL + 400);
  }

  var elapsed = function () {
    return performance.now() - started;
  };

  Promise.all(milestones)
    .catch(function () {})
    .then(function () {
      var wait = Math.max(0, SNOW_AT + FLOOR - elapsed());
      setTimeout(lock, wait);
    });

  // потолок: сколько бы ни грузилось, дальше не ждём
  setTimeout(lock, SNOW_AT + CEILING);

  // если скрипт после этого сломается, слой уводит анимация boot-bail
  window.addEventListener("error", function () {
    lock();
  });

  /* Нажал кнопку — телевизор выключился. Первые 400 мс не слушаем:
     случайный клик с прошлой страницы не должен съесть всё. */
  setTimeout(function () {
    ["pointerdown", "keydown", "wheel", "touchstart"].forEach(function (ev) {
      window.addEventListener(ev, lock, { once: true, passive: true });
    });
  }, 400);

  /* Вкладку увели в фон. Шум не крутим, но главное другое: в
     скрытой вкладке css-анимации замирают, и раскадровка стоит.
     Вернулись, а по времени всё давно прошло — уводим занавес
     сразу, без досматривания. */
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) return;
    lastFrame = 0;
    if (elapsed() > SNOW_AT + CEILING) lock();
  });

  if (mode === "still") lock();
})();
