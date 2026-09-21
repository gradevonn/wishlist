/* ─────────────────────────────────────────────────────────────
   re//run — витрина магазина электроники.

   Гора кинескопов, как товар на распродаже. Жмёшь на телевизор —
   камера подлетает, сбоку выезжает текст о проекте, на экране
   под CRT-шейдером играет работа.

   Корпуса — настоящие модели из scene/models/*.glb. Сборщик привёл
   их к общему виду: лицо в +Z, низ на Y=0, высота ровно 1, — и
   вырезал стекло в отдельный меш __rerun_screen с плоской
   развёрткой. Своя развёртка стекла у каждой модели была своя,
   и картинку на ней рвало.

   Телефон сюда не заходит — там остаётся обычная сетка.
   ───────────────────────────────────────────────────────────── */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/* Четыре аппарата. Порядок важен: в горе модели идут по кругу
   по этому списку, иначе случай ставит в первый ряд четыре
   одинаковых корпуса. */
const MODEL_FILES = ["goldstar", "panasonic", "tecno", "combo"];
const SCREEN_NAME = "__rerun_screen";

const IDLE_Z = 4.6; // камера, когда ничего не выбрано
const FOCUS_MIN = 1.6; // ближе этого к экрану не подлетаем

/* ── Палитра: те же значения, что и в styles.css ── */
const C = {
  void: 0x14161a,
  shell: 0xb9b4a7,
  shellWarm: 0xc6bda6,
  shellGrey: 0x9a9890,
  shellCream: 0xd6cdb6,
  dark: 0x2b2a27,
  glass: 0x0c0e11,
  tally: 0xd8443c,
};

/* ─────────────────────────────────────────────────────────────
   Шейдер экрана
   ───────────────────────────────────────────────────────────── */

const SCREEN_VERT = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SCREEN_FRAG = `
  precision highp float;

  uniform sampler2D uMap;      // видео или колор-бар
  uniform float uTime;
  uniform float uFocus;        // 0 — телик в покое, 1 — выбран
  uniform float uNoise;        // сколько шума подмешивать
  uniform float uDim;          // 1 — обычно, меньше — когда выбран сосед
  uniform vec2  uRes;

  varying vec2 vUv;

  // выпуклость кинескопа
  vec2 curve(vec2 uv) {
    uv = uv * 2.0 - 1.0;
    vec2 off = abs(uv.yx) / vec2(7.0, 5.0);
    uv += uv * off * off;
    return uv * 0.5 + 0.5;
  }

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec2 uv = curve(vUv);

    // за краем стекла — чернота корпуса, а не растянутый пиксель
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      gl_FragColor = vec4(0.02, 0.025, 0.03, 1.0);
      return;
    }

    // расхождение лучей по краям трубки
    float ab = 0.0016 + 0.0034 * (1.0 - uFocus);
    float r = texture2D(uMap, uv + vec2(ab, 0.0)).r;
    float g = texture2D(uMap, uv).g;
    float b = texture2D(uMap, uv - vec2(ab, 0.0)).b;
    vec3 col = vec3(r, g, b);

    // строчная развёртка
    float lines = sin(uv.y * uRes.y * 3.14159);
    col *= 1.0 - 0.18 * lines * lines;

    // теневая маска: чередование по горизонтали
    float mask = mod(floor(uv.x * uRes.x), 3.0);
    vec3 tint = vec3(
      mask == 0.0 ? 1.06 : 0.96,
      mask == 1.0 ? 1.06 : 0.96,
      mask == 2.0 ? 1.06 : 0.96
    );
    col *= tint;

    // кадровая полоса, медленно ползущая вверх
    float roll = fract(uv.y + uTime * 0.11);
    col += 0.035 * smoothstep(0.96, 1.0, roll) * (0.4 + 0.6 * uFocus);

    // шум трубки
    float n = hash(floor(uv * uRes) + floor(uTime * 24.0));
    col = mix(col, vec3(n), uNoise * (0.06 + 0.5 * (1.0 - uFocus)));

    // виньетка и лёгкий подъём чёрного — фосфор не бывает чёрным
    vec2 v = uv * (1.0 - uv.yx);
    float vig = pow(v.x * v.y * 16.0, 0.28);
    col *= vig;
    col += vec3(0.012, 0.016, 0.014);

    // Выбранный телик светит ярче, остальные притухают. База
    // высокая нарочно: работа на экране должна читаться сразу,
    // а не только после того, как на аппарат нажали.
    col *= (0.88 + 0.26 * uFocus) * uDim;

    gl_FragColor = vec4(col, 1.0);
  }
`;

/* ─────────────────────────────────────────────────────────────
   Заглушки на экраны: колор-бар SMPTE
   ───────────────────────────────────────────────────────────── */

function makeBarsTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 192;
  const g = c.getContext("2d");
  const bars = [
    "#c8c8c8", "#c8c814", "#14c8c8", "#14c814",
    "#c814c8", "#c81414", "#1414c8",
  ];
  const w = c.width / bars.length;
  bars.forEach((color, i) => {
    g.fillStyle = color;
    g.fillRect(i * w, 0, w + 1, c.height * 0.76);
  });
  // нижняя служебная полоса
  g.fillStyle = "#0d0f12";
  g.fillRect(0, c.height * 0.76, c.width, c.height * 0.24);
  g.fillStyle = "#1b3a5c";
  g.fillRect(0, c.height * 0.76, c.width / 3, c.height * 0.24);
  g.fillStyle = "#c8c8c8";
  g.fillRect(c.width / 3, c.height * 0.76, c.width / 3, c.height * 0.24);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  return tex;
}

/* Почти чёрное полотно: с шумом даёт снег, без шума — выключенный телевизор. */
function makeDarkTexture() {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 8;
  const g = c.getContext("2d");
  g.fillStyle = "#0a0c0e";
  g.fillRect(0, 0, 8, 8);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  return tex;
}

/* ─────────────────────────────────────────────────────────────
   Корпус телевизора
   ───────────────────────────────────────────────────────────── */

/* ── Корпус ─────────────────────────────────────────────────── */

/* Клон готовой модели. Геометрия и текстуры у клонов общие —
   в сцене их сорок, каждому свою копию держать незачем.
   Отдельный у клона только экран: на нём свой шейдер со своим
   временем, своей работой и своей яркостью. */
function cloneUnitBody(models, rand, screenMaterial, order) {
  const proto =
    models[
      order === undefined
        ? Math.floor(rand() * models.length)
        : order % models.length
    ];

  const group = proto.root.clone(true);
  const screen = group.getObjectByName(SCREEN_NAME);
  if (screen) screen.material = screenMaterial;

  /* Невидимая коробка по габаритам аппарата. Луч мыши бьём по
     ней, а не по самой модели: в моделях десять тысяч
     треугольников на штуку, и честная проверка попадания на
     каждом движении курсора съедает кадр. Заодно пропадают
     мёртвые зоны между корпусами. */
  const pick = new THREE.Mesh(
    new THREE.BoxGeometry(proto.size.w, proto.size.h, proto.size.depth),
    new THREE.MeshBasicMaterial()
  );
  pick.position.set(0, proto.size.h / 2, 0);
  pick.visible = false;
  group.add(pick);
  group.userData.pick = pick;

  group.userData.size = { ...proto.size };
  group.userData.model = proto.name;
  return group;
}

/* Шлифованный металл: одна карта высот, из неё нормаль и
   шероховатость. Полосы горизонтальные — так выглядит лист
   после шлифовки, и свет по нему растягивается длинным бликом,
   а не лежит круглым пятном. */
function metalMaps(seed = 7, size = 512) {
  const rand = seeded(seed);
  const h = new Float32Array(size * size);

  // случайное блуждание вдоль каждой строки даёт штрих, а не шум
  for (let y = 0; y < size; y++) {
    let v = 0;
    for (let x = 0; x < size; x++) {
      v = v * 0.9 + (rand() - 0.5) * 0.3;
      h[y * size + x] = v;
    }
  }

  // отдельные глубокие царапины поверх шлифовки
  for (let i = 0; i < 44; i++) {
    const x0 = Math.floor(rand() * size);
    const y0 = Math.floor(rand() * size);
    const len = 40 + rand() * 280;
    const depth = (rand() - 0.5) * 1.7;
    for (let k = 0; k < len; k++) {
      const x = (x0 + k) % size;
      const y = (((y0 + Math.round(Math.sin(k * 0.012) * 2)) % size) + size) % size;
      h[y * size + x] += depth * (1 - k / len);
    }
  }

  const at = (x, y) =>
    h[(((y % size) + size) % size) * size + (((x % size) + size) % size)];

  const nc = document.createElement("canvas");
  const rc = document.createElement("canvas");
  nc.width = nc.height = rc.width = rc.height = size;
  const nctx = nc.getContext("2d");
  const rctx = rc.getContext("2d");
  const nd = nctx.createImageData(size, size);
  const rd = rctx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 2.2;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 2.2;
      const len = Math.hypot(-dx, -dy, 1);
      const i = (y * size + x) * 4;
      nd.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      nd.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      nd.data[i + 2] = (1 / len) * 0.5 * 255 + 127.5;
      nd.data[i + 3] = 255;

      const r = Math.max(0, Math.min(1, 0.48 + at(x, y) * 0.2));
      rd.data[i] = rd.data[i + 1] = rd.data[i + 2] = r * 255;
      rd.data[i + 3] = 255;
    }
  }
  nctx.putImageData(nd, 0, 0);
  rctx.putImageData(rd, 0, 0);

  const wrap = (canvas) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  return { normal: wrap(nc), rough: wrap(rc) };
}

/* Экран из теней исключаем: он сам себе источник, а как
   заслонка дал бы чёрный прямоугольник внутри корпуса.
   Коробку попадания — тем более, она невидимая. */
function setShadow(group, cast, receive) {
  group.traverse((o) => {
    if (!o.isMesh) return;
    if (o.name === SCREEN_NAME || o === group.userData.pick) {
      o.castShadow = false;
      o.receiveShadow = false;
      return;
    }
    o.castShadow = cast;
    o.receiveShadow = receive;
  });
}

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export class Showroom {
  constructor(canvas, projects, handlers = {}) {
    this.canvas = canvas;
    this.projects = projects;
    this.handlers = handlers;

    this.units = []; // все аппараты
    this.slots = []; // те, за которыми закреплён проект
    this.focused = null;
    this.hovered = null;
    this.clock = new THREE.Clock();
    this.videos = new Map();
    this.disposed = false;

    this.#initRenderer();
    this.#initScene();
    this.#initInput();

    /* Дом камеры — две НЕИЗМЕНЯЕМЫЕ точки. Держать их отдельно
       обязательно: camPos и camLook каждый кадр тянутся к цели,
       и если считать цель от них же, получается интегратор —
       взгляд уползает сам по себе и не возвращается назад. */
    this.homePos = new THREE.Vector3(0, 1.7, IDLE_Z);
    this.homeLook = new THREE.Vector3(0, 1.4, 0);

    this.camPos = this.homePos.clone();
    this.camLook = this.homeLook.clone();
    this.camPosTarget = this.homePos.clone();
    this.camLookTarget = this.homeLook.clone();

    this.#onResize();
    window.addEventListener("resize", this.onResizeBound = () => this.#onResize());

    // Пустую комнату крутим сразу, гору досыпаем, когда приедут
    // модели: так первый кадр не ждёт четыре мегабайта.
    this.renderer.setAnimationLoop(() => this.#tick());

    this.ready = this.#loadModels()
      .then((models) => {
        if (this.disposed) return;
        this.models = models;
        this.#buildWall();
        this.handlers.onReady?.();
      })
      .catch((err) => {
        console.error("[showroom] модели не загрузились", err);
        this.handlers.onFail?.(err);
      });
  }

  #initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = true;
    /* PCF, а не VSM. VSM размывает тень по радиусу и на бумаге
       красивее, но здесь аппараты стоят вплотную к полу и друг к
       другу — на таких дистанциях он подтекает светом и тень
       пропадает вовсе. Мягкость добираем пятнами под кучей. */
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  #initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(C.void);
    this.scene.fog = new THREE.Fog(C.void, 11, 30);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);

    // Магазин ночью: слабый общий свет, тёплая подсветка полок,
    // холодный отблеск с улицы на стекле витрины.
    /* Свет прилавка. Смысл ровно один: товар должен лежать в
       ярком пятне, а всё вокруг — уходить в тень. Поэтому общий
       подсвет держим низким, а работу делают два направленных
       конуса сверху — как лампы над витриной в магазине. */
    this.scene.add(new THREE.HemisphereLight(0x55616f, 0x212327, 0.22));

    /* Главная лампа — крутая, почти сверху, узким конусом.
       Так это и устроено над прилавком: товар лежит в пятне
       света, а за границей пятна всё уходит в темноту. Заодно
       тень прижимается к основанию и читается как опора.
       Плоский свет сбоку давал длинную тень мимо кадра. */
    const key = new THREE.SpotLight(0xfff0d6, 270, 28, 0.48, 0.42, 1.2);
    key.position.set(2.6, 8.2, 1.8);
    key.target.position.set(0, 0.5, -0.5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1.5;
    key.shadow.camera.far = 20;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.018;
    this.scene.add(key, key.target);
    this.keyLight = key;

    // Вторая лампа — холоднее и слабее, с другой стороны:
    // без неё половина корпусов проваливается в чёрное.
    const fill = new THREE.SpotLight(0x93b6dd, 34, 20, 0.66, 0.75, 1.4);
    fill.position.set(-5.6, 4.4, 4.8);
    fill.target.position.set(-0.8, 1.0, -0.6);
    this.scene.add(fill, fill.target);

    // Контровой сзади-сверху: отбивает макушки от стены.
    const rim = new THREE.DirectionalLight(0xa9c0dd, 0.62);
    rim.position.set(-2.4, 5.2, -6.5);
    this.scene.add(rim);

    /* Отдельный свет на задник, скользящий сверху. Без него
       гофра не видна вовсе: остальные лампы направлены от стены,
       и рёбра нечему подсветить по верхней кромке. */
    const wallWash = new THREE.DirectionalLight(0xc2d4ea, 0.95);
    wallWash.position.set(0.5, 10, -3.2);
    wallWash.target.position.set(0, 4, -9);
    this.scene.add(wallWash, wallWash.target);

    // Отражение от пола, чтобы низ корпусов не был угольным.
    const bounce = new THREE.DirectionalLight(0x8a8170, 0.19);
    bounce.position.set(0, -3, 3);
    this.scene.add(bounce);

    this.barsTexture = makeBarsTexture();
    this.darkTexture = makeDarkTexture();

    this.#buildEnvironment();
    this.#buildRoom();
  }

  /* Отражения. Без окружения PBR-материал показывает только
     рассеянный свет: матовый корпус и глянцевая рамка выглядят
     одинаково, и модель читается как пластилин. HDR-файла нет,
     поэтому комнату собираем из нескольких плоскостей сами. */
  #buildEnvironment() {
    const env = new THREE.Scene();

    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(26, 15, 26),
      new THREE.MeshBasicMaterial({ color: 0x191d22, side: THREE.BackSide })
    );
    env.add(shell);

    const panel = (color, w, h, pos, rot) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color })
      );
      m.position.set(pos[0], pos[1], pos[2]);
      if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
      env.add(m);
    };

    // лампы под потолком магазина
    panel(0xfff0d6, 16, 2.6, [0, 7, 1.5], [Math.PI / 2, 0, 0]);
    panel(0xffe8c4, 16, 1.1, [0, 7, -5], [Math.PI / 2, 0, 0]);
    // холодное окно сбоку: оно и даёт длинный блик по краю рамок
    panel(0x8fb1d0, 3.4, 8, [-10, 3.4, 3], [0, Math.PI / 2, 0]);
    panel(0x5e7185, 2.4, 6, [10, 3, 1], [0, -Math.PI / 2, 0]);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    // 0.04 — потолок размытия у PMREM: выше он ругается и всё равно обрезает
    this.envTarget = pmrem.fromScene(env, 0.04);
    this.scene.environment = this.envTarget.texture;
    pmrem.dispose();
    env.traverse((o) => {
      o.geometry?.dispose?.();
      o.material?.dispose?.();
    });
  }

  #buildRoom() {
    const metal = metalMaps();

    // Пол — шлифованный лист: в нём вязнут тени и растягиваются
    // пятна от ламп.
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(46, 30),
      new THREE.MeshStandardMaterial({
        color: 0x262b31,
        metalness: 0.15,
        roughness: 0.72,
        normalMap: metal.normal,
        roughnessMap: metal.rough,
        envMapIntensity: 0.4,
      })
    );
    floor.material.normalMap.repeat.set(9, 6);
    floor.material.roughnessMap.repeat.set(9, 6);
    floor.material.normalScale.set(0.07, 0.07);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    /* Задник — гофрированный лист, как опущенный ролет магазина.
       Рёбра сделаны геометрией, а не картинкой: только тогда
       у каждого ребра появляется своя подсветка сверху, и стена
       перестаёт быть плоским пятном. */
    const RIB = 1.15; // шаг ребра
    const AMP = 0.11; // глубина
    const wall = new THREE.PlaneGeometry(46, 17, 2, Math.round(17 / RIB) * 10);
    const pos = wall.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setZ(i, Math.cos((pos.getY(i) / RIB) * Math.PI * 2) * AMP);
    }
    wall.computeVertexNormals();

    const back = new THREE.Mesh(
      wall,
      new THREE.MeshStandardMaterial({
        color: 0x23282f,
        metalness: 0.68,
        roughness: 0.48,
        normalMap: metal.normal.clone(),
        roughnessMap: metal.rough.clone(),
        envMapIntensity: 1.0,
      })
    );
    back.material.normalMap.needsUpdate = true;
    back.material.roughnessMap.needsUpdate = true;
    back.material.normalMap.repeat.set(6, 2.4);
    back.material.roughnessMap.repeat.set(6, 2.4);
    back.material.normalScale.set(0.3, 0.3);
    back.position.set(0, 8.5, -9);
    back.receiveShadow = true;
    this.scene.add(back);
  }

  /* Модели грузятся один раз, дальше по сцене расходятся клоны. */
  async #loadModels() {
    const loader = new GLTFLoader();

    /* onProgress третьим аргументом: по нему загрузочный экран
       считает настоящие байты, а не изображает занятость. */
    const seen = new Map();
    const report = (name) => (e) => {
      seen.set(name, e.loaded || 0);
      let total = 0;
      seen.forEach((v) => (total += v));
      this.handlers.onBytes?.(total);
    };

    const load = (name) =>
      new Promise((res, rej) =>
        loader.load(`./scene/models/${name}.glb`, res, report(name), rej)
      );

    /* Гонка с таймаутом обязательна. loader.load отклоняет промис
       только на ошибке загрузчика: если соединение живо, а байты
       кончились — captive portal, севшая LTE, отвалившийся VPN, —
       он не отклонит НИЧЕГО и не позовёт onFail. Тогда витрина
       висит пустой комнатой навсегда. */
    const gltfs = await Promise.race([
      Promise.all(MODEL_FILES.map(load)),
      new Promise((_, rej) =>
        setTimeout(() => rej(new Error("модели не приехали за 15 секунд")), 15000)
      ),
    ]);

    return gltfs.map((gltf, i) => {
      const root = gltf.scene;
      root.updateMatrixWorld(true);

      root.traverse((o) => {
        if (!o.isMesh || !o.material || o.material.name === SCREEN_NAME) return;
        // блики по корпусу считаем сдержанно: это магазин ночью,
        // а не съёмочный павильон
        o.material.envMapIntensity = 1.15;
      });

      const size = new THREE.Box3()
        .setFromObject(root)
        .getSize(new THREE.Vector3());

      return {
        name: MODEL_FILES[i],
        root,
        size: { w: size.x, h: size.y, depth: size.z },
      };
    });
  }

  #makeUnit(rng, project, idleKind, order) {
    let idleMap = this.barsTexture;
    let idleNoise = 0.16;

    if (idleKind === "snow") {
      idleMap = this.darkTexture;
      idleNoise = 1.0;
    } else if (idleKind === "off") {
      idleMap = this.darkTexture;
      idleNoise = 0.04;
    } else if (idleKind === "bars-noisy") {
      idleNoise = 0.55;
    }

    const material = new THREE.ShaderMaterial({
      vertexShader: SCREEN_VERT,
      fragmentShader: SCREEN_FRAG,
      uniforms: {
        uMap: { value: idleMap },
        uTime: { value: 0 },
        uFocus: { value: 0 },
        uNoise: { value: idleNoise },
        uDim: { value: 1 },
        uRes: { value: new THREE.Vector2(240, 180) },
      },
      // стекло вырезано из моделей как есть, и у одной из них
      // обход треугольников вывернут — рисуем с обеих сторон
      side: THREE.DoubleSide,
    });

    const group = cloneUnitBody(this.models, rng, material, order);

    return {
      group,
      material,
      screen: group.getObjectByName(SCREEN_NAME),
      pick: group.userData.pick,
      project: project || null,
      index: -1,
      idleMap,
      idleNoise,
    };
  }

  #buildWall() {
    const rng = seeded(20260919);

    // Гора собирается первой: массовка потом обходит её как
    // препятствие, иначе задние аппараты влезают в проекты.
    this.#buildStack(rng);
    this.#buildLogo();
    this.#buildBackHeap(rng);

    this.#frameStack(true);
  }

  /* Задний план: невнятная куча аппаратов. Отдельные силуэты
     разбирать не нужно — это фактура, а не товар.

     Ставим не поштучно вразброс, а столбиками, и место под
     столбик подбираем отбором: кандидат отвергается, если его
     след на полу задевает уже поставленный или саму гору. Внутри
     столбика аппараты садятся крышка в крышку. Раньше позиции
     брались случайно, и половина массовки стояла друг в друге. */
  #buildBackHeap(rng) {
    const COLUMNS = 18;
    const GAP = 0.05;

    // гора с проектами — первое препятствие в списке
    const stack = new THREE.Box3();
    this.slots.forEach((u) => stack.expandByObject(u.group));
    const placed = [
      {
        x: (stack.min.x + stack.max.x) / 2,
        z: (stack.min.z + stack.max.z) / 2,
        halfW: (stack.max.x - stack.min.x) / 2,
        halfD: (stack.max.z - stack.min.z) / 2,
      },
    ];

    let guard = 900;
    while (placed.length < COLUMNS + 1 && guard-- > 0) {
      const protoIndex = Math.floor(rng() * this.models.length);
      const proto = this.models[protoIndex];
      const k = 0.5 + rng() * 0.32;
      const yaw = (rng() - 0.5) * 1.2;

      // повёрнутый корпус занимает на полу больше места, чем
      // его ширина, — след считаем по габаритам после поворота
      const w = proto.size.w * k;
      const d = proto.size.depth * k;
      const ct = Math.abs(Math.cos(yaw));
      const st = Math.abs(Math.sin(yaw));
      const halfW = (w * ct + d * st) / 2;
      const halfD = (w * st + d * ct) / 2;

      const x = (rng() - 0.5) * 9.4;
      const z = -5.2 + rng() * 4.4;

      const clash = placed.some(
        (o) =>
          Math.abs(o.x - x) < o.halfW + halfW + GAP &&
          Math.abs(o.z - z) < o.halfD + halfD + GAP
      );
      if (clash) continue;

      // ближе к середине столбики выше — получается куча, а не шеренга
      const middle = Math.max(0, 1 - Math.abs(x) / 4.8);
      const tall = 1 + Math.floor(rng() * (middle > 0.5 ? 3 : 2));
      placed.push({ x, z, halfW, halfD, protoIndex, k, yaw, tall });
    }

    placed.slice(1).forEach((col) => {
      let y = 0;
      for (let n = 0; n < col.tall; n++) {
        const roll = rng();
        const kind = roll < 0.55 ? "off" : roll < 0.85 ? "snow" : "bars-noisy";
        const unit = this.#makeUnit(rng, null, kind, col.protoIndex);

        unit.group.scale.setScalar(col.k);
        const h = unit.group.userData.size.h * col.k;

        unit.group.position.set(
          col.x + (rng() - 0.5) * 0.04,
          y,
          col.z + (rng() - 0.5) * 0.04
        );
        unit.group.rotation.set(0, col.yaw + (rng() - 0.5) * 0.07, 0);
        y += h; // следующий садится ровно на крышку нижнего

        // задний план приглушаем, чтобы он не спорил с проектами
        unit.material.uniforms.uDim.value = 0.5;
        unit.baseDim = 0.5;
        setShadow(unit.group, true, true);

        this.units.push(unit);
        this.scene.add(unit.group);
      }
    });
  }

  /* Вывеска над кучей — как над стеллажами в магазине.

     Большой её сделать нельзя, и дело не во вкусе: с камеры
     силуэт горы перекрывает задник вдвое шире себя самого, и
     широкая вывеска показывалась бы обрубками по краям. Свободна
     ровно одна полоса — над макушкой. Там вывеска и висит.

     Высоту берём от самой горы, а не числом: станет рядом
     больше или меньше — вывеска переедет сама. */
  #buildLogo() {
    // 2048 px в webp: исходный png весит 9 МБ — больше, чем все
    // четыре модели вместе, а на плоскости это всё равно не видно.
    const tex = new THREE.TextureLoader().load("./assets/logo.webp");
    tex.colorSpace = THREE.SRGBColorSpace;

    const h = 0.95;
    const w = h / (730 / 2048);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        map: tex,
        // Вывеска светлая и глянцевая: в полную силу она перетягивает
        // внимание с экранов, ради которых всё и затевалось.
        color: 0x9aa3ae,
        transparent: true,
        depthWrite: false,
      })
    );
    sign.position.set(0.4, (this.stackTop || 2.7) + 1.72, -7.2);
    sign.renderOrder = 1;
    this.scene.add(sign);
    this.logo = sign;

    const wash = new THREE.PointLight(0xbcd2e8, 5, 9, 1.5);
    wash.position.set(0.4, sign.position.y - 0.2, -4.6);
    this.scene.add(wash);
  }

  /* Проекты сложены горой, как товар на распродаже:
     широкий низ, сужающиеся ряды, ничего не надо листать. */
  #buildStack(rng) {
    const rows = [4, 3, 3]; // снизу вверх; в сумме десять проектов
    // Сдвиг ряда вбок. Верхний ряд обязан уйти с середины: ровно
    // за ним стоит вывеска, и по центру он её закрывает. Заодно
    // куча перестаёт быть симметричной пирамидой.
    const ROW_SHIFT = [0, 0.14, -0.45];
    const TARGET_H = 0.92; // ровняем по высоте, иначе ряды не стыкуются

    let index = 0;
    let baseY = 0;

    rows.forEach((n, row) => {
      const built = [];

      for (let i = 0; i < n && index < this.projects.length; i++) {
        const unit = this.#makeUnit(rng, this.projects[index], "bars", index);
        unit.index = index;
        index++;

        const size = unit.group.userData.size;
        const k = (TARGET_H * (0.95 + rng() * 0.1)) / size.h;
        unit.group.scale.multiplyScalar(k);
        unit.group.userData.size = {
          w: size.w * k,
          h: size.h * k,
          depth: size.depth * k,
        };
        built.push(unit);
      }

      // ряд складываем вплотную: корпуса касаются боками,
      // тогда это читается как куча, а не как расставленные штуки
      const widths = built.map((u) => u.group.userData.size.w);
      const gap = 0.035;
      const total = widths.reduce((a, b) => a + b, 0) + gap * (built.length - 1);

      let x = -total / 2 + (ROW_SHIFT[row] || 0);
      const rowH = Math.max(...built.map((u) => u.group.userData.size.h));

      built.forEach((unit, i) => {
        const size = unit.group.userData.size;
        x += size.w / 2;

        /* Ноль у этих моделей стоит на дне корпуса, а не в его
           середине. Раньше сюда добавлялась половина высоты — и
           вся гора висела в полуметре над полом. Без теней это
           было незаметно, с тенями бросалось бы в глаза. */
        unit.group.position.set(
          x,
          baseY,
          -row * 0.3 + (rng() - 0.5) * 0.08
        );
        unit.group.rotation.set(
          (rng() - 0.5) * 0.03,
          (rng() - 0.5) * 0.22,
          (rng() - 0.5) * 0.02
        );

        x += size.w / 2 + gap;

        setShadow(unit.group, true, true);
        this.units.push(unit);
        this.slots.push(unit);
        this.scene.add(unit.group);
      });

      baseY += rowH * 0.99;
    });

    // на витринных аппаратах сразу стоит кадр работы
    this.slots.forEach((unit) => {
      const still = this.#stillFor(unit.project);
      if (!still) return;
      unit.idleMap = still.tex;
      unit.material.uniforms.uMap.value = still.tex;
    });

    this.stackTop = baseY;
  }

  /* Камера встаёт так, чтобы гора влезала в кадр целиком.
     Считать это обязательно, а не зашивать расстояние: окно у
     каждого своё, и на узком верхний аппарат срезает по макушку.
     Точка покоя от этого не перестаёт быть неподвижной — она
     просто пересчитывается при смене размера окна. */
  #frameStack(snap = false) {
    if (!this.slots.length) return;

    const box = new THREE.Box3();
    this.slots.forEach((u) => box.expandByObject(u.group));
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const MARGIN = 1.16; // воздух по краям кучи
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const dist =
      Math.max(
        (size.y * MARGIN) / 2 / Math.tan(vFov / 2),
        (size.x * MARGIN) / 2 / Math.tan(hFov / 2)
      ) + size.z / 2;

    // смотрим чуть сверху: так это куча товара, а не стенд
    this.homeLook.set(center.x, center.y, center.z);
    this.homePos.set(center.x, center.y + size.y * 0.12, center.z + dist);

    if (snap) {
      this.camPos.copy(this.homePos);
      this.camLook.copy(this.homeLook);
      this.camPosTarget.copy(this.homePos);
      this.camLookTarget.copy(this.homeLook);
    }
  }

  /* ── Видео на экране ── */

  #videoFor(project) {
    if (!project || !project.motion) return null;
    if (this.videos.has(project.media)) return this.videos.get(project.media);

    const el = document.createElement("video");
    el.muted = true;
    el.loop = true;
    el.playsInline = true;
    el.preload = "auto";
    el.crossOrigin = "anonymous";
    const canWebm = el.canPlayType('video/webm; codecs="vp9"');
    el.src = `./assets/work/${project.media}.${canWebm ? "webm" : "mp4"}`;

    const tex = new THREE.VideoTexture(el);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.flipY = false; // см. комментарий у #stillFor

    const entry = { el, tex, live: false, onLive: null };

    /* Единственный надёжный признак, что в текстуре есть картинка,
       а не чёрный прямоугольник, — браузер сам сказал, что показал
       кадр. Ни readyState, ни currentTime этого не гарантируют:
       данные могут быть загружены, воспроизведение идти, а кадры
       не выдаваться — фоновая вкладка, экономия батареи,
       заблокированный автоплей. */
    const markLive = () => {
      if (entry.live) return;
      entry.live = true;
      entry.onLive?.();
      entry.onLive = null;
    };
    if (el.requestVideoFrameCallback) el.requestVideoFrameCallback(markLive);
    else el.addEventListener("timeupdate", markLive, { once: true });

    this.videos.set(project.media, entry);
    return entry;
  }

  #stillFor(project) {
    if (!project) return null;
    const key = `still:${project.media}`;
    if (this.videos.has(key)) return this.videos.get(key);
    const tex = new THREE.TextureLoader().load(
      `./assets/work/${project.media}.jpg`
    );
    tex.colorSpace = THREE.SRGBColorSpace;
    /* Развёртка стекла приехала из glTF, где ноль по V — ВЕРХ
       картинки. TextureLoader же по умолчанию переворачивает
       изображение под обратное соглашение. Без этой строки все
       работы висят на экранах вверх ногами. */
    tex.flipY = false;
    const entry = { tex };
    this.videos.set(key, entry);
    return entry;
  }

  /* ── Взаимодействие ── */

  #initInput() {
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    // Витрина неподвижна: ничего не листаем, вся гора видна сразу.
    // От курсора камера лишь чуть отклоняется — чтобы кадр был живым.
    this.parallax = new THREE.Vector2();

    const move = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.parallax.set(this.pointer.x, this.pointer.y);
      if (!this.focused) this.#hover();
    };

    this.canvas.addEventListener("pointermove", move);
    this.canvas.addEventListener("click", () => this.#pick());
    this.canvas.addEventListener("pointerleave", () => {
      this.parallax.set(0, 0);
      this.hovered = null;
      this.canvas.style.cursor = "default";
    });

    this.onKeyBound = (e) => {
      if (e.key === "Escape" && this.focused) this.blur();
    };
    window.addEventListener("keydown", this.onKeyBound);
  }

  #hover() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const unit = this.#hit();
    if (unit === this.hovered) return;
    this.hovered = unit;
    this.canvas.style.cursor = unit ? "pointer" : "grab";
  }

  /* Ближайший аппарат под курсором — или null. */
  #hit() {
    const hits = this.raycaster.intersectObjects(
      this.slots.map((u) => u.pick),
      false
    );
    if (!hits.length) return null;
    return this.slots.find((u) => u.pick === hits[0].object) || null;
  }

  #pick() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const unit = this.#hit();
    if (unit) this.focus(unit);
    else if (this.focused) this.blur();
  }

  focus(unit) {
    if (this.focused === unit) return;
    if (this.focused) this.#sleep(this.focused);

    this.focused = unit;

    /* Целимся в центр стекла, а не в начало координат группы:
       у моделей ноль стоит на полу, и камера, наведённая туда,
       выкидывает аппарат за верх кадра. */
    const world = new THREE.Box3()
      .setFromObject(unit.screen || unit.group)
      .getCenter(new THREE.Vector3());

    // расстояние — от размера аппарата, чтобы корпус влезал целиком
    const size = unit.group.userData.size;
    const dist = Math.max(FOCUS_MIN, size.h * 2.25);

    // сдвигаем камеру вправо: телик уходит в левую часть кадра,
    // справа освобождается место под карточку проекта
    const halfH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * dist;
    const shift = halfH * this.camera.aspect * 0.34;

    this.camPosTarget.set(world.x + shift, world.y, world.z + dist);
    this.camLookTarget.set(world.x + shift, world.y, world.z);

    // стоп-кадр показываем сразу, движение подхватываем, когда догрузится
    const still = this.#stillFor(unit.project);
    if (still) unit.material.uniforms.uMap.value = still.tex;
    unit.material.uniforms.uNoise.value = 0.12;

    const video = this.#videoFor(unit.project);
    if (video) {
      const show = () => {
        if (this.focused === unit) unit.material.uniforms.uMap.value = video.tex;
      };
      if (video.live) show();
      else video.onLive = show; // до первого кадра висит стоп-кадр
      const p = video.el.play();
      if (p && p.catch) p.catch(() => {});
    }

    this.handlers.onFocus?.(unit.project, unit.index);
  }

  blur() {
    if (!this.focused) return;
    this.canvas.style.cursor = "grab";
    this.#sleep(this.focused);
    this.focused = null;
    this.camPosTarget.copy(this.homePos);
    this.camLookTarget.copy(this.homeLook);
    this.handlers.onBlur?.();
  }

  #sleep(unit) {
    const entry = this.videos.get(unit.project?.media);
    if (entry?.el) entry.el.pause();
    unit.material.uniforms.uMap.value = unit.idleMap;
    unit.material.uniforms.uNoise.value = unit.idleNoise;
  }

  /* Видео крутится только у ближайших аппаратов: восемь одновременных
     потоков десктоп потянет, но греть видеокарту ради дальнего угла незачем. */
  #updatePlayback() {
    const cam = this.camera.position;
    const ranked = this.slots
      .filter((u) => u.project?.motion && u !== this.focused)
      .map((u) => {
        const p = new THREE.Vector3();
        u.group.getWorldPosition(p);
        return { u, d: p.distanceTo(cam) };
      })
      .sort((a, b) => a.d - b.d);

    ranked.forEach(({ u, d }, i) => {
      const entry = this.#videoFor(u.project);
      if (!entry) return;
      const shouldPlay = i < 3 && d < 7 && !this.focused;

      if (shouldPlay) {
        if (entry.el.paused) {
          const p = entry.el.play();
          if (p && p.catch) p.catch(() => {});
        }
        /* Переключаемся на видео только когда оно реально поехало.
           readyState тут не показатель: браузер может отдать данные
           и не пустить воспроизведение — автоплей заблокирован,
           вкладка в фоне, экономия батареи. Пустая VideoTexture
           рисуется чёрным прямоугольником, и вместо работы на
           экране дырка. Стоп-кадр честнее. */
        const want = entry.live ? entry.tex : u.idleMap;
        if (u.material.uniforms.uMap.value !== want) {
          u.material.uniforms.uMap.value = want;
        }
      } else {
        if (!entry.el.paused) entry.el.pause();
        if (u.material.uniforms.uMap.value === entry.tex) {
          u.material.uniforms.uMap.value = u.idleMap;
        }
      }
    });
  }

  /* ── Кадр ── */

  /* Один кадр по требованию — нужен, когда rAF не идёт
     (скрытая вкладка, снятие превью). */
  renderOnce() {
    this.#tick();
  }

  #tick() {
    if (this.disposed) return;
    const t = this.clock.getElapsedTime();

    if (!this.focused) {
      // Камера стоит на месте. За курсором идёт только взгляд,
      // и то чуть-чуть — чтобы кадр не был мёртвым, но не уплывал.
      this.camPosTarget.copy(this.homePos);
      this.camLookTarget.set(
        this.homeLook.x + this.parallax.x * 0.13,
        this.homeLook.y + this.parallax.y * 0.05,
        this.homeLook.z
      );
    }

    this.camPos.lerp(this.camPosTarget, 0.07);
    this.camLook.lerp(this.camLookTarget, 0.07);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    this.units.forEach((u) => {
      u.material.uniforms.uTime.value = t;
      // под курсором аппарат подсвечивается — видно, что он кликабельный
      const want = u === this.focused ? 1 : u === this.hovered ? 0.42 : 0;
      const cur = u.material.uniforms.uFocus.value;
      u.material.uniforms.uFocus.value = cur + (want - cur) * 0.12;

      const base = u.baseDim ?? 1;
      const wantDim = !this.focused ? base : u === this.focused ? 1 : base * 0.4;
      const curDim = u.material.uniforms.uDim.value;
      u.material.uniforms.uDim.value = curDim + (wantDim - curDim) * 0.12;
    });

    this.frame = (this.frame || 0) + 1;
    if (this.frame % 20 === 0) this.#updatePlayback();

    this.renderer.render(this.scene, this.camera);
  }

  #onResize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // окно поменяли — точку покоя пересчитываем под новый кадр
    if (!this.focused) this.#frameStack();
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener("resize", this.onResizeBound);
    window.removeEventListener("keydown", this.onKeyBound);
    this.videos.forEach((v) => {
      v.el?.pause();
      v.tex?.dispose();
    });
    this.scene.traverse((o) => {
      o.geometry?.dispose?.();
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material?.dispose?.();
    });
    this.envTarget?.dispose();
    this.renderer.dispose();
  }
}
