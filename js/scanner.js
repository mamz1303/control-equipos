// Lector de QR con la cámara trasera.
// Usa BarcodeDetector (Chrome Android) y, si no existe, jsQR desde CDN.
const JSQR = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
let jsqrCargado = null;

function cargarJsQR() {
  if (window.jsQR) return Promise.resolve();
  if (!jsqrCargado) {
    jsqrCargado = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = JSQR; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  return jsqrCargado;
}

export function escanearQR({ titulo = "Escanea el QR del equipo" } = {}) {
  return new Promise(async (resolve) => {
    const ov = document.createElement("div");
    ov.className = "scan-ov";
    ov.innerHTML = `
      <div class="scan-top"><span>${titulo}</span><button class="scan-x" aria-label="Cerrar">✕</button></div>
      <div class="scan-view"><video playsinline muted></video><div class="scan-marco"></div></div>
      <p class="scan-msg">Apunta al código QR pegado en el equipo</p>`;
    document.body.appendChild(ov);
    const video = ov.querySelector("video");
    const msg = ov.querySelector(".scan-msg");
    let stream = null, activo = true;

    const cerrar = (val) => {
      activo = false;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      ov.remove();
      resolve(val);
    };
    ov.querySelector(".scan-x").onclick = () => cerrar(null);

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false
      });
      video.srcObject = stream;
      await video.play();
    } catch (e) {
      msg.textContent = "No se pudo abrir la cámara. Revisa el permiso de cámara del navegador.";
      return;
    }

    let detector = null;
    if ("BarcodeDetector" in window) {
      try {
        const f = await window.BarcodeDetector.getSupportedFormats();
        if (f.includes("qr_code")) detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      } catch {}
    }
    if (!detector) {
      try { await cargarJsQR(); } catch { msg.textContent = "Sin conexión para cargar el lector. Elige el código de la lista."; return; }
    }
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const tick = async () => {
      if (!activo) return;
      if (video.readyState >= 2) {
        try {
          let texto = null;
          if (detector) {
            const r = await detector.detect(video);
            if (r.length) texto = r[0].rawValue;
          } else {
            const w = 640, h = Math.round(640 * video.videoHeight / video.videoWidth) || 480;
            canvas.width = w; canvas.height = h;
            ctx.drawImage(video, 0, 0, w, h);
            const img = ctx.getImageData(0, 0, w, h);
            const r = window.jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
            if (r) texto = r.data;
          }
          if (texto) {
            if (navigator.vibrate) navigator.vibrate(80);
            return cerrar(texto);
          }
        } catch {}
      }
      setTimeout(() => requestAnimationFrame(tick), 120);
    };
    tick();
  });
}

// Posibles códigos a partir de lo leído: URL con ?eq=..., "CV-PDA-2853", "2853" o texto libre
export function codigoDesdeQR(texto) {
  if (!texto) return [];
  const t = String(texto).trim(), c = [];
  try { const eq = new URL(t).searchParams.get("eq"); if (eq) c.push(eq.trim()); } catch {}
  c.push(t);
  const seg = t.split(/[-|/:\s]/).filter(Boolean).pop(); if (seg) c.push(seg);
  const m = t.match(/(\d{3,})(?!.*\d)/); if (m) c.push(m[1]);
  return [...new Set(c)];
}
