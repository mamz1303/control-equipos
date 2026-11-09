import { EQUIPOS, PERSONAL, AJUSTES } from "./config.js";
import { crearBackend } from "./backend.js";
import { escanearQR, codigoDesdeQR } from "./scanner.js";
import { comprimirFoto } from "./imagen.js";

// ------------------------------------------------------------------ utilidades
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const CAT = Object.fromEntries(EQUIPOS.map((e) => [e.codigo, e]));
const TIPOS = ["PDA", "RADIO"];
const NOMBRE_TIPO = { PDA: "PDA", RADIO: "Radio" };
const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};

function hora(ts) {
  if (!ts) return "—";
  const d = new Date(ts), hoy = new Date();
  const hh = d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (d.toDateString() === hoy.toDateString()) return "hoy " + hh;
  const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === ayer.toDateString()) return "ayer " + hh;
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" }) + " " + hh;
}
function duracion(ts) {
  if (!ts) return "";
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (m < 60) return m + " min";
  const h = Math.floor(m / 60), r = m % 60;
  return h < 24 ? `${h} h ${r ? r + " min" : ""}`.trim() : `${Math.floor(h / 24)} d ${h % 24} h`;
}

// Íconos ilustrados de equipos
function icono(tipo, oscuro = false) {
  const cuerpo = oscuro ? "#FFFFFF" : "#0A2F6B";
  const pant = oscuro ? "#0A2F6B" : "#BFD3F2";
  const det = oscuro ? "#0A2F6B" : "#FFFFFF";
  if (tipo === "PDA") {
    return `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="22" y="3" width="20" height="9" rx="3" fill="#F47B20"/>
      <rect x="14" y="9" width="36" height="52" rx="8" fill="${cuerpo}"/><rect x="19" y="14" width="26" height="19" rx="2.5" fill="${pant}"/>
      <rect x="22" y="19" width="14" height="2.5" rx="1" fill="${cuerpo}" opacity=".35"/><rect x="22" y="24" width="18" height="2.5" rx="1" fill="${cuerpo}" opacity=".35"/>
      ${[0, 1, 2].map((r) => [0, 1, 2].map((c) => `<rect x="${20.5 + c * 8.5}" y="${38 + r * 6.5}" width="6" height="4" rx="1.3" fill="${det}"/>`).join("")).join("")}
      <rect x="27" y="57" width="10" height="2" rx="1" fill="#F47B20"/></svg>`;
  }
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="18" y="1" width="6" height="18" rx="3" fill="${oscuro ? "#FFFFFF" : "#14213D"}"/>
    <rect x="36" y="5" width="8" height="9" rx="2" fill="#F47B20"/><rect x="10" y="26" width="5" height="13" rx="2" fill="#F47B20"/>
    <rect x="14" y="12" width="36" height="50" rx="8" fill="${cuerpo}"/><rect x="20" y="18" width="24" height="11" rx="2.5" fill="${pant}"/>
    ${[0, 1, 2, 3, 4].map((i) => `<rect x="21" y="${35 + i * 4.5}" width="22" height="2.2" rx="1.1" fill="${det}"/>`).join("")}</svg>`;
}
const ICO_QR = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h7v7H3V3Zm2 2v3h3V5H5Zm9-2h7v7h-7V3Zm2 2v3h3V5h-3ZM3 14h7v7H3v-7Zm2 2v3h3v-3H5Zm9-2h2v2h-2v-2Zm2 2h2v2h-2v-2Zm2-2h3v2h-3v-2Zm-4 4h2v3h-2v-3Zm4 0h3v3h-2v-1h-1v-2Z"/></svg>`;
const ICO_SALE = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14V3ZM5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/></svg>`;
const ICO_ENTRA = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-8v-2h8V5h-8V3Zm-.6 4.6L15.8 12l-5.4 4.4V13H3v-2h7.4V7.6Z"/></svg>`;

// ------------------------------------------------------------------ estado
let backend;
let usuario = LS.get("ce_usuario");     // { nombre }
let estados = {};                        // codigo -> doc de estado
let listo = false;
let movs = [], offMovs = null;
let form = null;
let pendienteEq = new URLSearchParams(location.search).get("eq");
let filtroTipo = "", filtroEst = "";

const est = (c) => estados[c] || { estado: "disponible" };
const enUso = (c) => est(c).estado === "en_uso";
const misEquipos = () => usuario ? EQUIPOS.filter((e) => enUso(e.codigo) && est(e.codigo).usuario === usuario.nombre) : [];
const esMio = (e) => usuario && e.asignados.some((a) => norm(a) === norm(usuario.nombre));
const muyLargo = (c) => enUso(c) && (Date.now() - (est(c).desde || Date.now())) > AJUSTES.alertaHorasEnUso * 3600e3;

// ------------------------------------------------------------------ navegación
const VISTAS = ["v-registro", "v-inicio", "v-mov", "v-ok", "v-panel", "v-hist"];
let vistaActual = null;
function mostrar(id) {
  VISTAS.forEach((v) => ($("#" + v).hidden = v !== id));
  vistaActual = id;
  $("#toast").hidden = true;
  const conTab = ["v-inicio", "v-panel", "v-hist"].includes(id);
  $("#tabbar").hidden = !conTab;
  document.body.classList.toggle("sin-tab", !conTab);
  document.querySelectorAll(".tabbar button").forEach((b) => b.classList.toggle("on", b.dataset.tab === id));
  window.scrollTo(0, 0);
  if (id === "v-inicio") renderInicio();
  if (id === "v-panel") { suscribirMovs(); renderPanel(); }
  if (id === "v-hist") { suscribirMovs(); renderHist(); }
}
document.querySelectorAll(".tabbar button").forEach((b) => (b.onclick = () => mostrar(b.dataset.tab)));

// botón atrás de Android
window.addEventListener("popstate", () => {
  if (!$("#hoja").hidden) { $("#hoja").hidden = true; return; }
  if (vistaActual === "v-mov") mostrar("v-inicio");
});
function empujar() { history.pushState({ x: 1 }, ""); }

function toast(t, ms = 2600) {
  const el = $("#toast"); el.textContent = t; el.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (el.hidden = true), ms);
}
function confirmar(html, si = "Sí, continuar") {
  return new Promise((res) => {
    $("#dlg-txt").innerHTML = html; $("#dlg-si").textContent = si; $("#dialogo").hidden = false;
    $("#dlg-si").onclick = () => { $("#dialogo").hidden = true; res(true); };
    $("#dlg-no").onclick = () => { $("#dialogo").hidden = true; res(false); };
  });
}
function abrirHoja(html) { $("#hoja-cont").innerHTML = html; $("#hoja").hidden = false; empujar(); }
$("#hoja .hoja-x").onclick = () => history.back();
$("#hoja").onclick = (e) => { if (e.target.id === "hoja") history.back(); };

// ------------------------------------------------------------------ registro
let regSel = null;
function renderRegistro() {
  const q = norm($("#reg-buscar").value);
  const lista = PERSONAL.filter((n) => !q || norm(n).includes(q));
  $("#reg-lista").innerHTML = lista.map((n) => {
    const eqs = EQUIPOS.filter((e) => e.asignados.includes(n)).map((e) => `${NOMBRE_TIPO[e.tipo]} ${e.codigo}`).join(" · ");
    return `<button class="nombre ${regSel === n ? "on" : ""}" data-n="${esc(n)}">${esc(n)}<small>${esc(eqs)}</small></button>`;
  }).join("") || `<p class="vacio-msg">No se encontró. Usa “No estoy en la lista”.</p>`;
  $("#reg-ok").disabled = !(regSel || $("#reg-otro").value.trim().length >= 3);
}
$("#reg-buscar").oninput = renderRegistro;
$("#reg-lista").onclick = (e) => {
  const b = e.target.closest(".nombre"); if (!b) return;
  regSel = b.dataset.n; $("#reg-otro").value = ""; renderRegistro();
};
$("#reg-otro").oninput = () => { regSel = null; renderRegistro(); };
$("#reg-ok").onclick = async () => {
  const nombre = regSel || $("#reg-otro").value.trim().replace(/\s+/g, " ");
  if (!nombre) return;
  usuario = { nombre, ts: Date.now() };
  LS.set("ce_usuario", usuario);
  backend.guardarUsuario(nombre).catch(() => {});
  mostrar("v-inicio");
  procesarDeepLink();
};
$("#ini-cambiar").onclick = async () => {
  if (await confirmar(`¿Cambiar de usuario? Se pedirá el nombre nuevamente en este celular.`, "Cambiar")) {
    LS.del("ce_usuario"); usuario = null; regSel = null; $("#reg-buscar").value = ""; renderRegistro(); mostrar("v-registro");
  }
};

// ------------------------------------------------------------------ inicio
function renderInicio() {
  if (!usuario) return;
  $("#ini-nombre").textContent = usuario.nombre;
  const mios = misEquipos();
  $("#ini-tengo").innerHTML = mios.length ? `<div class="tengo"><h3>Tienes en tu poder</h3>${mios.map((e) =>
    `<div class="tengo-item">${icono(e.tipo, true)}<div><b>${NOMBRE_TIPO[e.tipo]} ${e.codigo}</b><span>desde ${hora(est(e.codigo).desde)} · ${duracion(est(e.codigo).desde)}</span></div></div>`).join("")}</div>` : "";
  $("#ini-acciones").innerHTML = mios.length
    ? `<button class="btn btn-pri btn-grande" id="a-dev">${ICO_ENTRA}Devolver equipo</button>
       <button class="btn btn-sec" id="a-ret">Retirar otro equipo</button>`
    : `<button class="btn btn-pri btn-grande" id="a-ret">${ICO_SALE}Retirar equipo</button>`;
  $("#a-ret").onclick = () => abrirMov("retiro");
  if ($("#a-dev")) $("#a-dev").onclick = () => abrirMov("devolucion");
  const c = contar();
  $("#ini-resumen").innerHTML = TIPOS.map((t) => `<button class="res-card" data-t="${t}" style="border:0;text-align:left">
    <div class="n">${c[t].disp}<small> / ${c[t].total}</small></div><div class="l">${t === "PDA" ? "PDA" : "Radios"} disponibles</div></button>`).join("");
  $("#ini-resumen").onclick = (e) => {
    const b = e.target.closest("[data-t]"); if (!b) return;
    filtroTipo = b.dataset.t; filtroEst = "disponible"; sincChips(); mostrar("v-panel");
  };
}
function contar() {
  const c = { PDA: { total: 0, disp: 0 }, RADIO: { total: 0, disp: 0 } };
  EQUIPOS.forEach((e) => { c[e.tipo].total++; if (!enUso(e.codigo)) c[e.tipo].disp++; });
  return c;
}

// ------------------------------------------------------------------ formulario de movimiento
function abrirMov(tipo, codigoPreset = null) {
  form = { tipo, sel: { PDA: false, RADIO: false }, cod: { PDA: "", RADIO: "" }, foto: null, kb: 0 };
  if (tipo === "devolucion") {
    misEquipos().forEach((e) => { if (!form.sel[e.tipo]) { form.sel[e.tipo] = true; form.cod[e.tipo] = e.codigo; } });
  }
  if (codigoPreset && CAT[codigoPreset]) {
    const e = CAT[codigoPreset];
    form.sel[e.tipo] = true; form.cod[e.tipo] = e.codigo;
  }
  $("#mov-titulo").textContent = tipo === "retiro" ? "Retirar equipo" : "Devolver equipo";
  $("#mov-enviar").textContent = tipo === "retiro" ? "Registrar retiro" : "Registrar devolución";
  const fotoReq = tipo === "retiro" ? AJUSTES.fotoObligatoriaRetiro : AJUSTES.fotoObligatoriaDevolucion;
  $("#mov-foto-lbl").textContent = tipo === "retiro" ? "Foto de cómo recibes el equipo" : "Foto de cómo dejas el equipo";
  if (!fotoReq) $("#mov-foto-lbl").textContent += " (opcional)";
  $("#mov-nota").value = "";
  $("#mov-nota").closest("details").open = false;
  limpiarFoto();
  renderMov();
  empujar();
  mostrar("v-mov");
}
$("#mov-volver").onclick = () => history.back();

function codigoSugerido(tipo) {
  const lib = EQUIPOS.filter((e) => e.tipo === tipo && !enUso(e.codigo));
  return (lib.find(esMio) || {}).codigo || "";
}

function renderMov() {
  $("#mov-tiles").innerHTML = TIPOS.map((t) => `<button class="tile ${form.sel[t] ? "on" : ""}" data-t="${t}">
    <span class="check">✓</span>${icono(t)}${NOMBRE_TIPO[t]}<span class="tile-sub">${form.sel[t] ? "Seleccionado" : "Tocar para elegir"}</span></button>`).join("");
  $("#mov-codigos").innerHTML = TIPOS.filter((t) => form.sel[t]).map((t) => `<div class="cod-row">
      <div class="cod-top"><span class="t">CÓDIGO ${NOMBRE_TIPO[t].toUpperCase()}</span></div>
      <div class="cod-sel"><select data-t="${t}" class="${form.cod[t] ? "" : "vacio"}">${opciones(t)}</select>
      <button class="btn-qr" data-qr="${t}">${ICO_QR}QR</button></div>
      <div class="cod-info ${infoCodigo(t).cls}">${infoCodigo(t).txt}</div></div>`).join("");
}
function opciones(tipo) {
  const lista = EQUIPOS.filter((e) => e.tipo === tipo);
  const lab = (e) => `${e.codigo} — ${e.asignados.join(" / ") || "Sin asignar"}`;
  const opt = (e) => `<option value="${e.codigo}" ${form.cod[tipo] === e.codigo ? "selected" : ""}>${esc(lab(e))}</option>`;
  const grupo = (titulo, arr) => arr.length ? `<optgroup label="${titulo}">${arr.map(opt).join("")}</optgroup>` : "";
  let html = `<option value="">Elegir o escanear código…</option>`;
  if (form.tipo === "retiro") {
    html += grupo("Asignados a ti", lista.filter((e) => esMio(e) && !enUso(e.codigo)));
    html += grupo("Disponibles", lista.filter((e) => !esMio(e) && !enUso(e.codigo)));
    html += grupo("En uso (figura con otra persona)", lista.filter((e) => enUso(e.codigo)));
  } else {
    html += grupo("En tu poder", lista.filter((e) => enUso(e.codigo) && est(e.codigo).usuario === usuario.nombre));
    html += grupo("Otros equipos", lista.filter((e) => !(enUso(e.codigo) && est(e.codigo).usuario === usuario.nombre)));
  }
  return html;
}
function infoCodigo(t) {
  const c = form.cod[t];
  if (!c) return { cls: "", txt: "Escanea el QR del equipo o elígelo de la lista" };
  const e = CAT[c], s = est(c);
  const asig = `Asignado a ${e.asignados.join(" / ") || "nadie"}`;
  if (form.tipo === "retiro") {
    if (enUso(c) && s.usuario !== usuario.nombre) return { cls: "alerta", txt: `⚠ Figura con ${esc(s.usuario)} desde ${hora(s.desde)}` };
    if (enUso(c)) return { cls: "alerta", txt: `⚠ Ya figura contigo desde ${hora(s.desde)}` };
    return { cls: "ok", txt: `✓ Disponible · ${esc(asig)}` };
  }
  if (enUso(c) && s.usuario === usuario.nombre) return { cls: "ok", txt: `✓ Lo retiraste ${hora(s.desde)}` };
  if (enUso(c)) return { cls: "alerta", txt: `⚠ Figura con ${esc(s.usuario)} (lo devuelves por él/ella)` };
  return { cls: "alerta", txt: "⚠ Este equipo ya figura como disponible" };
}
$("#mov-tiles").onclick = (e) => {
  const b = e.target.closest(".tile"); if (!b) return;
  const t = b.dataset.t;
  form.sel[t] = !form.sel[t];
  if (form.sel[t] && !form.cod[t]) {
    if (form.tipo === "retiro") form.cod[t] = codigoSugerido(t);
    else form.cod[t] = (misEquipos().find((x) => x.tipo === t) || {}).codigo || "";
  }
  if (!form.sel[t]) form.cod[t] = "";
  renderMov();
};
$("#mov-codigos").onchange = (e) => {
  const s = e.target.closest("select"); if (!s) return;
  form.cod[s.dataset.t] = s.value; renderMov();
};
$("#mov-codigos").onclick = async (e) => {
  const b = e.target.closest("[data-qr]"); if (!b) return;
  const t = b.dataset.qr;
  const txt = await escanearQR({ titulo: t === "PDA" ? "Escanea el QR del PDA" : "Escanea el QR de la radio" });
  if (!txt) return;
  const c = codigoDesdeQR(txt);
  if (!c || !CAT[c]) return toast(`QR no reconocido: ${String(txt).slice(0, 40)}`);
  const eq = CAT[c];
  if (eq.tipo !== t) { form.sel[eq.tipo] = true; toast(`El código ${c} es ${NOMBRE_TIPO[eq.tipo]}; se agregó como ${NOMBRE_TIPO[eq.tipo]}`); }
  form.cod[eq.tipo] = c;
  renderMov();
};

// foto
function limpiarFoto() {
  form && (form.foto = null);
  $("#mov-foto").value = "";
  $("#mov-foto-prev").hidden = true; $("#mov-foto-kb").hidden = true;
  $(".foto-vacia").hidden = false; $("#mov-foto-box").classList.remove("lista");
}
$("#mov-foto").onchange = async (e) => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  $(".foto-vacia span").textContent = "Procesando…";
  try {
    const r = await comprimirFoto(f, AJUSTES.fotoPesoObjetivoKB, AJUSTES.fotoLadoMaximo);
    form.foto = r.dataUrl; form.kb = r.kb;
    $("#mov-foto-prev").src = r.dataUrl; $("#mov-foto-prev").hidden = false;
    $("#mov-foto-kb").textContent = `${r.kb} KB · tocar para cambiar`; $("#mov-foto-kb").hidden = false;
    $(".foto-vacia").hidden = true; $("#mov-foto-box").classList.add("lista");
  } catch (err) {
    console.error(err); toast("No se pudo procesar la foto, intenta otra vez");
  } finally { $(".foto-vacia span").textContent = "Tomar foto"; }
};

// enviar
$("#mov-enviar").onclick = async () => {
  const btn = $("#mov-enviar");
  const tipos = TIPOS.filter((t) => form.sel[t]);
  if (!tipos.length) return toast("Elige PDA, Radio o ambos");
  const falta = tipos.find((t) => !form.cod[t]);
  if (falta) return toast(`Falta el código de ${NOMBRE_TIPO[falta]}`);
  const fotoReq = form.tipo === "retiro" ? AJUSTES.fotoObligatoriaRetiro : AJUSTES.fotoObligatoriaDevolucion;
  if (fotoReq && !form.foto) return toast("Toma la foto del equipo");

  const items = tipos.map((t) => ({ codigo: form.cod[t], tipo: t }));
  const avisos = [];
  for (const it of items) {
    const s = est(it.codigo);
    if (form.tipo === "retiro" && enUso(it.codigo)) {
      const quien = s.usuario === usuario.nombre ? "ti" : s.usuario;
      if (!(await confirmar(`<b>${NOMBRE_TIPO[it.tipo]} ${it.codigo}</b> figura con <b>${esc(quien)}</b> desde ${hora(s.desde)}.<br><br>¿Registrar el retiro igual? Quedará anotado en el historial.`))) return;
      avisos.push(`${it.codigo} figuraba con ${s.usuario}`);
    }
    if (form.tipo === "devolucion" && !enUso(it.codigo)) avisos.push(`${it.codigo} ya figuraba disponible`);
    if (form.tipo === "devolucion" && enUso(it.codigo) && s.usuario !== usuario.nombre) {
      if (!(await confirmar(`<b>${NOMBRE_TIPO[it.tipo]} ${it.codigo}</b> figura con <b>${esc(s.usuario)}</b>.<br><br>¿Lo estás devolviendo en su nombre?`))) return;
      avisos.push(`${it.codigo} devuelto por ${usuario.nombre} (figuraba con ${s.usuario})`);
    }
  }

  btn.disabled = true; btn.textContent = "Enviando…";
  try {
    const ts = Date.now();
    const r = await backend.registrar({ tipo: form.tipo, usuario: usuario.nombre, items, foto: form.foto, nota: $("#mov-nota").value.trim(), avisos, ts });
    const det = items.map((i) => `${NOMBRE_TIPO[i.tipo]} ${i.codigo}`).join(" · ") + " · " + hora(ts);
    $("#ok-titulo").textContent = r === "pendiente" ? "Guardado sin señal" : (form.tipo === "retiro" ? "Retiro registrado" : "Devolución registrada");
    $("#ok-det").textContent = r === "pendiente" ? det + " — se enviará solo al recuperar señal" : det;
    $(".ok-circ").classList.toggle("pend", r === "pendiente");
    $(".ok-circ").textContent = r === "pendiente" ? "⟳" : "✓";
    if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
    history.replaceState(null, "");
    mostrar("v-ok");
    clearTimeout(okT); okT = setTimeout(() => vistaActual === "v-ok" && mostrar("v-inicio"), 5000);
  } catch (err) {
    console.error(err); toast("Error al registrar. Revisa tu conexión e inténtalo otra vez.", 4000);
  } finally {
    btn.disabled = false; btn.textContent = form.tipo === "retiro" ? "Registrar retiro" : "Registrar devolución";
  }
};
let okT = null;
$("#ok-listo").onclick = () => mostrar("v-inicio");

// ------------------------------------------------------------------ panel
function sincChips() {
  document.querySelectorAll("#pan-chips-tipo .chip").forEach((c) => c.classList.toggle("on", c.dataset.v === filtroTipo));
  document.querySelectorAll("#pan-chips-est .chip").forEach((c) => c.classList.toggle("on", c.dataset.v === filtroEst));
}
$("#pan-chips-tipo").onclick = (e) => { const c = e.target.closest(".chip"); if (!c) return; filtroTipo = c.dataset.v; sincChips(); renderPanel(); };
$("#pan-chips-est").onclick = (e) => { const c = e.target.closest(".chip"); if (!c) return; filtroEst = c.dataset.v; sincChips(); renderPanel(); };
$("#pan-buscar").oninput = () => renderPanel();

function renderPanel() {
  const c = contar();
  const uso = EQUIPOS.filter((e) => enUso(e.codigo)).length;
  $("#pan-cont").innerHTML = `
    <div class="res-card"><div class="n">${c.PDA.disp}<small> / ${c.PDA.total}</small></div><div class="l">PDA disponibles</div></div>
    <div class="res-card"><div class="n">${c.RADIO.disp}<small> / ${c.RADIO.total}</small></div><div class="l">Radios disponibles</div></div>`;
  const q = norm($("#pan-buscar").value);
  const lista = EQUIPOS.filter((e) => {
    if (filtroTipo && e.tipo !== filtroTipo) return false;
    const s = est(e.codigo);
    if (filtroEst && (filtroEst === "en_uso") !== enUso(e.codigo)) return false;
    if (!q) return true;
    return norm([e.codigo, e.tipo, ...e.asignados, s.usuario, s.ultimoUsuario].join(" ")).includes(q);
  }).sort((a, b) => (a.tipo === b.tipo ? a.codigo.localeCompare(b.codigo) : a.tipo === "PDA" ? -1 : 1));

  $("#pan-lista").innerHTML = lista.map((e) => {
    const s = est(e.codigo), u = enUso(e.codigo), largo = muyLargo(e.codigo);
    return `<button class="eq ${u ? "uso" : ""} ${largo ? "largo" : ""}" data-c="${e.codigo}">${icono(e.tipo)}
      <div class="cuerpo"><div class="cod">${e.codigo}<small>${e.tipo}</small></div><div class="asig">${esc(e.asignados.join(" / ") || "Sin asignar")}</div></div>
      <div class="estado">${u ? `<span class="pill ${largo ? "largo" : "uso"}">En uso</span><div class="quien">${esc(s.usuario)}</div><div class="cuando">${hora(s.desde)} · ${duracion(s.desde)}</div>`
        : `<span class="pill disp">Disponible</span>${s.ultimoUsuario ? `<div class="cuando">devuelto ${hora(s.desde)}</div>` : ""}`}</div></button>`;
  }).join("") || `<p class="vacio-msg">Sin resultados${q ? ` para “${esc($("#pan-buscar").value)}”` : ""}</p>`;
}
$("#pan-lista").onclick = (e) => { const b = e.target.closest(".eq"); if (b) detalleEquipo(b.dataset.c); };

async function detalleEquipo(c) {
  const e = CAT[c], s = est(c), u = enUso(c);
  const hist = movs.filter((m) => (m.codigos || []).includes(c)).slice(0, 12);
  abrirHoja(`<div class="det-cab">${icono(e.tipo)}<div><h2 class="h-lg">${NOMBRE_TIPO[e.tipo]} ${c}</h2>
      ${u ? `<span class="pill ${muyLargo(c) ? "largo" : "uso"}">En uso</span>` : `<span class="pill disp">Disponible</span>`}</div></div>
    <div class="det-tabla">
      ${u ? `<div><span>Lo tiene</span><b>${esc(s.usuario)}</b></div><div><span>Desde</span><b>${hora(s.desde)} (${duracion(s.desde)})</b></div>` : ""}
      ${!u && s.ultimoUsuario ? `<div><span>Último en usarlo</span><b>${esc(s.ultimoUsuario)}</b></div><div><span>Devuelto</span><b>${hora(s.desde)}</b></div>` : ""}
      <div><span>Asignado a</span><b>${esc(e.asignados.join(" / ") || "—")}</b></div>
    </div>
    ${s.fotoId ? `<p class="h-sec">Foto del último movimiento</p><img class="det-foto" id="det-foto" alt="Foto del equipo">` : ""}
    <p class="h-sec">Movimientos de hoy</p>
    <div class="lista-mov">${hist.map(htmlMov).join("") || `<p class="vacio-msg">Sin movimientos hoy</p>`}</div>`);
  if (s.fotoId) cargarFoto(s.fotoId, $("#det-foto"));
}
async function cargarFoto(id, img) {
  try { const d = await backend.getFoto(id); if (d && img) img.src = d; else if (img) img.alt = "Foto no disponible"; } catch { }
}

// ------------------------------------------------------------------ historial (solo HOY)
const inicioDia = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
let diaSub = 0;
function suscribirMovs() {
  const hoy = inicioDia();
  if (offMovs && diaSub === hoy) return;
  if (offMovs) offMovs();
  diaSub = hoy;
  offMovs = backend.onMovimientosDesde(hoy, (lista) => {
    movs = lista;
    if (vistaActual === "v-hist") renderHist();
  });
}
function htmlMov(m) {
  const r = m.tipo === "retiro";
  const eqs = (m.equipos || []).map((i) => `${NOMBRE_TIPO[i.tipo] || i.tipo} ${i.codigo}`).join(" · ");
  return `<button class="mov" data-m="${m.id}"><div class="ico ${r ? "ret" : "dev"}">${r ? "↑" : "↓"}</div>
    <div class="cuerpo"><div class="q">${esc(m.usuario)}</div><div class="d">${r ? "Retiró" : "Devolvió"} ${esc(eqs)}${m.fotoId ? " · 📷" : ""}</div>
    ${(m.avisos || []).length ? `<div class="aviso">⚠ ${esc(m.avisos.join("; "))}</div>` : ""}</div><div class="h">${hora(m.ts)}</div></button>`;
}
function renderHist() {
  const q = norm($("#his-buscar").value);
  const lista = movs.filter((m) => !q || norm([m.usuario, ...(m.codigos || []), m.tipo, m.nota].join(" ")).includes(q));
  $("#his-lista").innerHTML = lista.map(htmlMov).join("") || `<p class="vacio-msg">${movs.length ? "Sin coincidencias" : "Aún no hay movimientos hoy"}</p>`;
}
$("#his-buscar").oninput = renderHist;
document.addEventListener("click", (e) => {
  const b = e.target.closest(".mov"); if (!b) return;
  const m = movs.find((x) => x.id === b.dataset.m); if (!m) return;
  const r = m.tipo === "retiro";
  abrirHoja(`<div class="det-cab"><div class="mov" style="box-shadow:none;padding:0;background:none"><div class="ico ${r ? "ret" : "dev"}">${r ? "↑" : "↓"}</div></div>
      <div><h2 class="h-lg">${r ? "Retiro" : "Devolución"}</h2><span class="sub">${new Date(m.ts).toLocaleString("es-PE")}</span></div></div>
    <div class="det-tabla"><div><span>Persona</span><b>${esc(m.usuario)}</b></div>
      ${(m.equipos || []).map((i) => `<div><span>${NOMBRE_TIPO[i.tipo] || i.tipo}</span><b>${i.codigo} · ${esc((CAT[i.codigo]?.asignados || []).join(" / "))}</b></div>`).join("")}
      ${m.nota ? `<div><span>Observación</span><b>${esc(m.nota)}</b></div>` : ""}
      ${(m.avisos || []).length ? `<div><span>Aviso</span><b style="color:var(--rojo)">${esc(m.avisos.join("; "))}</b></div>` : ""}</div>
    ${m.fotoId ? `<img class="det-foto" id="mov-foto-det" alt="Cargando foto…">` : `<p class="vacio-msg">Sin foto</p>`}`);
  if (m.fotoId) cargarFoto(m.fotoId, $("#mov-foto-det"));
});

// ------------------------------------------------------------------ enlace directo desde QR del equipo (?eq=2853)
function procesarDeepLink() {
  if (!pendienteEq || !usuario || !listo) return;
  const c = pendienteEq; pendienteEq = null;
  history.replaceState(null, "", location.pathname);
  if (!CAT[c]) return toast(`Código ${c} no está en el catálogo`);
  const mio = enUso(c) && est(c).usuario === usuario.nombre;
  abrirMov(mio ? "devolucion" : "retiro", c);
}

// ------------------------------------------------------------------ arranque
function actualizarConexion() { $("#banner-offline").hidden = navigator.onLine; }
window.addEventListener("online", actualizarConexion);
window.addEventListener("offline", actualizarConexion);

async function iniciar() {
  actualizarConexion();
  try {
    backend = await crearBackend();
  } catch (e) {
    console.error(e);
    $("#cargando").innerHTML = `<p style="padding:20px;text-align:center">No se pudo conectar con el servidor.<br><small>${esc(e.message || e)}</small><br><br><button class="btn btn-pri" onclick="location.reload()">Reintentar</button></p>`;
    return;
  }
  backend.onEquipos((m) => {
    estados = m;
    const primera = !listo;
    listo = true;
    if (primera) {
      $("#cargando").hidden = true;
      if (!usuario) { renderRegistro(); mostrar("v-registro"); }
      else { mostrar("v-inicio"); procesarDeepLink(); }
      return;
    }
    if (vistaActual === "v-inicio") renderInicio();
    if (vistaActual === "v-panel") renderPanel();
    if (vistaActual === "v-mov") renderMov(); // refresca alertas sin perder la selección
  });
  setInterval(() => {
    if (offMovs && diaSub !== inicioDia()) suscribirMovs(); // cambio de día
    if (vistaActual === "v-inicio") renderInicio();
    if (vistaActual === "v-panel") renderPanel();
  }, 60000);
}
iniciar();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
