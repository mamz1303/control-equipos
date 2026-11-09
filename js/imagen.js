// Comprime una foto del celular a ~N KB (JPEG) y la devuelve como dataURL.
export async function comprimirFoto(file, objetivoKB = 100, ladoMax = 1280) {
  const bmp = await cargar(file);
  const objetivo = objetivoKB * 1024;
  let lado = ladoMax;
  let mejor = null;

  for (let intento = 0; intento < 6; intento++) {
    const esc = Math.min(1, lado / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * esc), h = Math.round(bmp.height * esc);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.drawImage(bmp, 0, 0, w, h);

    // búsqueda binaria de calidad para acercarse al peso objetivo
    let lo = 0.35, hi = 0.92, url = null;
    for (let i = 0; i < 7; i++) {
      const q = (lo + hi) / 2;
      const u = c.toDataURL("image/jpeg", q);
      if (bytes(u) <= objetivo) { url = u; lo = q; } else { hi = q; }
    }
    if (url) { mejor = url; break; }
    mejor = c.toDataURL("image/jpeg", 0.35);
    lado = Math.round(lado * 0.75); // reducir resolución y reintentar
  }
  if (bmp.close) bmp.close();
  return { dataUrl: mejor, kb: Math.round(bytes(mejor) / 1024) };
}

function bytes(dataUrl) {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.floor(b64.length * 3 / 4);
}

async function cargar(file) {
  if ("createImageBitmap" in window) {
    try { return await createImageBitmap(file, { imageOrientation: "from-image" }); } catch {}
  }
  return await new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}
