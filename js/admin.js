// Panel de control (/panel): registros, gestión de equipos, tipos, personal y etiquetas QR.
import { crearBackend } from "./backend.js";
import { construirCatalogo, semilla, norm, slug, nuevoId, plural } from "./catalogo.js";
import { icono, ICONOS_DISPONIBLES } from "./iconos.js";
import { leerAjustes, vencido, cierreSiguiente, limiteDevolucion, horaCorta } from "./turnos.js";

// SHA-256 de los códigos de acceso (no se guardan en texto plano).
// Para agregar otro: calcula su SHA-256 y súmalo a la lista.
const HASHES = [
  "50038c4168c25d0652d051885a2da56bcd99867397e5208ec295652230737316",
  "532e90d2c54c16a39bd4b77496f67c03abdfe9a20036af364245797ffd2fd2f4",
  "0175a3fb193fc70b68bdf95626fa29e61f0fde1c9ab725da8e4477c09c5081ef"
];
const SESION_HORAS = 8;
const URL_APP = new URL("../", location.href).href;   // p. ej. https://mamz1303.github.io/control-equipos/

// ------------------------------------------------------------------ utilidades
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const isoDia = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};
function toast(t, ms = 2800) {
  const el = $("#toast"); el.textContent = t; el.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (el.hidden = true), ms);
}
function cargando(txt) { $("#cargando").hidden = !txt; if (txt) $("#cargando-txt").textContent = txt; }
function dialogo(html, si = "Sí") {
  return new Promise((res) => {
    $("#dlg-txt").innerHTML = html; $("#dlg-si").textContent = si; $("#dialogo").hidden = false;
    $("#dlg-si").onclick = () => { $("#dialogo").hidden = true; res(true); };
    $("#dlg-no").onclick = () => { $("#dialogo").hidden = true; res(false); };
  });
}
const abrirHoja = (html) => { $("#hoja-cont").innerHTML = html; $("#hoja").hidden = false; $(".hoja-in").scrollTop = 0; };
const cerrarHoja = () => ($("#hoja").hidden = true);
$("#hoja .hoja-x").onclick = cerrarHoja;
$("#hoja").onclick = (e) => { if (e.target.id === "hoja") cerrarHoja(); };

// ------------------------------------------------------------------ estado
let backend = null;
const fsData = { tipos: {}, personal: {}, equipos: {} };
let cat = construirCatalogo(fsData);
let pestana = "p-res";
let aj = leerAjustes(null);
// tipos de movimiento: [clase, ícono, verbo, título, etiqueta corta]
const TMOV = { retiro: ["ret", "↑", "Retiró", "Retiro", "Retiro"], devolucion: ["dev", "↓", "Devolvió", "Devolución", "Devol."],
  revision: ["rev", "🔧", "Envió a revisión", "Enviado a revisión", "Revisión"], liberacion: ["lib", "✔", "Liberó", "Liberado (reparado)", "Liberado"] };
const tm = (m) => TMOV[m.tipo] || TMOV.devolucion;
const PILL = { ret: "uso", dev: "disp", rev: "rev", lib: "disp" };
const nombreTipo = (c) => cat.tipo(c).nombre;
const icoTipo = (c) => icono(cat.tipo(c).icono);
const asignadosTxt = (e) => cat.nombres(e.asignados).join(" / ") || "Sin asignar";

// Antes de la primera edición, copia a Firestore el catálogo inicial (Excel)
async function asegurarImportado() {
  if (cat.importado) return;
  const s = semilla(), ops = [];
  Object.entries(s.tipos).forEach(([id, d]) => ops.push({ col: "tipos", id, data: d }));
  Object.entries(s.personal).forEach(([id, d]) => ops.push({ col: "personal", id, data: { ...d, ts: Date.now() } }));
  Object.entries(s.equipos).forEach(([id, d]) => ops.push({ col: "equipos", id, data: d }));
  await backend.lote(ops);
  fsData.tipos = { ...s.tipos, ...fsData.tipos };
  cat = construirCatalogo(fsData);
}

// ------------------------------------------------------------------ acceso con código
async function sha256(t) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const sesionValida = () => { const s = LS.get("ce_admin"); return s && HASHES.includes(s.h) && s.exp > Date.now(); };
async function entrar() {
  const cod = $("#lock-cod").value.trim(); if (!cod) return;
  const h = await sha256(cod);
  if (HASHES.includes(h)) { LS.set("ce_admin", { h, exp: Date.now() + SESION_HORAS * 3600e3 }); abrirPanel(); }
  else {
    $("#lock-err").hidden = false; $("#lock-cod").value = "";
    const l = $(".lock"); l.classList.remove("shake"); void l.offsetWidth; l.classList.add("shake");
    if (navigator.vibrate) navigator.vibrate(150);
  }
}
$("#lock-ok").onclick = entrar;
$("#lock-cod").onkeydown = (e) => { if (e.key === "Enter") entrar(); };
document.addEventListener("click", (e) => { if (e.target.closest("[data-salir]")) { LS.del("ce_admin"); location.reload(); } });

$("#adm-tabs").onclick = (e) => {
  const b = e.target.closest("button"); if (!b) return;
  pestana = b.dataset.p;
  $$("#adm-tabs button").forEach((x) => x.classList.toggle("on", x === b));
  $$(".pest").forEach((p) => (p.hidden = p.id !== pestana));
  window.scrollTo(0, 0);
  renderPestana();
};
function renderPestana() {
  if (pestana === "p-res") renderResumen();
  if (pestana === "p-eq") renderEquipos();
  if (pestana === "p-per") renderPersonal();
  if (pestana === "p-qr") renderQR();
}

async function abrirPanel() {
  $("#v-lock").hidden = true; $("#v-adm").hidden = false;
  if (!backend) {
    cargando("Conectando…");
    try { backend = await crearBackend(); }
    catch (e) { cargando(null); toast("No se pudo conectar: " + (e.message || e), 6000); return; }
    backend.onColeccion("ajustes", (m) => { aj = leerAjustes(m); pintarTurnos(); if (pestana === "p-res") renderResumen(); });
    const cargadas = new Set();
    await new Promise((listo) => {
      ["tipos", "personal", "equipos"].forEach((n) => backend.onColeccion(n, (m) => {
        fsData[n] = m; cargadas.add(n); cat = construirCatalogo(fsData);
        if (cargadas.size === 3) { listo(); renderPestana(); }
      }));
    });
    cargando(null);
  }
  const hoy = new Date();
  $("#in-dia").value = isoDia(hoy);
  $("#in-mes").value = `${hoy.getFullYear()}-${pad(hoy.getMonth() + 1)}`;
  const hace7 = new Date(hoy); hace7.setDate(hoy.getDate() - 6);
  $("#in-desde").value = isoDia(hace7); $("#in-hasta").value = isoDia(hoy);
  const cfg = await backend.config();
  $("#adm-pruebas").hidden = !cfg.modoPruebas;
  consultar();
  cargarPeriodoResumen();
}

// ================================================================== REGISTROS
let modo = "dia", vista = "lista", resultados = [], periodo = null;
const fotosCache = new Map();
$("#adm-modo").onclick = (e) => {
  const b = e.target.closest("button"); if (!b) return;
  modo = b.dataset.m;
  $$("#adm-modo button").forEach((x) => x.classList.toggle("on", x === b));
  $("#f-dia").hidden = modo !== "dia"; $("#f-mes").hidden = modo !== "mes"; $("#f-rango").hidden = modo !== "rango";
};
function leerPeriodo() {
  const dia = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  if (modo === "dia") {
    if (!$("#in-dia").value) return null;
    const a = dia($("#in-dia").value), b = new Date(a); b.setDate(a.getDate() + 1);
    return { desde: a.getTime(), hasta: b.getTime(), nombre: $("#in-dia").value, texto: a.toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) };
  }
  if (modo === "mes") {
    if (!$("#in-mes").value) return null;
    const [y, m] = $("#in-mes").value.split("-").map(Number);
    const a = new Date(y, m - 1, 1), b = new Date(y, m, 1);
    return { desde: a.getTime(), hasta: b.getTime(), nombre: $("#in-mes").value, texto: a.toLocaleDateString("es-PE", { month: "long", year: "numeric" }) };
  }
  if (!$("#in-desde").value || !$("#in-hasta").value) return null;
  const a = dia($("#in-desde").value), b = dia($("#in-hasta").value); b.setDate(b.getDate() + 1);
  if (b <= a) return "orden";
  return { desde: a.getTime(), hasta: b.getTime(), nombre: `${$("#in-desde").value}_a_${$("#in-hasta").value}`, texto: `${$("#in-desde").value} al ${$("#in-hasta").value}` };
}
async function consultar() {
  const p = leerPeriodo();
  if (p === "orden") return toast("La fecha 'Hasta' debe ser igual o posterior a 'Desde'");
  if (!p) return toast("Completa la fecha");
  periodo = p;
  cargando("Consultando…");
  try { resultados = await backend.consultar(p.desde, p.hasta); }
  catch (e) { console.error(e); toast("Error al consultar: " + (e.message || e), 5000); resultados = []; }
  cargando(null);
  $("#adm-res").hidden = false;
  renderRegistros();
}
$("#adm-buscar").onclick = consultar;
$("#adm-filtro").oninput = () => renderRegistros();
$("#adm-vista").onclick = (e) => {
  const c = e.target.closest(".chip"); if (!c) return;
  vista = c.dataset.v; $$("#adm-vista .chip").forEach((x) => x.classList.toggle("on", x === c)); renderRegistros();
};
function filtrados() {
  const q = norm($("#adm-filtro").value);
  return resultados.filter((m) => !q || norm([m.usuario, ...(m.codigos || []), m.tipo, m.nota, m.danoDesc,
    ...(m.equipos || []).flatMap((i) => [nombreTipo(i.tipo), ...cat.nombres(cat.eq(i.id || i.codigo)?.asignados)])].join(" ")).includes(q));
}
const hhmm = (ts) => new Date(ts).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false });
const fechaCorta = (ts) => new Date(ts).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" });
const eqTxt = (m) => (m.equipos || []).map((i) => `${nombreTipo(i.tipo)} ${i.codigo}`).join(" · ");

function renderRegistros() {
  const lista = filtrados();
  const ret = lista.filter((m) => m.tipo === "retiro").length, dev = lista.filter((m) => m.tipo === "devolucion").length;
  const dan = lista.filter((m) => (m.danados || []).length || m.tipo === "revision").length;
  $("#adm-stats").innerHTML = `<div class="stat"><b>${ret}</b><span>Retiros</span></div>
    <div class="stat"><b>${dev}</b><span>Devoluciones</span></div><div class="stat ${dan ? "morado" : ""}"><b>${dan}</b><span>Daños</span></div>`;
  const cont = $("#adm-lista");
  if (!lista.length) { cont.innerHTML = `<p class="vacio-msg">Sin registros en ${esc(periodo?.texto || "el periodo")}</p>`; return; }
  if (vista === "fotos") {
    const conFoto = lista.filter((m) => m.fotoId);
    cont.innerHTML = conFoto.length ? `<div class="grid-fotos">${conFoto.map((m) => `<button class="gf" data-m="${esc(m.id)}">
      <img data-f="${esc(m.fotoId)}" alt=""><div><span class="tag ${tm(m)[0]}">${tm(m)[4].toUpperCase()}</span>${(m.danados || []).length ? "🔧 " : ""}${fechaCorta(m.ts)} ${hhmm(m.ts)}
      <b>${esc(m.usuario)}</b>${esc(eqTxt(m))}</div></button>`).join("")}</div>` : `<p class="vacio-msg">Sin fotos en este periodo</p>`;
  } else {
    let html = "", diaAnt = "";
    for (const m of lista) {
      const d = new Date(m.ts).toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });
      if (d !== diaAnt) { if (diaAnt) html += `</div>`; html += `<p class="dia-sep">${d}</p><div class="lista-mov">`; diaAnt = d; }
      const [cls, ico, verbo, , corto] = tm(m);
      html += `<button class="mov" data-m="${esc(m.id)}">${m.fotoId ? `<img class="th" data-f="${esc(m.fotoId)}" alt="">` : `<div class="ico ${cls}">${ico}</div>`}
        <div class="cuerpo"><div class="q">${esc(m.usuario)}</div><div class="d">${verbo} ${esc(eqTxt(m))}</div>
        ${(m.danados || []).length ? `<div class="aviso">🔧 Daño: ${esc(m.danoDesc || "")}</div>` : ""}
        ${(m.avisos || []).length ? `<div class="aviso">⚠ ${esc(m.avisos.join("; "))}</div>` : ""}</div>
        <div class="h"><span class="pill ${PILL[cls]}">${corto}</span><br>${hhmm(m.ts)}</div></button>`;
    }
    cont.innerHTML = html + "</div>";
  }
  $$("#adm-lista img[data-f]").forEach((img) => (io ? io.observe(img) : ponerFoto(img)));
}
const io = "IntersectionObserver" in window ? new IntersectionObserver((ents) => {
  ents.forEach((en) => { if (en.isIntersecting) { io.unobserve(en.target); ponerFoto(en.target); } });
}, { rootMargin: "300px" }) : null;
function foto(id) { if (!fotosCache.has(id)) fotosCache.set(id, backend.getFoto(id).catch(() => null)); return fotosCache.get(id); }
async function ponerFoto(img) { const d = await foto(img.dataset.f); if (d) img.src = d; }

$("#adm-lista").onclick = async (e) => {
  const b = e.target.closest("[data-m]"); if (!b) return;
  const m = resultados.find((x) => x.id === b.dataset.m); if (!m) return;
  abrirHoja(`<div class="det-cab"><div><h2 class="h-lg">${tm(m)[3]}</h2><span class="sub">${new Date(m.ts).toLocaleString("es-PE")}</span></div></div>
    <div class="det-tabla"><div><span>Persona</span><b>${esc(m.usuario)}</b></div>
      ${(m.equipos || []).map((i) => `<div><span>${esc(nombreTipo(i.tipo))}</span><b>${esc(i.codigo)}${i.dano ? " 🔧" : ""}</b></div>`).join("")}
      ${(m.danados || []).length ? `<div><span>Daño reportado</span><b style="color:#5B3CA8">${esc(m.danoDesc || "")}</b></div>` : ""}
      ${m.nota ? `<div><span>Observación</span><b>${esc(m.nota)}</b></div>` : ""}
      ${(m.avisos || []).length ? `<div><span>Aviso</span><b style="color:var(--rojo)">${esc(m.avisos.join("; "))}</b></div>` : ""}</div>
    ${m.fotoId ? `<img class="det-foto" id="det-foto" alt="Cargando foto…" style="max-height:none"><button class="btn btn-sec" id="det-desc" style="margin-top:8px">⬇ Descargar foto</button>` : `<p class="vacio-msg">Sin foto</p>`}`);
  if (m.fotoId) {
    const d = await foto(m.fotoId);
    if (!d) { $("#det-foto").alt = "Foto no disponible"; return; }
    $("#det-foto").src = d;
    $("#det-desc").onclick = () => descargar(d, `${new Date(m.ts).toISOString().slice(0, 16).replace(/[:T]/g, "-")}_${m.tipo}_${(m.codigos || []).join("-")}.jpg`);
  }
};
function descargar(href, nombre) {
  const a = document.createElement("a"); a.href = href; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
}

$("#adm-csv").onclick = () => {
  const lista = filtrados();
  if (!lista.length) return toast("No hay registros para exportar");
  // una columna por cada tipo de equipo que aparezca en el periodo (+ su asignado)
  const tiposUsados = [...new Set(lista.flatMap((m) => (m.equipos || []).map((i) => i.tipo)))]
    .sort((a, b) => cat.tipos.findIndex((t) => t.clave === a) - cat.tipos.findIndex((t) => t.clave === b));
  const filas = [["Fecha", "Hora", "Movimiento", "Persona", ...tiposUsados.flatMap((t) => [nombreTipo(t), `Asignado ${nombreTipo(t)}`]), "Foto", "Daño", "Observación", "Avisos"]];
  [...lista].reverse().forEach((m) => {
    const d = new Date(m.ts);
    const cols = tiposUsados.flatMap((t) => {
      const its = (m.equipos || []).filter((i) => i.tipo === t);
      return [its.map((i) => i.codigo).join(" "), its.map((i) => cat.nombres(cat.eq(i.id || i.codigo)?.asignados).join(" / ")).join(" | ")];
    });
    filas.push([d.toLocaleDateString("es-PE"), d.toLocaleTimeString("es-PE", { hour12: false }), tm(m)[3], m.usuario,
      ...cols, m.fotoId ? "Sí" : "No", (m.danados || []).length ? `${m.danados.join(" ")}: ${m.danoDesc || ""}` : "", m.nota || "", (m.avisos || []).join("; ")]);
  });
  const csv = "﻿" + filas.map((f) => f.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  descargar(url, `registros_equipos_${periodo.nombre}.csv`);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast(`CSV con ${lista.length} registros`);
};

$("#adm-borrar").onclick = async () => {
  const ok = await dialogo(`<p><b>Se borrarán TODOS los movimientos y fotos.</b> Los equipos quedarán disponibles. No se puede deshacer.</p>
    <p style="margin:0">Escribe <b>BORRAR</b> para confirmar:</p><input id="dlg-conf" class="input" autocomplete="off">`, "Borrar todo");
  if (!ok) return;
  if ($("#dlg-conf").value.trim().toUpperCase() !== "BORRAR") return toast("No se escribió BORRAR. No se borró nada.");
  cargando("Borrando…");
  try {
    const n = await backend.borrarTodo((h, t) => cargando(`Borrando… ${h} / ${t}`));
    toast(`Listo: ${n} registros borrados`, 3500);
    fotosCache.clear(); resultados = []; renderRegistros();
  } catch (e) { console.error(e); toast("No se pudo borrar. ¿Está activo modoPruebas y publicadas las reglas nuevas?", 6000); }
  cargando(null);
};

// ================================================================== EQUIPOS
let eqFiltro = "";
$("#eq-buscar").oninput = () => renderEquipos();
$("#eq-chips").onclick = (e) => { const c = e.target.closest(".chip"); if (!c) return; eqFiltro = c.dataset.v; renderEquipos(); };
$("#eq-nuevo").onclick = () => formEquipo(null);
$("#eq-tipos").onclick = () => listaTipos();

function renderEquipos() {
  const tipos = cat.tipos;
  const nRev = cat.equiposActivos().filter((e) => e.estado === "revision").length;
  $("#eq-chips").innerHTML = [["", "Todos"], ...tipos.map((t) => [t.clave, t.nombre]), ...(nRev ? [["__rev", `🔧 En revisión (${nRev})`]] : []), ["__baja", "De baja"]]
    .map(([v, n]) => `<button class="chip ${eqFiltro === v ? "on" : ""}" data-v="${esc(v)}">${esc(n)}</button>`).join("");
  const q = norm($("#eq-buscar").value);
  const lista = cat.equipos.filter((e) => {
    if (eqFiltro === "__baja") { if (e.activo !== false) return false; }
    else if (eqFiltro === "__rev") { if (e.activo === false || e.estado !== "revision") return false; }
    else { if (e.activo === false) return false; if (eqFiltro && e.tipo !== eqFiltro) return false; }
    return !q || norm([e.codigo, nombreTipo(e.tipo), ...cat.nombres(e.asignados)].join(" ")).includes(q);
  });
  $("#eq-lista").innerHTML = lista.map((e) => {
    const baja = e.activo === false, uso = e.estado === "en_uso";
    return `<button class="eq ${baja ? "baja" : e.estado === "revision" ? "rev" : vencido(e, aj) ? "largo" : uso ? "uso" : ""}" data-id="${esc(e.id)}">${icoTipo(e.tipo)}
      <div class="cuerpo"><div class="cod">${esc(e.codigo)}<small>${esc(nombreTipo(e.tipo).toUpperCase())}</small></div><div class="asig">${esc(asignadosTxt(e))}</div></div>
      <div class="estado">${baja ? `<span class="pill gris">De baja</span>` : e.estado === "revision" ? `<span class="pill rev">🔧 En revisión</span>` : uso ? `<span class="pill uso">En uso</span><div class="quien">${esc(e.usuario)}</div>` : `<span class="pill disp">Disponible</span>`}</div></button>`;
  }).join("") || `<p class="vacio-msg">Sin equipos</p>`;
}
$("#eq-lista").onclick = (e) => { const b = e.target.closest(".eq"); if (b) formEquipo(b.dataset.id); };

// selector de personas con búsqueda (checkboxes)
function selectorPersonas(seleccion, contenedor) {
  const sel = new Set(seleccion);
  contenedor.innerHTML = `<input class="input" type="search" placeholder="Buscar persona" data-ps-buscar>
    <div class="chips-sel" data-ps-chips></div><div class="lista-check" data-ps-lista></div>`;
  const pintar = () => {
    const q = norm($("[data-ps-buscar]", contenedor).value);
    $("[data-ps-chips]", contenedor).innerHTML = [...sel].map((id) => `<span>${esc(cat.persona(id)?.nombre || id)}</span>`).join("") || `<span style="background:var(--fondo);color:var(--gris)">Sin asignar</span>`;
    $("[data-ps-lista]", contenedor).innerHTML = cat.personal.filter((p) => (p.activo !== false || sel.has(p.id)) && (!q || norm(p.nombre).includes(q)))
      .map((p) => `<label><input type="checkbox" value="${esc(p.id)}" ${sel.has(p.id) ? "checked" : ""}>${esc(p.nombre)}${p.activo === false ? " <small>(de baja)</small>" : ""}</label>`).join("");
  };
  $("[data-ps-buscar]", contenedor).oninput = pintar;
  $("[data-ps-lista]", contenedor).onchange = (e) => { const c = e.target; c.checked ? sel.add(c.value) : sel.delete(c.value); pintar(); };
  pintar();
  return () => [...sel];
}

function formEquipo(id, tipoPreset = null) {
  const e = id ? cat.eq(id) : null;
  const tipoIni = tipoPreset || e?.tipo || (eqFiltro && !eqFiltro.startsWith("__") && eqFiltro) || cat.tipos[0]?.clave || "";
  const rev = e && e.estado === "revision";
  abrirHoja(`<h2 class="h-lg" style="margin-bottom:14px">${e ? `Editar ${esc(nombreTipo(e.tipo))} ${esc(e.codigo)}` : "Agregar equipo"}</h2>
    ${rev ? `<div class="rev-box"><b>🔧 En revisión</b>${esc(e.dano?.desc || "Sin descripción")}<br><small>Reportado por ${esc(e.dano?.por || "—")} · ${new Date(e.dano?.ts || e.desde).toLocaleString("es-PE")}</small>
      <textarea id="fe-lib-nota" class="input" rows="2" placeholder="Qué se hizo (opcional): reparado, cambio de batería…" style="margin-top:10px"></textarea>
      <button class="btn btn-azul" id="fe-liberar" style="margin-top:4px">✔ Liberar: reparado / disponible</button></div>` : ""}
    <div class="campo"><label class="lbl">Tipo de equipo</label>
      <select id="fe-tipo">${cat.tipos.map((t) => `<option value="${esc(t.clave)}" ${t.clave === tipoIni ? "selected" : ""}>${esc(t.nombre)}${t.activo === false ? " (oculto)" : ""}</option>`).join("")}
      <option value="__nuevo">+ Crear nuevo tipo…</option></select></div>
    <div class="campo"><label class="lbl">Código</label><input id="fe-cod" class="input" value="${esc(e?.codigo || "")}" placeholder="Ej. 2853" autocomplete="off">
      <p class="ayuda" id="fe-cod-ayuda">${e ? "Si cambias el código, el QR pegado en el equipo deja de servir: genera uno nuevo." : "Es lo que va en el QR y lo que se ve en la app."}</p></div>
    <div class="campo"><label class="lbl">Persona(s) asignada(s)</label><div id="fe-pers"></div>
      <p class="ayuda">Prioridad de uso, no exclusividad. Puede quedar sin asignar.</p></div>
    ${e ? `<label class="check-fila" style="margin:6px 0 4px"><input type="checkbox" id="fe-activo" ${e.activo !== false ? "checked" : ""}> Equipo activo <span class="ayuda" style="margin:0">(desmarcar = dar de baja)</span></label>` : ""}
    <div class="botones"><button class="btn btn-pri" id="fe-guardar">Guardar</button>
      ${e ? "" : `<button class="btn btn-sec" id="fe-otro">Guardar y agregar otro</button>`}
      ${e && e.estado !== "revision" && e.activo !== false ? `<button class="btn btn-sec" id="fe-arev" style="color:#5B3CA8">🔧 Enviar a revisión</button>` : ""}</div>`);
  if ($("#fe-liberar")) $("#fe-liberar").onclick = () => moverRevision(e, "liberacion", $("#fe-lib-nota").value.trim());
  if ($("#fe-arev")) $("#fe-arev").onclick = async () => {
    const ok = await dialogo(`<p>Enviar <b>${esc(nombreTipo(e.tipo))} ${esc(e.codigo)}</b> a revisión. No se podrá retirar hasta liberarlo.</p>
      ${e.estado === "en_uso" ? `<p style="color:var(--rojo)">Figura en uso por ${esc(e.usuario)}; se cerrará su registro.</p>` : ""}
      <textarea id="dlg-desc" class="input" rows="2" placeholder="Motivo / daño (obligatorio)" style="text-align:left;letter-spacing:0;font-weight:500"></textarea>`, "Enviar a revisión");
    if (!ok) return;
    const d = $("#dlg-desc").value.trim();
    if (d.length < 4) return toast("Escribe el motivo");
    moverRevision(e, "revision", d);
  };
  const leerPers = selectorPersonas(e?.asignados || [], $("#fe-pers"));
  $("#fe-tipo").onchange = (ev) => { if (ev.target.value === "__nuevo") { formTipo(null, (clave) => formEquipo(id, clave)); } };
  $("#fe-cod").oninput = () => {
    const c = $("#fe-cod").value.trim();
    const dup = c && cat.equipos.find((x) => x.id !== id && String(x.codigo).toLowerCase() === c.toLowerCase());
    $("#fe-cod-ayuda").className = "ayuda" + (dup ? " alerta" : "");
    if (dup) $("#fe-cod-ayuda").textContent = `Ya existe: ${nombreTipo(dup.tipo)} ${dup.codigo}${dup.activo === false ? " (de baja)" : ""}`;
  };
  const guardar = async (otro) => {
    const tipo = $("#fe-tipo").value, codigo = $("#fe-cod").value.trim().replace(/\s+/g, " ");
    if (!tipo || tipo === "__nuevo") return toast("Elige el tipo de equipo");
    if (!codigo) return toast("Escribe el código");
    if (cat.equipos.some((x) => x.id !== id && String(x.codigo).toLowerCase() === codigo.toLowerCase())) return toast("Ese código ya existe");
    const activo = e ? $("#fe-activo").checked : true;
    if (e && !activo && e.activo !== false && e.estado === "en_uso" &&
      !(await dialogo(`Este equipo figura <b>en uso por ${esc(e.usuario)}</b>. ¿Darlo de baja igual?`, "Dar de baja"))) return;
    const cambioCodigo = e && e.codigo !== codigo;
    const data = { codigo, tipo, asignados: leerPers(), activo, actualizado: Date.now() };
    cargando("Guardando…");
    try {
      await asegurarImportado();
      const nid = id || nuevoId("eq");
      if (!e) Object.assign(data, { estado: "disponible", creado: Date.now() });
      await backend.guardar("equipos", nid, data);
      if (cambioCodigo || !e) qrSel.add(nid);
      toast(cambioCodigo ? "Guardado. El QR nuevo ya está marcado en la pestaña QR." : !e ? "Equipo agregado (marcado en la pestaña QR)" : "Guardado");
      if (otro) formEquipo(null, tipo); else cerrarHoja();
    } catch (err) { console.error(err); toast("No se pudo guardar: " + (err.message || err), 5000); }
    cargando(null);
  };
  $("#fe-guardar").onclick = () => guardar(false);
  if ($("#fe-otro")) $("#fe-otro").onclick = () => guardar(true);
}

// Liberar (reparado) o enviar a revisión: queda como movimiento en el historial
async function moverRevision(e, tipo, texto) {
  cargando("Guardando…");
  try {
    await asegurarImportado();
    const r = await backend.registrar({ tipo, usuario: "Administrador", usuarioId: null, ts: Date.now(),
      items: [{ id: e.id, codigo: e.codigo, tipo: e.tipo }], foto: null, avisos: [],
      nota: tipo === "liberacion" ? texto : "", danoDesc: tipo === "revision" ? texto : null });
    toast(tipo === "liberacion" ? `${nombreTipo(e.tipo)} ${e.codigo} liberado: ya se puede retirar` : `${nombreTipo(e.tipo)} ${e.codigo} enviado a revisión`, 3500);
    if (r === "pendiente") toast("Guardado sin señal; se enviará al reconectar", 4000);
    cerrarHoja();
  } catch (err) { console.error(err); toast("No se pudo guardar: " + (err.message || err), 5000); }
  cargando(null);
}

// ---------- tipos de equipo
function listaTipos() {
  abrirHoja(`<h2 class="h-lg" style="margin-bottom:6px">Tipos de equipo</h2>
    <p class="sub">Un tipo oculto no aparece en la app para retirar.</p>
    <div class="lista-eq">${cat.tipos.map((t) => {
      const n = cat.equipos.filter((e) => e.tipo === t.clave && e.activo !== false).length;
      return `<button class="eq ${t.activo === false ? "baja" : ""}" data-tipo="${esc(t.clave)}">${icono(t.icono)}
        <div class="cuerpo"><div class="cod">${esc(t.nombre)}</div><div class="asig">${n} equipo(s) activo(s)</div></div>
        <div class="estado">${t.activo === false ? `<span class="pill gris">Oculto</span>` : `<span class="pill disp">Visible</span>`}</div></button>`;
    }).join("")}</div>
    <div class="botones"><button class="btn btn-pri" id="ti-nuevo">+ Nuevo tipo de equipo</button></div>`);
  $("#hoja-cont .lista-eq").onclick = (e) => { const b = e.target.closest("[data-tipo]"); if (b) formTipo(b.dataset.tipo, () => listaTipos()); };
  $("#ti-nuevo").onclick = () => formTipo(null, () => listaTipos());
}
function formTipo(clave, alTerminar) {
  const t = clave ? cat.tipo(clave) : null;
  const ic = t?.icono || "generico";
  abrirHoja(`<h2 class="h-lg" style="margin-bottom:14px">${t ? "Editar tipo" : "Nuevo tipo de equipo"}</h2>
    <div class="campo"><label class="lbl">Nombre</label><input id="ft-nom" class="input" value="${esc(t?.nombre || "")}" placeholder="Ej. Tablet, Linterna, Lector" autocomplete="off"></div>
    <div class="campo"><label class="lbl">Ícono</label><div class="icon-grid">${ICONOS_DISPONIBLES.map(([k, n]) =>
      `<label><input type="radio" name="ft-ic" value="${k}" ${k === ic ? "checked" : ""}>${icono(k)}${n}</label>`).join("")}</div></div>
    ${t ? `<label class="check-fila"><input type="checkbox" id="ft-act" ${t.activo !== false ? "checked" : ""}> Visible en la app</label>` : ""}
    <div class="botones"><button class="btn btn-pri" id="ft-guardar">Guardar</button></div>`);
  $("#ft-guardar").onclick = async () => {
    const nombre = $("#ft-nom").value.trim().replace(/\s+/g, " ");
    if (!nombre) return toast("Escribe el nombre");
    if (cat.tipos.some((x) => x.clave !== clave && norm(x.nombre) === norm(nombre))) return toast("Ya existe un tipo con ese nombre");
    let id = clave;
    if (!id) { id = slug(nombre).toUpperCase().replace(/-/g, "_") || nuevoId("T"); while (cat.tipos.some((x) => x.clave === id)) id += "_2"; }
    const data = { clave: id, nombre, icono: $("input[name=ft-ic]:checked").value, activo: t ? $("#ft-act").checked : true,
      orden: t?.orden ?? (Math.max(0, ...cat.tipos.map((x) => x.orden || 0)) + 1) };
    cargando("Guardando…");
    try {
      await asegurarImportado();
      await backend.guardar("tipos", id, data);
      fsData.tipos = { ...fsData.tipos, [id]: data }; cat = construirCatalogo(fsData);
      toast("Tipo guardado");
      alTerminar ? alTerminar(id) : cerrarHoja();
    } catch (err) { console.error(err); toast("No se pudo guardar: " + (err.message || err), 5000); }
    cargando(null);
  };
}

// ================================================================== PERSONAL
let perFiltro = "activos";
$("#per-buscar").oninput = () => renderPersonal();
$("#per-chips").onclick = (e) => {
  const c = e.target.closest(".chip"); if (!c) return;
  perFiltro = c.dataset.v; $$("#per-chips .chip").forEach((x) => x.classList.toggle("on", x === c)); renderPersonal();
};
$("#per-nuevo").onclick = () => formPersona(null);
const equiposDe = (pid) => cat.equipos.filter((e) => e.activo !== false && (e.asignados || []).includes(pid));

function renderPersonal() {
  const q = norm($("#per-buscar").value);
  const lista = cat.personal.filter((p) => (perFiltro === "activos" ? p.activo !== false : p.activo === false) && (!q || norm(p.nombre).includes(q)));
  $("#per-lista").innerHTML = lista.map((p) => {
    const eqs = equiposDe(p.id).map((e) => `${nombreTipo(e.tipo)} ${e.codigo}`).join(" · ");
    const reemp = p.reemplazadoPor ? cat.persona(p.reemplazadoPor) : null;
    const reemplazaA = p.reemplazaA ? cat.persona(p.reemplazaA) : null;
    return `<button class="eq ${p.activo === false ? "baja" : ""}" data-pid="${esc(p.id)}" style="border-left-color:var(--azul)">
      <div class="cuerpo"><div class="cod" style="font-size:16px">${esc(p.nombre)}</div>
      <div class="per-eqs">${esc(eqs || "Sin equipos asignados")}</div>
      ${reemplazaA ? `<div class="per-eqs">Reemplazó a ${esc(reemplazaA.nombre)}</div>` : ""}</div>
      <div class="estado">${p.activo === false ? `<span class="pill gris">${reemp ? "Reemplazado" : "De baja"}</span>${reemp ? `<div class="cuando">por ${esc(reemp.nombre)}</div>` : ""}` : ""}</div></button>`;
  }).join("") || `<p class="vacio-msg">Sin personas</p>`;
}
$("#per-lista").onclick = (e) => { const b = e.target.closest("[data-pid]"); if (b) formPersona(b.dataset.pid); };

function opsAsignacion(pid, nuevosIds) {
  // devuelve operaciones para que pid quede asignado exactamente a nuevosIds (solo equipos activos)
  const ops = [];
  cat.equipos.forEach((e) => {
    const tiene = (e.asignados || []).includes(pid), debe = nuevosIds.includes(e.id);
    if (tiene === debe) return;
    const asignados = debe ? [...(e.asignados || []), pid] : (e.asignados || []).filter((x) => x !== pid);
    ops.push({ col: "equipos", id: e.id, data: { asignados, actualizado: Date.now() } });
  });
  return ops;
}
function selectorEquipos(seleccion, contenedor) {
  const sel = new Set(seleccion);
  contenedor.innerHTML = `<input class="input" type="search" placeholder="Buscar código" data-es-buscar><div class="lista-check" data-es-lista></div>`;
  const pintar = () => {
    const q = norm($("[data-es-buscar]", contenedor).value);
    $("[data-es-lista]", contenedor).innerHTML = cat.equiposActivos().filter((e) => !q || norm(e.codigo + " " + nombreTipo(e.tipo)).includes(q))
      .map((e) => `<label><input type="checkbox" value="${esc(e.id)}" ${sel.has(e.id) ? "checked" : ""}>${esc(nombreTipo(e.tipo))} ${esc(e.codigo)}<small>${esc(asignadosTxt(e))}</small></label>`).join("");
  };
  $("[data-es-buscar]", contenedor).oninput = pintar;
  $("[data-es-lista]", contenedor).onchange = (ev) => { ev.target.checked ? sel.add(ev.target.value) : sel.delete(ev.target.value); };
  pintar();
  return () => [...sel];
}

function formPersona(pid) {
  const p = pid ? cat.persona(pid) : null;
  const activo = !p || p.activo !== false;
  abrirHoja(`<h2 class="h-lg" style="margin-bottom:14px">${p ? "Editar persona" : "Agregar persona"}</h2>
    <div class="campo"><label class="lbl">Nombre y apellido</label><input id="fp-nom" class="input" value="${esc(p?.nombre || "")}" autocomplete="off">
      ${p ? `<p class="ayuda">Corregir el nombre actualiza la app y las asignaciones. El historial pasado conserva el nombre con que se registró.</p>` : ""}</div>
    ${activo ? `<div class="campo"><label class="lbl">Equipos asignados</label><div id="fp-eqs"></div></div>` : ""}
    ${p && !activo ? `<div class="nota-info">${p.reemplazadoPor ? `Reemplazado por <b>${esc(cat.persona(p.reemplazadoPor)?.nombre || "—")}</b>` : "Dado de baja"}${p.fechaBaja ? ` el ${new Date(p.fechaBaja).toLocaleDateString("es-PE")}` : ""}.</div>` : ""}
    <div class="botones"><button class="btn btn-pri" id="fp-guardar">Guardar</button></div>
    ${p && activo ? `<div class="botones-2"><button class="btn btn-sec" id="fp-reemp">⇄ Reemplazar</button><button class="btn btn-sec" id="fp-baja" style="color:var(--rojo)">Dar de baja</button></div>` : ""}
    ${p && !activo ? `<div class="botones"><button class="btn btn-sec" id="fp-react">Reactivar</button></div>` : ""}`);
  const leerEqs = activo ? selectorEquipos(p ? equiposDe(p.id).map((e) => e.id) : [], $("#fp-eqs")) : null;

  $("#fp-guardar").onclick = async () => {
    const nombre = $("#fp-nom").value.trim().replace(/\s+/g, " ");
    if (nombre.length < 3) return toast("Escribe nombre y apellido");
    const dup = cat.personal.find((x) => x.id !== pid && norm(x.nombre) === norm(nombre));
    if (dup && !(await dialogo(`Ya existe <b>${esc(dup.nombre)}</b>${dup.activo === false ? " (de baja)" : ""}. ¿Guardar igual?`))) return;
    cargando("Guardando…");
    try {
      await asegurarImportado();
      const id = pid || nuevoId("p");
      const ops = [{ col: "personal", id, data: p ? { nombre, actualizado: Date.now() } : { nombre, activo: true, ts: Date.now() } }];
      if (leerEqs) ops.push(...opsAsignacion(id, leerEqs()));
      await backend.lote(ops);
      toast(p ? "Guardado" : "Persona agregada"); cerrarHoja();
    } catch (err) { console.error(err); toast("No se pudo guardar: " + (err.message || err), 5000); }
    cargando(null);
  };
  if ($("#fp-reemp")) $("#fp-reemp").onclick = () => formReemplazo(pid);
  if ($("#fp-baja")) $("#fp-baja").onclick = async () => {
    const n = equiposDe(pid).length;
    const ok = await dialogo(`¿Dar de baja a <b>${esc(p.nombre)}</b>?<br><br>Ya no aparecerá para registrarse${n ? ` y se quitará de sus ${n} equipo(s) asignado(s)` : ""}. Su historial se conserva.`, "Dar de baja");
    if (!ok) return;
    cargando("Guardando…");
    try {
      await asegurarImportado();
      await backend.lote([{ col: "personal", id: pid, data: { activo: false, reemplazadoPor: null, fechaBaja: Date.now() } }, ...opsAsignacion(pid, [])]);
      toast("Persona dada de baja"); cerrarHoja();
    } catch (err) { console.error(err); toast("No se pudo guardar: " + (err.message || err), 5000); }
    cargando(null);
  };
  if ($("#fp-react")) $("#fp-react").onclick = async () => {
    cargando("Guardando…");
    try { await backend.guardar("personal", pid, { activo: true, reemplazadoPor: null, fechaBaja: null }); toast("Reactivado"); cerrarHoja(); }
    catch (err) { toast("No se pudo guardar: " + (err.message || err), 5000); }
    cargando(null);
  };
}

function formReemplazo(pid) {
  const p = cat.persona(pid);
  const eqs = equiposDe(pid);
  const otros = cat.personal.filter((x) => x.id !== pid && x.activo !== false);
  abrirHoja(`<h2 class="h-lg">Reemplazar personal</h2>
    <p class="sub" style="margin-top:4px">Sale <b>${esc(p.nombre)}</b>. Su historial queda guardado con su nombre.</p>
    <label class="lbl">¿Quién entra?</label>
    <label class="radio-op"><input type="radio" name="fr-modo" value="nuevo" checked><div><b>Persona nueva</b>
      <input id="fr-nom" class="input" placeholder="Nombre y apellido" autocomplete="off"></div></label>
    <label class="radio-op"><input type="radio" name="fr-modo" value="existente" ${otros.length ? "" : "disabled"}><div><b>Alguien que ya está en la lista</b>
      <select id="fr-sel" class="input">${otros.map((x) => `<option value="${esc(x.id)}">${esc(x.nombre)}</option>`).join("")}</select></div></label>
    <label class="check-fila" style="margin-top:14px"><input type="checkbox" id="fr-trans" checked> Pasar sus equipos asignados al nuevo</label>
    <p class="ayuda">${eqs.length ? esc(eqs.map((e) => `${nombreTipo(e.tipo)} ${e.codigo}`).join(" · ")) : "No tiene equipos asignados"}</p>
    <div class="botones"><button class="btn btn-pri" id="fr-ok">Confirmar reemplazo</button></div>`);
  $("#fr-nom").onfocus = () => ($("input[name=fr-modo][value=nuevo]").checked = true);
  $("#fr-sel").onfocus = () => { const r = $("input[name=fr-modo][value=existente]"); if (!r.disabled) r.checked = true; };
  $("#fr-ok").onclick = async () => {
    const modoR = $("input[name=fr-modo]:checked").value;
    let nuevoPid, nombreNuevo, ops = [];
    if (modoR === "nuevo") {
      nombreNuevo = $("#fr-nom").value.trim().replace(/\s+/g, " ");
      if (nombreNuevo.length < 3) return toast("Escribe el nombre de quien entra");
      if (cat.personal.some((x) => norm(x.nombre) === norm(nombreNuevo))) return toast("Esa persona ya existe: elige “Alguien que ya está en la lista”");
      nuevoPid = nuevoId("p");
      ops.push({ col: "personal", id: nuevoPid, data: { nombre: nombreNuevo, activo: true, reemplazaA: pid, ts: Date.now() } });
    } else {
      nuevoPid = $("#fr-sel").value; nombreNuevo = cat.persona(nuevoPid)?.nombre;
      ops.push({ col: "personal", id: nuevoPid, data: { reemplazaA: pid } });
    }
    const trans = $("#fr-trans").checked;
    if (!(await dialogo(`<b>${esc(p.nombre)}</b> será reemplazado por <b>${esc(nombreNuevo)}</b>${trans && eqs.length ? ` y sus ${eqs.length} equipo(s) pasarán a su nombre` : ""}.<br><br>¿Confirmar?`, "Confirmar"))) return;
    ops.push({ col: "personal", id: pid, data: { activo: false, reemplazadoPor: nuevoPid, fechaBaja: Date.now() } });
    cat.equipos.forEach((e) => {
      if (!(e.asignados || []).includes(pid)) return;
      let a = (e.asignados || []).filter((x) => x !== pid);
      if (trans && e.activo !== false && !a.includes(nuevoPid)) a.push(nuevoPid);
      ops.push({ col: "equipos", id: e.id, data: { asignados: a, actualizado: Date.now() } });
    });
    cargando("Guardando…");
    try { await asegurarImportado(); await backend.lote(ops); toast(`Listo: ${nombreNuevo} reemplaza a ${p.nombre}`, 4000); cerrarHoja(); }
    catch (err) { console.error(err); toast("No se pudo guardar: " + (err.message || err), 5000); }
    cargando(null);
  };
}

// ================================================================== QR
const qrSel = new Set();
$("#qr-buscar").oninput = () => renderQR();
function renderQR() {
  const act = cat.equiposActivos();
  [...qrSel].forEach((id) => { if (!act.some((e) => e.id === id)) qrSel.delete(id); });
  $("#qr-rapido").innerHTML = `<button class="chip" data-r="todos">Todos (${act.length})</button>` +
    cat.tipos.filter((t) => act.some((e) => e.tipo === t.clave)).map((t) => `<button class="chip" data-r="${esc(t.clave)}">Solo ${esc(plural(t.nombre))}</button>`).join("") +
    `<button class="chip" data-r="ninguno">Ninguno</button>`;
  const q = norm($("#qr-buscar").value);
  let html = "";
  cat.tipos.forEach((t) => {
    const l = act.filter((e) => e.tipo === t.clave && (!q || norm(e.codigo + " " + cat.nombres(e.asignados).join(" ")).includes(q)));
    if (!l.length) return;
    html += `<div class="grupo">${esc(plural(t.nombre))}</div>` + l.map((e) =>
      `<label><input type="checkbox" value="${esc(e.id)}" ${qrSel.has(e.id) ? "checked" : ""}><b>${esc(e.codigo)}</b><small>${esc(asignadosTxt(e))}</small></label>`).join("");
  });
  $("#qr-lista").innerHTML = html || `<p class="vacio-msg">Sin equipos</p>`;
  actualizarBotonQR();
}
function actualizarBotonQR() {
  const n = qrSel.size, cartel = $("#qr-cartel").checked;
  $("#qr-generar").textContent = n ? `Generar PDF · ${n} etiqueta${n > 1 ? "s" : ""}` : cartel ? "Generar PDF · solo cartel" : "Elige equipos";
  $("#qr-generar").disabled = !n && !cartel;
}
$("#qr-cartel").onchange = actualizarBotonQR;
$("#qr-rapido").onclick = (e) => {
  const b = e.target.closest("[data-r]"); if (!b) return;
  const r = b.dataset.r, act = cat.equiposActivos();
  if (r === "ninguno") qrSel.clear();
  else if (r === "todos") act.forEach((x) => qrSel.add(x.id));
  else { qrSel.clear(); act.filter((x) => x.tipo === r).forEach((x) => qrSel.add(x.id)); }
  renderQR();
};
$("#qr-lista").onchange = (e) => { const c = e.target; if (c.type !== "checkbox") return; c.checked ? qrSel.add(c.value) : qrSel.delete(c.value); actualizarBotonQR(); };
$("#qr-generar").onclick = async () => {
  const lista = cat.equiposActivos().filter((e) => qrSel.has(e.id));
  cargando("Generando PDF…");
  try {
    const bytes = await generarPDF(lista, $("#qr-cartel").checked);
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    descargar(url, `etiquetas_qr_${isoDia(new Date())}${lista.length === 1 ? "_" + slug(lista[0].codigo) : ""}.pdf`);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast("PDF descargado. Imprímelo al 100 % (sin ajustar a página).", 4000);
  } catch (err) { console.error(err); toast("No se pudo generar el PDF: " + (err.message || err), 6000); }
  cargando(null);
};

function cargarScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("no se pudo cargar " + src));
    document.head.appendChild(s);
  });
}
// texto compatible con las fuentes estándar del PDF (latín básico + tildes/ñ)
const txtPDF = (s) => String(s ?? "").normalize("NFC").replace(/[^\x20-\x7E -ÿ]/g, "");

async function generarPDF(lista, cartel) {
  if (!window.PDFLib) await cargarScript("../js/vendor/pdf-lib.min.js");
  if (!window.crearQR) await cargarScript("../js/vendor/qrcode.js");
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const hex = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
  const AZUL = hex("#0A2F6B"), NAR = hex("#F47B20"), GRIS = hex("#5D6B82"), LINEA = hex("#C9D2E0"), BLANCO = rgb(1, 1, 1), NEGRO = rgb(0, 0, 0);
  const mm = 72 / 25.4, W = 595.28, H = 841.89;

  const pdf = await PDFDocument.create();
  pdf.setTitle("Etiquetas QR · Control de equipos"); pdf.setCreator("Control de equipos · Almacén");
  const F = await pdf.embedFont(StandardFonts.Helvetica), FB = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(await (await fetch("../img/logo-cerroverde.png")).arrayBuffer());
  const logoH = (w) => w * logo.height / logo.width;

  const dibujarQR = (page, texto, x, y, size) => {
    const q = window.crearQR(texto, "M"), n = q.n, m = size / (n + 2); // 1 módulo de margen
    page.drawRectangle({ x, y, width: size, height: size, color: BLANCO });
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        if (!q.oscuro(r, c)) { c++; continue; }
        let f = c; while (f < n && q.oscuro(r, f)) f++;
        page.drawRectangle({ x: x + (c + 1) * m, y: y + size - (r + 2) * m, width: (f - c) * m + 0.05, height: m + 0.05, color: NEGRO });
        c = f;
      }
    }
  };
  const centrado = (page, t, cx, y, size, font, color) => {
    t = txtPDF(t); page.drawText(t, { x: cx - font.widthOfTextAtSize(t, size) / 2, y, size, font, color });
  };
  const recortar = (t, font, size, max) => {
    t = txtPDF(t); if (font.widthOfTextAtSize(t, size) <= max) return t;
    while (t.length > 1 && font.widthOfTextAtSize(t + "…", size) > max) t = t.slice(0, -1);
    return t + "…";
  };

  if (cartel) {
    const pg = pdf.addPage([W, H]);
    pg.drawRectangle({ x: 0, y: H - 60 * mm, width: W, height: 60 * mm, color: AZUL });
    pg.drawRectangle({ x: 0, y: H - 63 * mm, width: W, height: 3 * mm, color: NAR });
    pg.drawImage(logo, { x: 20 * mm, y: H - 38 * mm, width: 75 * mm, height: logoH(75 * mm) });
    pg.drawText(txtPDF("Almacén · Control de equipos"), { x: 20 * mm, y: H - 52 * mm, size: 15, font: FB, color: BLANCO });
    centrado(pg, "ESCANEA PARA", W / 2, H - 90 * mm, 34, FB, AZUL);
    centrado(pg, "RETIRAR O DEVOLVER", W / 2, H - 104 * mm, 34, FB, NAR);
    dibujarQR(pg, URL_APP, (W - 110 * mm) / 2, H - 222 * mm, 110 * mm);
    centrado(pg, "Abre la cámara del celular y apunta al código.", W / 2, H - 232 * mm, 12, F, GRIS);
    centrado(pg, "Primera vez: en el navegador abre el menú (tres puntos) y toca \"Instalar app\".", W / 2, H - 239 * mm, 11, F, GRIS);
    centrado(pg, URL_APP, W / 2, 15 * mm, 9, F, GRIS);
  }

  const cols = 3, rows = 5, mx = 10 * mm, my = 12 * mm;
  const lw = (W - 2 * mx) / cols, lh = (H - 2 * my) / rows;
  let pg = null;
  lista.forEach((e, i) => {
    const k = i % (cols * rows);
    if (k === 0) pg = pdf.addPage([W, H]);
    const col = k % cols, row = Math.floor(k / cols);
    const x = mx + col * lw, y = H - my - (row + 1) * lh;
    pg.drawRectangle({ x, y, width: lw, height: lh, borderColor: LINEA, borderWidth: 0.6, borderDashArray: [3, 3] });
    const bx = x + 3 * mm, by = y + 3 * mm, bw = lw - 6 * mm, bh = lh - 6 * mm;
    pg.drawRectangle({ x: bx, y: by + bh - 9 * mm, width: bw, height: 9 * mm, color: AZUL });
    pg.drawImage(logo, { x: bx + 2.5 * mm, y: by + bh - 7 * mm, width: 24 * mm, height: logoH(24 * mm) });
    const tt = txtPDF(nombreTipo(e.tipo).toUpperCase());
    pg.drawText(recortar(tt, FB, 10, bw - 32 * mm), { x: bx + bw - 2.5 * mm - Math.min(FB.widthOfTextAtSize(tt, 10), bw - 32 * mm), y: by + bh - 6 * mm, size: 10, font: FB, color: NAR });
    const q = Math.min(bw, bh - 25 * mm);
    dibujarQR(pg, `${URL_APP}?eq=${encodeURIComponent(e.codigo)}`, bx + (bw - q) / 2, by + 13 * mm, q);
    const cs = FB.widthOfTextAtSize(txtPDF(e.codigo), 22) > bw ? 15 : 22;
    centrado(pg, recortar(e.codigo, FB, cs, bw), bx + bw / 2, by + 6 * mm, cs, FB, AZUL);
    centrado(pg, recortar(cat.nombres(e.asignados).join(" / "), F, 7, bw), bx + bw / 2, by + 1.8 * mm, 7, F, GRIS);
  });
  return await pdf.save();
}

// ================================================================== RESUMEN
let resPeriodo = "hoy", resMovs = [], resRango = null;
const nRet = (n) => `${n} retiro${n === 1 ? "" : "s"}`;
const horas = (ms) => { const h = ms / 3600e3; return h < 10 ? h.toFixed(1).replace(".0", "") : Math.round(h).toString(); };
const durTxt = (ms) => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? (m % 60) + " min" : ""}`.trim(); };
const fechaHora = (ts) => new Date(ts).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

function renderResumen() {
  const act = cat.equiposActivos();
  const uso = act.filter((e) => e.estado === "en_uso"), rev = act.filter((e) => e.estado === "revision");
  const venc = uso.filter((e) => vencido(e, aj)).sort((a, b) => a.desde - b.desde);
  $("#res-ahora").innerHTML = `<div class="stat verde"><b>${act.length - uso.length - rev.length}</b><span>Disponibles</span></div>
    <div class="stat naranja"><b>${uso.length}</b><span>En uso</span></div>
    <div class="stat ${venc.length ? "rojo" : ""}"><b>${venc.length}</b><span>No devueltos</span></div>
    <div class="stat ${rev.length ? "morado" : ""}"><b>${rev.length}</b><span>En revisión</span></div>`;
  $("#res-vencidos").innerHTML = venc.length ? `<div class="card borde-rojo"><h3 class="h-card">⚠ No devueltos a tiempo<button class="btn-mini" id="res-venc-csv">⬇ CSV</button></h3>
    ${venc.map((e) => `<div class="fila-mini"><div><b>${esc(nombreTipo(e.tipo))} ${esc(e.codigo)}</b><small>${esc(e.usuario)}</small></div>
      <div class="der">retiró ${fechaHora(e.desde)}<small>turno cerró ${horaCorta(cierreSiguiente(e.desde, aj))} · fuera ${durTxt(Date.now() - e.desde)}</small></div></div>`).join("")}</div>`
    : uso.length ? `<div class="card"><p class="ayuda" style="margin:0">✓ Los ${uso.length} equipo(s) en uso están dentro de su turno.</p></div>` : "";
  if ($("#res-venc-csv")) $("#res-venc-csv").onclick = () => exportarCSV(`no_devueltos_${isoDia(new Date())}.csv`,
    [["Tipo", "Código", "Persona", "Retiró", "Cierre de turno", "Horas fuera", "Asignado a"],
     ...venc.map((e) => [nombreTipo(e.tipo), e.codigo, e.usuario, new Date(e.desde).toLocaleString("es-PE"),
       new Date(cierreSiguiente(e.desde, aj)).toLocaleString("es-PE"), horas(Date.now() - e.desde), cat.nombres(e.asignados).join(" / ")])]);
  $("#res-revision").innerHTML = rev.length ? `<div class="card borde-morado"><h3 class="h-card">🔧 En revisión (no se pueden retirar)</h3>
    ${rev.map((e) => `<button class="fila-mini" data-rev="${esc(e.id)}"><div><b>${esc(nombreTipo(e.tipo))} ${esc(e.codigo)}</b><small>${esc(e.dano?.desc || "Sin descripción")}</small></div>
      <div class="der">${esc(e.dano?.por || "")}<small>${fechaHora(e.dano?.ts || e.desde)} · liberar ›</small></div></button>`).join("")}</div>` : "";
  renderPeriodo();
}
$("#res-revision").onclick = (e) => { const b = e.target.closest("[data-rev]"); if (b) formEquipo(b.dataset.rev); };

function rangoResumen() {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const fin = new Date(hoy); fin.setDate(fin.getDate() + 1);
  if (resPeriodo === "hoy") return { desde: hoy.getTime(), hasta: fin.getTime() };
  if (resPeriodo === "mes") return { desde: new Date(hoy.getFullYear(), hoy.getMonth(), 1).getTime(), hasta: fin.getTime() };
  const d = new Date(hoy); d.setDate(d.getDate() - (Number(resPeriodo) - 1));
  return { desde: d.getTime(), hasta: fin.getTime() };
}
$("#res-periodo").onclick = (e) => {
  const b = e.target.closest("button"); if (!b) return;
  resPeriodo = b.dataset.d; $$("#res-periodo button").forEach((x) => x.classList.toggle("on", x === b));
  cargarPeriodoResumen();
};
async function cargarPeriodoResumen() {
  resRango = rangoResumen();
  $("#res-cont").innerHTML = `<p class="vacio-msg">Calculando…</p>`;
  try { resMovs = await backend.consultar(resRango.desde - 2 * 864e5, resRango.hasta); } // 2 días antes para emparejar retiros previos
  catch (e) { console.error(e); resMovs = []; }
  renderPeriodo();
}

// Empareja cada retiro con su devolución para calcular tiempos de uso y devoluciones tardías
function analizar(movs, { desde, hasta }) {
  const asc = [...movs].sort((a, b) => a.ts - b.ts), abiertos = {}, pares = [];
  for (const m of asc) for (const it of m.equipos || []) {
    const id = it.id || it.codigo;
    if (m.tipo === "retiro") {
      if (abiertos[id]) pares.push({ ...abiertos[id], fin: m.ts, cerrado: true });
      abiertos[id] = { id, codigo: it.codigo, tipo: it.tipo, usuario: m.usuario, ts: m.ts };
    } else if (abiertos[id]) { pares.push({ ...abiertos[id], fin: m.ts, cerrado: true }); delete abiertos[id]; }
  }
  const ahora = Math.min(Date.now(), hasta);
  Object.values(abiertos).forEach((a) => pares.push({ ...a, fin: ahora, cerrado: false }));
  const enPeriodo = pares.filter((p) => p.ts >= desde && p.ts < hasta).map((p) => {
    const lim = limiteDevolucion(p.ts, aj);
    return { ...p, dur: Math.max(0, p.fin - p.ts), tarde: lim !== null && p.fin > lim };
  });
  const movsP = asc.filter((m) => m.ts >= desde && m.ts < hasta);
  return { pares: enPeriodo, movs: movsP };
}
function barras(filas, clase = "") {
  if (!filas.length) return `<p class="ayuda" style="margin:0">Sin datos en el periodo</p>`;
  const max = Math.max(...filas.map((f) => f.n), 1);
  return `<div class="barras">${filas.map((f) => `<div class="barra ${clase}"><span class="nom">${esc(f.nom)}</span><span class="val">${esc(f.txt)}</span>
    <span class="pista"><i style="width:${Math.max(3, (f.n / max) * 100)}%"></i></span></div>`).join("")}</div>`;
}
function agrupar(arr, clave) { const m = new Map(); arr.forEach((x) => { const k = clave(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }); return [...m]; }

function renderPeriodo() {
  if (!resRango) return;
  const { pares, movs } = analizar(resMovs, resRango);
  const ret = movs.filter((m) => m.tipo === "retiro").length, dev = movs.filter((m) => m.tipo === "devolucion").length;
  const dan = movs.filter((m) => (m.danados || []).length || m.tipo === "revision").length;
  const tardes = pares.filter((p) => p.tarde).length;
  const porTipo = agrupar(pares, (p) => p.tipo).map(([t, l]) => ({ nom: plural(nombreTipo(t)), n: l.length, txt: `${nRet(l.length)} · ${horas(l.reduce((a, p) => a + p.dur, 0))} h` })).sort((a, b) => b.n - a.n);
  const porEquipo = agrupar(pares, (p) => p.id).map(([, l]) => ({ nom: `${nombreTipo(l[0].tipo)} ${l[0].codigo}`, n: l.length, txt: `${l.length}× · ${horas(l.reduce((a, p) => a + p.dur, 0))} h` })).sort((a, b) => b.n - a.n).slice(0, 8);
  const porPersona = agrupar(pares, (p) => p.usuario).map(([u, l]) => { const ms = l.reduce((a, p) => a + p.dur, 0); return { nom: u, n: ms, txt: `${horas(ms)} h · ${nRet(l.length)}` }; }).sort((a, b) => b.n - a.n).slice(0, 8);
  const tarde = agrupar(pares, (p) => p.usuario).map(([u, l]) => { const t = l.filter((p) => p.tarde).length; return { nom: u, n: t, txt: `${t} de ${l.length}` }; }).filter((f) => f.n > 0).sort((a, b) => b.n - a.n).slice(0, 8);
  $("#res-cont").innerHTML = `<div class="stats stats4">
      <div class="stat"><b>${ret}</b><span>Retiros</span></div><div class="stat"><b>${dev}</b><span>Devoluciones</span></div>
      <div class="stat ${tardes ? "rojo" : ""}"><b>${tardes}</b><span>Devueltos tarde</span></div><div class="stat ${dan ? "morado" : ""}"><b>${dan}</b><span>Daños reportados</span></div></div>
    <div class="card"><h3 class="h-card">Uso por tipo de equipo</h3>${barras(porTipo)}</div>
    <div class="card"><h3 class="h-card">Equipos que más salen</h3>${barras(porEquipo, "naranja")}</div>
    <div class="card"><h3 class="h-card">Personas con más horas de uso</h3>${barras(porPersona)}</div>
    <div class="card"><h3 class="h-card">No devuelven a tiempo</h3>${aj.cierres.length ? barras(tarde, "rojo") : `<p class="ayuda" style="margin:0">Configura los horarios de cierre de turno (abajo).</p>`}
      <p class="ayuda">Veces que devolvieron después del cierre de su turno + ${aj.toleranciaMin} min, sobre el total de sus retiros.</p></div>`;
}

function exportarCSV(nombre, filas) {
  const csv = "﻿" + filas.map((f) => f.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  descargar(url, nombre); setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ---------- horarios de cierre de turno
let turEdit = null;
function pintarTurnos() {
  if (!turEdit || !$("#res-turnos").contains(document.activeElement)) turEdit = [...aj.cierres];
  $("#tur-lista").innerHTML = turEdit.map((c, i) => `<div class="tur-fila"><input type="time" class="input" data-i="${i}" value="${c}">
    <button data-quitar="${i}" aria-label="Quitar">✕</button></div>`).join("") || `<p class="ayuda">Sin cierres: no se marcarán equipos como no devueltos.</p>`;
  if (document.activeElement !== $("#tur-tol")) $("#tur-tol").value = aj.toleranciaMin;
}
$("#tur-lista").oninput = (e) => { const i = e.target.dataset.i; if (i !== undefined) turEdit[i] = e.target.value; };
$("#tur-lista").onclick = (e) => { const b = e.target.closest("[data-quitar]"); if (!b) return; turEdit.splice(Number(b.dataset.quitar), 1); pintarTurnos(); };
$("#tur-add").onclick = () => { turEdit.push("12:00"); pintarTurnos(); };
$("#tur-guardar").onclick = async () => {
  const cierres = [...new Set(turEdit.filter((c) => /^\d{2}:\d{2}$/.test(c)))].sort();
  const tol = Math.max(0, Math.min(240, parseInt($("#tur-tol").value, 10) || 0));
  cargando("Guardando…");
  try {
    await backend.guardar("ajustes", "general", { cierres, toleranciaMin: tol, actualizado: Date.now() });
    turEdit = null; toast(`Horarios guardados: ${cierres.join(", ") || "sin cierres"} · tolerancia ${tol} min`, 3500);
  } catch (err) { console.error(err); toast("No se pudo guardar: " + (err.message || err), 5000); }
  cargando(null);
};

// ------------------------------------------------------------------ arranque
if (sesionValida()) abrirPanel();
else { $("#v-lock").hidden = false; setTimeout(() => $("#lock-cod").focus(), 100); }
