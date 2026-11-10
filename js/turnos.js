// Turnos: horas de cierre configurables desde /panel (colección "ajustes", documento "general").
// Un equipo retirado debe devolverse antes del primer cierre de turno posterior al retiro (+ tolerancia).
export const AJUSTES_DEFECTO = { cierres: ["07:00", "19:00"], toleranciaMin: 30 };

export function leerAjustes(m) {
  const g = (m && m.general) || {};
  const cierres = (Array.isArray(g.cierres) ? g.cierres : AJUSTES_DEFECTO.cierres).filter((c) => /^\d{1,2}:\d{2}$/.test(c));
  return { cierres: [...new Set(cierres)].sort(), toleranciaMin: Number.isFinite(g.toleranciaMin) ? g.toleranciaMin : AJUSTES_DEFECTO.toleranciaMin };
}

// primer cierre estrictamente posterior a ts
export function cierreSiguiente(ts, aj) {
  if (!ts || !aj.cierres.length) return null;
  const base = new Date(ts);
  let mejor = null;
  for (let d = 0; d <= 1; d++) {
    for (const c of aj.cierres) {
      const [h, m] = c.split(":").map(Number);
      const t = new Date(base.getFullYear(), base.getMonth(), base.getDate() + d, h, m, 0, 0).getTime();
      if (t > ts && (mejor === null || t < mejor)) mejor = t;
    }
  }
  return mejor;
}

// límite de devolución = cierre del turno + tolerancia
export function limiteDevolucion(ts, aj) {
  const c = cierreSiguiente(ts, aj);
  return c === null ? null : c + aj.toleranciaMin * 60000;
}

export function vencido(e, aj, ahora = Date.now()) {
  if (!e || e.estado !== "en_uso") return false;
  const l = limiteDevolucion(e.desde, aj);
  return l !== null && ahora > l;
}

export const horaCorta = (ts) => new Date(ts).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false });
