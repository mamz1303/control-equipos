// Catálogo vivo (tipos, personal y equipos) armado desde Firestore.
// Mientras no se haya importado desde /panel, usa los datos iniciales de config.js.
import { PERSONAL, EQUIPOS } from "./config.js";

export const TIPOS_INICIALES = [
  { clave: "PDA", nombre: "PDA", icono: "pda", orden: 1, activo: true },
  { clave: "RADIO", nombre: "Radio", icono: "radio", orden: 2, activo: true }
];

export const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
export const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const idPersona = (nombre) => "p-" + slug(nombre);
// "Radio" → "Radios", "Linterna" → "Linternas", "PDA" se mantiene
export const plural = (n) => !n ? n : (n === n.toUpperCase() ? n : /[aeiouáéíóú]$/i.test(n) ? n + "s" : n + "es");
export const nuevoId = (pref) => `${pref}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// Datos iniciales (Excel) con el mismo formato que en Firestore
export function semilla() {
  const tipos = Object.fromEntries(TIPOS_INICIALES.map((t) => [t.clave, { ...t }]));
  const personal = Object.fromEntries(PERSONAL.map((n) => [idPersona(n), { nombre: n, activo: true }]));
  const equipos = Object.fromEntries(EQUIPOS.map((e) => [e.codigo, {
    codigo: e.codigo, tipo: e.tipo, activo: true,
    asignados: e.asignados.map((n) => idPersona(n)).filter((id) => personal[id])
  }]));
  return { tipos, personal, equipos };
}

// fs = { tipos: {id: doc}, personal: {id: doc}, equipos: {id: doc} } tal como llegan de Firestore
export function construirCatalogo(fs) {
  const importado = Object.keys(fs.tipos || {}).length > 0 || Object.values(fs.equipos || {}).some((d) => d.codigo);
  const base = importado ? { tipos: fs.tipos, personal: fs.personal, equipos: {} } : semilla();

  let equiposMap;
  if (importado) {
    equiposMap = Object.fromEntries(Object.entries(fs.equipos).filter(([, d]) => d.codigo));
  } else {
    // catálogo de config.js + estado guardado en Firestore (documentos por código)
    equiposMap = Object.fromEntries(Object.entries(base.equipos).map(([id, d]) => [id, { ...d, ...(fs.equipos?.[id] || {}), codigo: d.codigo, tipo: d.tipo, asignados: d.asignados, activo: true }]));
  }

  const tipos = Object.entries(base.tipos || {}).map(([id, t]) => ({ id, clave: id, icono: "generico", activo: true, orden: 99, ...t }))
    .sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99) || a.nombre.localeCompare(b.nombre));
  const personal = Object.entries(base.personal || {}).map(([id, p]) => ({ id, activo: true, ...p }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const equipos = Object.entries(equiposMap).map(([id, e]) => ({ id, activo: true, asignados: [], ...e }))
    .sort((a, b) => {
      const ta = tipos.findIndex((t) => t.clave === a.tipo), tb = tipos.findIndex((t) => t.clave === b.tipo);
      return ta - tb || String(a.codigo).localeCompare(String(b.codigo), "es", { numeric: true });
    });

  const T = Object.fromEntries(tipos.map((t) => [t.clave, t]));
  const P = Object.fromEntries(personal.map((p) => [p.id, p]));
  const E = Object.fromEntries(equipos.map((e) => [e.id, e]));

  return {
    importado, tipos, personal, equipos,
    tipo: (c) => T[c] || { clave: c, nombre: c, icono: "generico", activo: true },
    persona: (id) => P[id] || null,
    eq: (id) => E[id] || null,
    porCodigo: (cod) => equipos.find((e) => String(e.codigo).toLowerCase() === String(cod).trim().toLowerCase() && e.activo !== false)
      || equipos.find((e) => String(e.codigo).toLowerCase() === String(cod).trim().toLowerCase()) || null,
    nombres: (ids) => (ids || []).map((id) => P[id]?.nombre).filter(Boolean),
    personaPorNombre: (n) => personal.find((p) => norm(p.nombre) === norm(n)) || null,
    tiposActivos: () => tipos.filter((t) => t.activo !== false && equipos.some((e) => e.tipo === t.clave && e.activo !== false)),
    equiposActivos: () => equipos.filter((e) => e.activo !== false)
  };
}
