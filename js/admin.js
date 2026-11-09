// Panel de control (/panel): consulta histórica, fotos, exportación CSV y borrado en modo pruebas.
import { EQUIPOS } from "./config.js";
import { crearBackend } from "./backend.js";

// SHA-256 del código de acceso (el código no se guarda en texto plano)
const HASH_CODIGO = "50038c4168c25d0652d051885a2da56bcd99867397e5208ec295652230737316";
const SESION_HORAS = 8;

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const CAT = Object.fromEntries(EQUIPOS.map((e) => [e.codigo, e]));
const NT = { PDA: "PDA", RADIO: "Radio" };
const pad = (n) => String(n).padStart(2, "0");
const isoDia = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};

let backend = null, modo = "dia", vista = "lista", resultados = [], periodo = null;
const fotosCache = new Map();

// ------------------------------------------------------------------ utilidades UI
function toast(t, ms = 2600) {
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
const cerrarHoja = () => ($("#hoja").hidden = true);
$("#hoja .hoja-x").onclick = cerrarHoja;
$("#hoja").onclick = (e) => { if (e.target.id === "hoja") cerrarHoja(); };

// ------------------------------------------------------------------ acceso con código
async function sha256(t) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function sesionValida() {
  const s = LS.get("ce_admin");
  return s && s.h === HASH_CODIGO && s.exp > Date.now();
}
async function entrar() {
  const cod = $("#lock-cod").value.trim();
  if (!cod) return;
  if ((await sha256(cod)) === HASH_CODIGO) {
    LS.set("ce_admin", { h: HASH_CODIGO, exp: Date.now() + SESION_HORAS * 3600e3 });
    abrirPanel();
  } else {
    $("#lock-err").hidden = false; $("#lock-cod").value = "";
    const l = $(".lock"); l.classList.remove("shake"); void l.offsetWidth; l.classList.add("shake");
    if (navigator.vibrate) navigator.vibrate(150);
  }
}
$("#lock-ok").onclick = entrar;
$("#lock-cod").onkeydown = (e) => { if (e.key === "Enter") entrar(); };
$("#adm-salir").onclick = () => { LS.del("ce_admin"); location.reload(); };

// ------------------------------------------------------------------ panel
async function abrirPanel() {
  $("#v-lock").hidden = true; $("#v-adm").hidden = false;
  if (!backend) {
    cargando("Conectando…");
    try { backend = await crearBackend(); }
    catch (e) { cargando(null); toast("No se pudo conectar: " + (e.message || e), 5000); return; }
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
}

$("#adm-modo").onclick = (e) => {
  const b = e.target.closest("button"); if (!b) return;
  modo = b.dataset.m;
  document.querySelectorAll("#adm-modo button").forEach((x) => x.classList.toggle("on", x === b));
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
  render();
}
$("#adm-buscar").onclick = consultar;
$("#adm-filtro").oninput = () => render();
$("#adm-vista").onclick = (e) => {
  const c = e.target.closest(".chip"); if (!c) return;
  vista = c.dataset.v;
  document.querySelectorAll("#adm-vista .chip").forEach((x) => x.classList.toggle("on", x === c));
  render();
};

function filtrados() {
  const q = norm($("#adm-filtro").value);
  return resultados.filter((m) => !q || norm([m.usuario, ...(m.codigos || []), m.tipo, m.nota,
    ...(m.codigos || []).flatMap((c) => CAT[c]?.asignados || [])].join(" ")).includes(q));
}

function hora(ts) { return new Date(ts).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false }); }
function fechaCorta(ts) { return new Date(ts).toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" }); }
function eqTxt(m) { return (m.equipos || []).map((i) => `${NT[i.tipo] || i.tipo} ${i.codigo}`).join(" · "); }

function render() {
  const lista = filtrados();
  const ret = lista.filter((m) => m.tipo === "retiro").length;
  $("#adm-stats").innerHTML = `<div class="stat"><b>${lista.length}</b><span>Movimientos</span></div>
    <div class="stat"><b>${ret}</b><span>Retiros</span></div><div class="stat"><b>${lista.length - ret}</b><span>Devoluciones</span></div>`;
  const cont = $("#adm-lista");
  if (!lista.length) { cont.innerHTML = `<p class="vacio-msg">Sin registros en ${esc(periodo?.texto || "el periodo")}</p>`; return; }

  if (vista === "fotos") {
    const conFoto = lista.filter((m) => m.fotoId);
    cont.innerHTML = conFoto.length ? `<div class="grid-fotos">${conFoto.map((m) => `<button class="gf" data-m="${m.id}">
      <img data-f="${m.fotoId}" alt="">
      <div><span class="tag ${m.tipo === "retiro" ? "ret" : "dev"}">${m.tipo === "retiro" ? "RETIRO" : "DEVOL."}</span>${fechaCorta(m.ts)} ${hora(m.ts)}
      <b>${esc(m.usuario)}</b>${esc(eqTxt(m))}</div></button>`).join("")}</div>` : `<p class="vacio-msg">Sin fotos en este periodo</p>`;
  } else {
    let html = "", diaAnt = "";
    for (const m of lista) {
      const d = new Date(m.ts).toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" });
      if (d !== diaAnt) { if (diaAnt) html += `</div>`; html += `<p class="dia-sep">${d}</p><div class="lista-mov">`; diaAnt = d; }
      const r = m.tipo === "retiro";
      html += `<button class="mov" data-m="${m.id}">${m.fotoId ? `<img class="th" data-f="${m.fotoId}" alt="">` : `<div class="ico ${r ? "ret" : "dev"}">${r ? "↑" : "↓"}</div>`}
        <div class="cuerpo"><div class="q">${esc(m.usuario)}</div><div class="d">${r ? "Retiró" : "Devolvió"} ${esc(eqTxt(m))}</div>
        ${(m.avisos || []).length ? `<div class="aviso">⚠ ${esc(m.avisos.join("; "))}</div>` : ""}</div>
        <div class="h"><span class="pill ${r ? "uso" : "disp"}">${r ? "Retiro" : "Devol."}</span><br>${hora(m.ts)}</div></button>`;
    }
    cont.innerHTML = html + "</div>";
  }
  observarFotos();
}

// carga perezosa de fotos (solo las que aparecen en pantalla)
const io = "IntersectionObserver" in window ? new IntersectionObserver((ents) => {
  ents.forEach((en) => { if (en.isIntersecting) { io.unobserve(en.target); ponerFoto(en.target); } });
}, { rootMargin: "300px" }) : null;
function observarFotos() {
  document.querySelectorAll("#adm-lista img[data-f]").forEach((img) => (io ? io.observe(img) : ponerFoto(img)));
}
async function foto(id) {
  if (fotosCache.has(id)) return fotosCache.get(id);
  const p = backend.getFoto(id).catch(() => null);
  fotosCache.set(id, p);
  return p;
}
async function ponerFoto(img) { const d = await foto(img.dataset.f); if (d) img.src = d; }

$("#adm-lista").onclick = async (e) => {
  const b = e.target.closest("[data-m]"); if (!b) return;
  const m = resultados.find((x) => x.id === b.dataset.m); if (!m) return;
  const r = m.tipo === "retiro";
  $("#hoja-cont").innerHTML = `<div class="det-cab"><div><h2 class="h-lg">${r ? "Retiro" : "Devolución"}</h2>
      <span class="sub">${new Date(m.ts).toLocaleString("es-PE")}</span></div></div>
    <div class="det-tabla"><div><span>Persona</span><b>${esc(m.usuario)}</b></div>
      ${(m.equipos || []).map((i) => `<div><span>${NT[i.tipo] || i.tipo}</span><b>${i.codigo} · ${esc((CAT[i.codigo]?.asignados || []).join(" / "))}</b></div>`).join("")}
      ${m.nota ? `<div><span>Observación</span><b>${esc(m.nota)}</b></div>` : ""}
      ${(m.avisos || []).length ? `<div><span>Aviso</span><b style="color:var(--rojo)">${esc(m.avisos.join("; "))}</b></div>` : ""}</div>
    ${m.fotoId ? `<img class="det-foto" id="det-foto" alt="Cargando foto…" style="max-height:none">
      <button class="btn btn-sec" id="det-desc" style="margin-top:8px">⬇ Descargar foto</button>` : `<p class="vacio-msg">Sin foto</p>`}`;
  $("#hoja").hidden = false;
  if (m.fotoId) {
    const d = await foto(m.fotoId);
    if (d) {
      $("#det-foto").src = d;
      $("#det-desc").onclick = () => {
        const a = document.createElement("a"); a.href = d;
        a.download = `${new Date(m.ts).toISOString().slice(0, 16).replace(/[:T]/g, "-")}_${m.tipo}_${(m.codigos || []).join("-")}.jpg`;
        a.click();
      };
    } else $("#det-foto").alt = "Foto no disponible";
  }
};

// ------------------------------------------------------------------ exportar CSV
$("#adm-csv").onclick = () => {
  const lista = filtrados();
  if (!lista.length) return toast("No hay registros para exportar");
  const filas = [["Fecha", "Hora", "Movimiento", "Persona", "PDA", "Asignado PDA", "Radio", "Asignado Radio", "Foto", "Observación", "Avisos"]];
  [...lista].reverse().forEach((m) => {
    const d = new Date(m.ts);
    const de = (t) => (m.equipos || []).filter((i) => i.tipo === t).map((i) => i.codigo);
    const asig = (cods) => cods.map((c) => (CAT[c]?.asignados || []).join(" / ")).join(" | ");
    filas.push([d.toLocaleDateString("es-PE"), d.toLocaleTimeString("es-PE", { hour12: false }),
      m.tipo === "retiro" ? "Retiro" : "Devolución", m.usuario,
      de("PDA").join(" "), asig(de("PDA")), de("RADIO").join(" "), asig(de("RADIO")),
      m.fotoId ? "Sí" : "No", m.nota || "", (m.avisos || []).join("; ")]);
  });
  const csv = "﻿" + filas.map((f) => f.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `registros_equipos_${periodo.nombre}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(`CSV con ${lista.length} registros`);
};

// ------------------------------------------------------------------ borrar datos (solo modo pruebas)
$("#adm-borrar").onclick = async () => {
  const ok = await dialogo(`<p><b>Se borrarán TODOS los movimientos, fotos y estados de equipos.</b> No se puede deshacer.</p>
    <p style="margin:0">Escribe <b>BORRAR</b> para confirmar:</p><input id="dlg-conf" class="input" autocomplete="off">`, "Borrar todo");
  if (!ok) return;
  if ($("#dlg-conf").value.trim().toUpperCase() !== "BORRAR") return toast("No se escribió BORRAR. No se borró nada.");
  cargando("Borrando…");
  try {
    const n = await backend.borrarTodo((h, t) => cargando(`Borrando… ${h} / ${t}`));
    toast(`Listo: ${n} documentos borrados`, 3500);
    fotosCache.clear(); resultados = []; render();
  } catch (e) {
    console.error(e);
    toast("No se pudo borrar. ¿Está activo modoPruebas y publicadas las reglas nuevas?", 6000);
  }
  cargando(null);
};

// ------------------------------------------------------------------ arranque
if (sesionValida()) abrirPanel();
else { $("#v-lock").hidden = false; setTimeout(() => $("#lock-cod").focus(), 100); }
