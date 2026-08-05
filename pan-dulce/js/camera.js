/* ============================================================
   Cámara en vivo + selección de archivos
   ============================================================ */

const Camera = (() => {
  let stream = null;
  let facing = 'environment';   // cámara trasera por defecto
  const video = () => $('#camVideo');

  const supported = () =>
    !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  async function start() {
    if (!supported()) throw new Error('Este navegador no permite usar la cámara');
    stop();
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } },
      audio: false,
    });
    const v = video();
    v.srcObject = stream;
    // El espejo sólo tiene sentido con la cámara frontal.
    v.style.transform = facing === 'user' ? 'scaleX(-1)' : 'none';
    await v.play().catch(() => {});
    return stream;
  }

  function stop() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    const v = video();
    if (v) v.srcObject = null;
  }

  async function flip() {
    facing = facing === 'environment' ? 'user' : 'environment';
    return start();
  }

  /** Congela el frame actual y lo devuelve comprimido. */
  async function snap() {
    const v = video();
    if (!v || !v.videoWidth) throw new Error('La cámara todavía no está lista');

    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (facing === 'user') {           // desespejar antes de guardar
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, 0, 0);
    return shrinkImage(canvas);
  }

  const isOn = () => !!stream;

  return { supported, start, stop, flip, snap, isOn };
})();
