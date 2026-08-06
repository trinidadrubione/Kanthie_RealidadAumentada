/*
 * ar-hand.js
 * -----------------------------------------------------------------------------
 * Motor de "prueba en la mano" con detección de mano en tiempo real.
 *
 * Arquitectura:
 *   1. Cámara (frontal o trasera) vía getUserMedia -> <video>.
 *   2. MediaPipe HandLandmarker detecta 21 puntos por mano en cada frame.
 *   3. Three.js renderiza el .glb del anillo, anclado en el dedo y la posición
 *      elegidos (anillo normal en la base del dedo, o midi en la falange media),
 *      superpuesto sobre el video.
 *
 * Se usa una cámara ortográfica en espacio de píxeles (Y hacia arriba): la
 * posición y la escala se calculan con los puntos 2D de la mano, y la
 * orientación es 3D (usa la profundidad de los landmarks) para que el anillo se
 * incline con el dedo. Todo en un único espacio coherente.
 *
 * Los materiales metálicos (oro/plata) se iluminan con un mapa de entorno
 * (RoomEnvironment); sin él, el PBR metálico se vería negro.
 *
 * El módulo es autónomo y tolerante a fallos: si la cámara o el modelo de mano
 * no cargan, expone el error para que la UI ofrezca una alternativa.
 * -----------------------------------------------------------------------------
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  HandLandmarker,
  FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

const WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const HAND_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

// Landmarks de referencia de la palma (para calcular el "dorso" de la mano).
const WRIST = 0, INDEX_MCP = 5, PINKY_MCP = 17;

// Cuánto influye la profundidad (z de MediaPipe) en la inclinación 3D del
// anillo. 1 = tal cual; valores menores suavizan la inclinación.
const DEPTH_SCALE = 0.9;

// Índices de landmarks de MediaPipe por dedo (MCP = nudillo, PIP = falange
// media, DIP = falange distal, TIP = punta).
const FINGER_JOINTS = {
  index:  { mcp: 5,  pip: 6,  dip: 7,  tip: 8,  neighbor: 9 },
  middle: { mcp: 9,  pip: 10, dip: 11, tip: 12, neighbor: 13 },
  ring:   { mcp: 13, pip: 14, dip: 15, tip: 16, neighbor: 17 },
  pinky:  { mcp: 17, pip: 18, dip: 19, tip: 20, neighbor: 13 },
  thumb:  { mcp: 2,  pip: 3,  dip: 4,  tip: 4,  neighbor: 5 },
};

// Utilidad: interpolación lineal.
const lerp = (a, b, t) => a + (b - a) * t;

export class HandAR {
  /**
   * @param {Object} opts
   * @param {HTMLVideoElement} opts.video   - elemento de video (cámara).
   * @param {HTMLCanvasElement} opts.canvas - canvas del overlay 3D.
   */
  constructor({ video, canvas }) {
    this.video = video;
    this.canvas = canvas;

    this.handLandmarker = null;
    this.stream = null;
    this.facingMode = "environment"; // por defecto cámara trasera
    this.running = false;
    this._raf = null;
    this._lastVideoTime = -1;

    // Selección actual.
    this.finger = "ring";     // dedo objetivo
    this.placement = "base";  // 'base' (anillo normal) | 'midi' (falange media)
    this.arConfig = { scale: 1, rotation: [0, 0, 0], offset: [0, 0, 0], holeAxis: "y" };

    // Estado de suavizado (para evitar tembleque frame a frame).
    this._smooth = {
      pos: new THREE.Vector3(),
      scale: 1,
      quat: new THREE.Quaternion(),
      baseQuat: new THREE.Quaternion(),
      fingerR: 20,
      init: false,
    };

    this._initThree();
  }

  /* ---------------------------------------------------------------------- */
  /* Three.js                                                                */
  /* ---------------------------------------------------------------------- */
  _initThree() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.55; // más brillo para que el metal se vea claro

    this.scene = new THREE.Scene();

    // Mapa de entorno: imprescindible para que los materiales metálicos
    // (oro/plata) reflejen y se vean con su color real. Sin esto, el PBR
    // metálico se renderiza negro.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    // Cámara ortográfica en espacio de píxeles con Y hacia ARRIBA (estándar de
    // three, cross-products correctos). Se dimensiona en _resize().
    this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, -2000, 2000);

    // Luz de apoyo suave + un realce especular para que el metal "brille".
    const hemi = new THREE.HemisphereLight(0xffffff, 0x555555, 0.5);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(1, 2, 3);
    this.scene.add(key);
    const spark = new THREE.DirectionalLight(0xfff6e8, 0.7);
    spark.position.set(-1.5, 1, 2);
    this.scene.add(spark);

    // Oclusor de dedo: un cilindro invisible que SOLO escribe profundidad (no
    // color). Al ubicarlo sobre el dedo, "tapa" la mitad trasera del anillo,
    // logrando que se vea realmente puesto (envolviendo el dedo) y no pegado
    // como una calcomanía. Se agrega ANTES del anillo para que escriba el
    // depth-buffer primero.
    const occMat = new THREE.MeshBasicMaterial({ colorWrite: false });
    this.occluder = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1, 1, 28, 1, true),
      occMat
    );
    this.occluder.renderOrder = 0;
    this.occluder.visible = false;
    this.scene.add(this.occluder);

    // Contenedor del modelo del anillo (pivote controlado por nosotros).
    this.ringPivot = new THREE.Group();
    this.ringPivot.renderOrder = 1;
    this.ringPivot.visible = false;
    this.scene.add(this.ringPivot);

    this.ringModel = null;     // el .glb cargado
    this._modelHalfSize = 0.5; // radio aproximado del modelo para normalizar escala

    this._resize();
    window.addEventListener("resize", () => this._resize());
  }

  _resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.left = 0;
    this.camera.right = w;
    this.camera.top = h;      // Y hacia arriba (0 abajo, h arriba)
    this.camera.bottom = 0;
    this.camera.updateProjectionMatrix();
    this._cssW = w;
    this._cssH = h;
  }

  /* ---------------------------------------------------------------------- */
  /* Carga del detector de mano                                              */
  /* ---------------------------------------------------------------------- */
  async loadDetector() {
    if (this.handLandmarker) return;
    const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
    this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: HAND_MODEL, delegate: "GPU" },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  }

  /* ---------------------------------------------------------------------- */
  /* Cámara                                                                  */
  /* ---------------------------------------------------------------------- */
  async startCamera(facingMode = this.facingMode) {
    this.facingMode = facingMode;
    if (this.stream) this._stopStream();

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    this.video.srcObject = this.stream;
    // La cámara frontal se espeja para que se sienta como un espejo.
    this.video.classList.toggle("mirrored", facingMode === "user");
    this._mirrored = facingMode === "user";

    await this.video.play();
    await new Promise((res) => {
      if (this.video.readyState >= 2) return res();
      this.video.onloadeddata = () => res();
    });
    this._resize();
  }

  async flipCamera() {
    const next = this.facingMode === "user" ? "environment" : "user";
    await this.startCamera(next);
  }

  _stopStream() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Carga del modelo del anillo                                             */
  /* ---------------------------------------------------------------------- */
  async loadRing(src, arConfig) {
    this.arConfig = { ...this.arConfig, ...(arConfig || {}) };

    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(src);
    const model = gltf.scene;

    // Normalizamos el modelo: centrado en el origen y con el eje del agujero
    // alineado a +Y local, para poder orientarlo de forma uniforme sin importar
    // cómo se exportó cada .glb.
    this._normalizeModel(model, this.arConfig.holeAxis);

    if (this.ringModel) this.ringPivot.remove(this.ringModel);
    this.ringModel = model;
    this.ringPivot.add(model);
  }

  _normalizeModel(model, holeAxis) {
    // Rotamos el modelo para que su "eje de agujero" quede en +Y local.
    if (holeAxis === "x") model.rotation.z = Math.PI / 2;
    else if (holeAxis === "z") model.rotation.x = Math.PI / 2;

    model.updateMatrixWorld(true);

    // Centrado y medición de tamaño.
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    model.position.sub(center);

    // Radio aproximado en el plano perpendicular al eje del agujero (X-Z tras
    // normalizar), usado para escalar el anillo al ancho del dedo.
    this._modelHalfSize = Math.max(size.x, size.z) / 2 || 0.5;

    // Aplicamos la corrección de orientación por-modelo (grados -> rad).
    const [rx, ry, rz] = this.arConfig.rotation.map((d) => (d * Math.PI) / 180);
    this._modelRotOffset = new THREE.Euler(rx, ry, rz, "XYZ");
  }

  /* ---------------------------------------------------------------------- */
  /* Selección de dedo / posición                                            */
  /* ---------------------------------------------------------------------- */
  setFinger(finger) { this.finger = finger; this._smooth.init = false; }
  setPlacement(placement) { this.placement = placement; this._smooth.init = false; }

  /* ---------------------------------------------------------------------- */
  /* Loop principal                                                          */
  /* ---------------------------------------------------------------------- */
  start() {
    if (this.running) return;
    this.running = true;
    this._loop();
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
    this._stopStream();
  }

  _loop() {
    if (!this.running) return;
    this._raf = requestAnimationFrame(() => this._loop());

    const video = this.video;
    if (!this.handLandmarker || video.readyState < 2) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    let results = null;
    if (video.currentTime !== this._lastVideoTime) {
      this._lastVideoTime = video.currentTime;
      try {
        results = this.handLandmarker.detectForVideo(video, performance.now());
      } catch (_) {
        results = null;
      }
      this._latest = results;
    } else {
      results = this._latest;
    }

    this._updateRing(results);
    this.renderer.render(this.scene, this.camera);
  }

  /* ---------------------------------------------------------------------- */
  /* Posicionamiento del anillo a partir de los landmarks                    */
  /* ---------------------------------------------------------------------- */
  _updateRing(results) {
    const hasHand =
      results && results.landmarks && results.landmarks.length > 0 && this.ringModel;

    if (!hasHand) {
      this.ringPivot.visible = false;
      this.occluder.visible = false;
      if (typeof this.onHand === "function") this.onHand(false);
      return;
    }

    // Elegimos la primera mano detectada.
    const lm = results.landmarks[0]; // normalizados [0..1] (imagen)
    this._lm = lm;
    const joints = FINGER_JOINTS[this.finger];

    // --- POSICIÓN (en píxeles de pantalla) ---
    // Segmento del dedo según la colocación: base (normal) o midi.
    let a, b, t;
    if (this.placement === "midi") {
      a = joints.pip; b = joints.dip; t = 0.5;
    } else {
      a = joints.mcp; b = joints.pip; t = 0.42;
    }
    const pa = this._toScreen(lm[a]);
    const pb = this._toScreen(lm[b]);
    const px = lerp(pa.x, pb.x, t);
    const py = lerp(pa.y, pb.y, t);

    // --- ESCALA (ancho del dedo en píxeles) ---
    // Estimamos el ancho del dedo con la distancia al nudillo vecino.
    const pn = this._toScreen(lm[joints.neighbor]);
    const pm = this._toScreen(lm[joints.mcp]);
    let fingerWidthPx = Math.hypot(pn.x - pm.x, pn.y - pm.y) * 0.72;
    if (this.finger === "thumb") fingerWidthPx *= 1.15;
    fingerWidthPx = Math.max(fingerWidthPx, 12);

    // Escala del modelo: el diámetro del anillo ≈ ancho del dedo.
    const targetScale =
      (fingerWidthPx / (this._modelHalfSize * 2)) * (this.arConfig.scale || 1);

    // --- ORIENTACIÓN 3D (desde los puntos de la mano, con profundidad) ---
    // El eje del agujero sigue la dirección del dedo y el engarce apunta según
    // el dorso de la mano, así el anillo se INCLINA en 3D con el dedo (realista).
    const baseQuat = this._computeBasis3D(joints, this.placement);
    const quat = baseQuat.clone();
    if (this._modelRotOffset) {
      quat.multiply(new THREE.Quaternion().setFromEuler(this._modelRotOffset));
    }

    // Offset fino en unidades de ancho de dedo (x lateral, y a lo largo).
    const [ox, oy] = this.arConfig.offset;
    const dirx = pb.x - pa.x, diry = pb.y - pa.y;
    const dlen = Math.hypot(dirx, diry) || 1;
    const finalX = px + (dirx / dlen) * oy * fingerWidthPx + (-diry / dlen) * ox * fingerWidthPx;
    const finalY = py + (diry / dlen) * oy * fingerWidthPx + (dirx / dlen) * ox * fingerWidthPx;

    // --- SUAVIZADO ---
    // La cámara tiene Y hacia arriba; los píxeles se miden desde arriba: Y -> h-Y.
    const targetPos = new THREE.Vector3(finalX, this._cssH - finalY, 0);
    const s = this._smooth;
    if (!s.init) {
      s.pos.copy(targetPos);
      s.scale = targetScale;
      s.quat.copy(quat);
      s.baseQuat.copy(baseQuat);
      s.fingerR = fingerWidthPx / 2;
      s.init = true;
    } else {
      s.pos.lerp(targetPos, 0.35);
      s.scale = lerp(s.scale, targetScale, 0.35);
      s.quat.slerp(quat, 0.35);
      s.baseQuat.slerp(baseQuat, 0.35);
      s.fingerR = lerp(s.fingerR, fingerWidthPx / 2, 0.35);
    }

    this.ringPivot.position.copy(s.pos);
    this.ringPivot.scale.setScalar(s.scale);
    this.ringPivot.quaternion.copy(s.quat);
    this.ringPivot.visible = true;

    // Oclusor de dedo: cilindro alineado al dedo, un poco más fino que el aro,
    // y largo para cubrir la falange. Oculta la parte del anillo que queda por
    // detrás del dedo.
    // Radio del oclusor ≈ radio del dedo (apenas menor para no asomar por el
    // frente del agujero). Oculta la parte del anillo que queda detrás del dedo.
    const rFinger = s.fingerR * 0.9;
    this.occluder.position.copy(s.pos);
    this.occluder.quaternion.copy(s.baseQuat);
    this.occluder.scale.set(rFinger, s.fingerR * 5.2, rFinger);
    this.occluder.visible = true;

    if (typeof this.onHand === "function") this.onHand(true);
  }

  /*
   * Orientación 3D del anillo. Construye una base ortonormal en el espacio de la
   * cámara (píxeles, Y arriba, Z hacia el espectador), usando la profundidad de
   * los landmarks para inclinar el anillo con el dedo:
   *   - yAxis: dirección 3D del dedo = eje del agujero del anillo.
   *   - zAxis: normal del dorso de la mano = hacia dónde apunta el engarce.
   *   - xAxis: perpendicular a ambas.
   * Devuelve el cuaternión de la BASE (sin corrección por-modelo); el oclusor lo
   * usa tal cual y el anillo le suma la corrección del .glb.
   */
  _computeBasis3D(joints, placement) {
    const P = (i) => this._toScreen3D(this._lm[i]);
    const a = placement === "midi" ? P(joints.pip) : P(joints.mcp);
    const b = placement === "midi" ? P(joints.dip) : P(joints.pip);

    let yAxis = b.clone().sub(a);
    if (yAxis.lengthSq() < 1e-9) yAxis.set(0, 1, 0);
    yAxis.normalize();

    // Normal del dorso de la mano (hacia dónde apunta el engarce).
    const wrist = P(WRIST), idx = P(INDEX_MCP), pky = P(PINKY_MCP);
    let up = new THREE.Vector3().crossVectors(
      idx.clone().sub(wrist),
      pky.clone().sub(wrist)
    );
    if (this._mirrored) up.multiplyScalar(-1); // el espejo invierte el sentido
    if (up.lengthSq() < 1e-9) up.set(0, 0, 1);
    up.normalize();
    if (up.z < 0) up.multiplyScalar(-1); // que mire hacia la cámara

    // zAxis = componente de 'up' perpendicular al eje del dedo.
    let zAxis = up.clone().addScaledVector(yAxis, -up.dot(yAxis));
    if (zAxis.lengthSq() < 1e-9) zAxis.set(0, 0, 1);
    zAxis.normalize();
    let xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
    if (xAxis.lengthSq() < 1e-9) xAxis.set(1, 0, 0);
    zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();

    const m = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
    return new THREE.Quaternion().setFromRotationMatrix(m);
  }

  /*
   * Punto 3D de un landmark en espacio de pantalla (píxeles, Y arriba, Z hacia
   * el espectador). Usa _toScreen para (x,y) y la profundidad z de MediaPipe.
   */
  _toScreen3D(p) {
    const s = this._toScreen(p);
    const vw = this.video.videoWidth || 1280;
    const vh = this.video.videoHeight || 720;
    const scale = Math.max(this._cssW / vw, this._cssH / vh);
    const dw = vw * scale; // píxeles por unidad normalizada en x
    // z menor = más cerca de la cámara = +Z hacia el espectador.
    const zc = -(p.z || 0) * dw * DEPTH_SCALE;
    return new THREE.Vector3(s.x, this._cssH - s.y, zc);
  }

  /*
   * Convierte un landmark normalizado (x,y en [0..1] respecto del frame de la
   * cámara) a píxeles del canvas, respetando "object-fit: cover" del video y el
   * espejado de la cámara frontal.
   */
  _toScreen(p) {
    const vw = this.video.videoWidth || 1280;
    const vh = this.video.videoHeight || 720;
    const cw = this._cssW;
    const ch = this._cssH;

    // Escala tipo "cover": el video llena el canvas recortando el excedente.
    const scale = Math.max(cw / vw, ch / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    const offX = (cw - dw) / 2;
    const offY = (ch - dh) / 2;

    let x = p.x * dw + offX;
    const y = p.y * dh + offY;
    if (this._mirrored) x = cw - x; // espejo para cámara frontal
    return { x, y };
  }
}
