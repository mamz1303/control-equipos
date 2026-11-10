import { AJUSTES } from "./config.js";
import { crearBackend } from "./backend.js";
import { construirCatalogo, norm, plural } from "./catalogo.js";
import { icono } from "./iconos.js";
import { escanearQR, codigoDesdeQR } from "./scanner.js";
import { comprimirFoto } from "./imagen.js";
import { leerAjustes, vencido, cierreSiguiente, horaCorta } from "./turnos.js";

// ------------------------------------------------------------------ utilidades
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
const ICO_QR = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h7v7H3V3Zm2 2v3h3V5H5Zm9-2h7v7h-7V3Zm2 2v3h3V5h-3ZM3 14h7v7H3v-7Zm2 2v3h3v-3H5Zm9-2h2v2h-2v-2Zm2 2h2v2h-2v-2Zm2-2h3v2h-3v-2Zm-4 4h2v3h-2v-3Zm4 0h3v3h-2v-1h-1v-2Z"/></svg>`;
const ICO_SALE = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14V3ZM5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/></svg>`;
const ICO_ENTRA = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-8v-2h8V5h-8V3Zm-.6 4.6L15.8 12l-5.4 4.4V13H3v-2h7.4V7.6Z"/></svg>`;

// ------------------------------------------------------------------ estado
let backend;
let usuario = LS.get("ce_usuario");          // { id, nombre }
const fsData = { tipos: {}, personal: {}, equipos: {} };
const cargadas = new Set();
let cat = construirCatalogo(fsData);
let listo = false;
let movs = [], offMovs = null, diaSub = 0;
let form = null;
let pendienteEq = new URLSearchParams(location.search).get("eq");
let filtroTipo = "", filtroEst = "";
let aj = leerAjustes(null);

const nombreTipo = (c) => cat.tipo(c).nombre;
const icoTipo = (c, osc) => icono(cat.tipo(c).icono, osc);
const enUso = (e) => e && e.estado === "en_uso";
const loTengoYo = (e) => usuario && enUso(e) && (e.usuarioId && usuario.id ? e.usuarioId === usuario.id : e.usuario === usuario.nombre);
const asignadoAMi = (e) => usuario && usuario.id && (e.asignados || []).includes(usuario.id);
const misEquipos = () => cat.equipos.filter(loTengoYo);
const enRevision = (e) => e && e.estado === "revision";
const libre = (e) => e && !enUso(e) && !enRevision(e);
// "no devuelto": pasó el cierre de su turno (+ tolerancia). Sin turnos configurados, usa las horas de config.js
const muyLargo = (e) => aj.cierres.length ? vencido(e, aj) : enUso(e) && (Date.now() - (e.desde || Date.now())) > AJUSTES.alertaHorasEnUso * 3600e3;
const asignadosTxt = (e) => cat.nombres(e.asignados).join(" / ") || "Sin asignar";

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
  if (id === "v-registro") renderRegistro();
  if (id === "v-inicio") renderInicio();
  if (id === "v-panel") { suscribirMovs(); renderPanel(); }
  if (id === "v-hist") { suscribirMovs(); renderHist(); }
}
document.querySelectorAll(".tabbar button").forEach((b) => (b.onclick = () => mostrar(b.dataset.tab)));
window.addEventListener("popstate", () => {
  if (!$("#hoja").hidden) { $("#hoja").hidden = true; return; }
  if (vistaActual === "v-mov") mostrar("v-inicio");
});
const empujar = () => history.pushState({ x: 1 }, "");
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

// ------------------------------------------------------------------ usuario / registro
// Mantiene el usuario local al día con el personal (correcciones de nombre, reemplazos)
function sincronizarUsuario() {
  if (!usuario) return true;
  const p = usuario.id ? cat.persona(usuario.id) : cat.personaPorNombre(usuario.nombre);
  if (p && p.activo === false) {
    LS.del("ce_usuario"); usuario = null;
    const nuevo = p.reemplazadoPor ? cat.persona(p.reemplazadoPor) : null;
    toast(nuevo ? `Tu usuario fue reemplazado por ${nuevo.nombre}. Elige tu nombre.` : "Tu usuario fue dado de baja. Elige tu nombre.", 5000);
    return false;
  }
  if (p && (p.id !== usuario.id || p.nombre !== usuario.nombre)) {
    usuario = { ...usuario, id: p.id, nombre: p.nombre }; LS.set("ce_usuario", usuario);
  }
  return true;
}

let regSel = null;
function renderRegistro() {
  const q = norm($("#reg-buscar").value);
  const lista = cat.personal.filter((p) => p.activo !== false && (!q || norm(p.nombre).includes(q)));
  $("#reg-lista").innerHTML = lista.map((p) => {
    const eqs = cat.equiposActivos().filter((e) => (e.asignados || []).includes(p.id)).map((e) => `${nombreTipo(e.tipo)} ${e.codigo}`).join(" · ");
    return `<button class="nombre ${regSel === p.id ? "on" : ""}" data-id="${esc(p.id)}">${esc(p.nombre)}<small>${esc(eqs)}</small></button>`;
  }).join("") || `<p class="vacio-msg">No se encontró. Usa “No estoy en la lista”.</p>`;
  $("#reg-ok").disabled = !(regSel || $("#reg-otro").value.trim().length >= 3);
}
$("#reg-buscar").oninput = renderRegistro;
$("#reg-lista").onclick = (e) => {
  const b = e.target.closest(".nombre"); if (!b) return;
  regSel = b.dataset.id; $("#reg-otro").value = ""; renderRegistro();
};
$("#reg-otro").oninput = () => { regSel = null; renderRegistro(); };
$("#reg-ok").onclick = () => {
  const p = regSel ? cat.persona(regSel) : null;
  const nombre = p ? p.nombre : $("#reg-otro").value.trim().replace(/\s+/g, " ");
  if (!nombre) return;
  const existente = p || cat.personaPorNombre(nombre);
  usuario = { id: existente?.id || null, nombre: existente?.nombre || nombre, ts: Date.now() };
  LS.set("ce_usuario", usuario);
  backend.guardarUsuario(usuario.nombre, usuario.id).catch(() => {});
  mostrar("v-inicio");
  procesarDeepLink();
};
$("#ini-cambiar").onclick = async () => {
  if (await confirmar(`¿Cambiar de usuario? Se pedirá el nombre nuevamente en este celular.`, "Cambiar")) {
    LS.del("ce_usuario"); usuario = null; regSel = null; $("#reg-buscar").value = ""; mostrar("v-registro");
  }
};

// ------------------------------------------------------------------ inicio
function contar() {
  return cat.tiposActivos().map((t) => {
    const l = cat.equiposActivos().filter((e) => e.tipo === t.clave);
    return { t, total: l.length, disp: l.filter(libre).length };
  });
}
function tarjetasConteo() {
  return contar().map((c) => `<button class="res-card" data-t="${esc(c.t.clave)}">
    <div class="n">${c.disp}<small> / ${c.total}</small></div><div class="l">${esc(plural(c.t.nombre))} disponibles</div></button>`).join("");
}
function renderInicio() {
  if (!usuario) return;
  $("#ini-nombre").textContent = usuario.nombre;
  const mios = misEquipos();
  const venc = mios.filter(muyLargo);
  const alerta = venc.length ? `<div class="alerta-turno"><b>⚠ Devuelve tu equipo</b>${aj.cierres.length
    ? `Tu turno cerró a las ${horaCorta(cierreSiguiente(venc[0].desde, aj))}.` : "Lleva demasiadas horas fuera."} ${esc(venc.map((e) => `${nombreTipo(e.tipo)} ${e.codigo}`).join(" · "))}</div>` : "";
  $("#ini-tengo").innerHTML = alerta + (mios.length ? `<div class="tengo"><h3>Tienes en tu poder</h3>${mios.map((e) =>
    `<div class="tengo-item">${icoTipo(e.tipo, true)}<div><b>${esc(nombreTipo(e.tipo))} ${esc(e.codigo)}</b><span>desde ${hora(e.desde)} · ${duracion(e.desde)}${muyLargo(e) ? ` · <em class="rojo">no devuelto</em>` : ""}</span></div></div>`).join("")}</div>` : "");
  $("#ini-acciones").innerHTML = mios.length
    ? `<button class="btn btn-pri btn-grande" id="a-dev">${ICO_ENTRA}Devolver equipo</button>
       <button class="btn btn-sec" id="a-ret">Retirar otro equipo</button>`
    : `<button class="btn btn-pri btn-grande" id="a-ret">${ICO_SALE}Retirar equipo</button>`;
  $("#a-ret").onclick = () => abrirMov("retiro");
  if ($("#a-dev")) $("#a-dev").onclick = () => abrirMov("devolucion");
  $("#ini-resumen").innerHTML = tarjetasConteo();
}
$("#ini-resumen").onclick = (e) => {
  const b = e.target.closest("[data-t]"); if (!b) return;
  filtroTipo = b.dataset.t; filtroEst = "disponible"; mostrar("v-panel");
};

// ------------------------------------------------------------------ formulario de movimiento
function abrirMov(tipo, eqPreset = null) {
  form = { tipo, sel: {}, cod: {}, foto: null, kb: 0, dano: false, danoIds: new Set(), danoDesc: "" };
  if (tipo === "devolucion") misEquipos().forEach((e) => { if (!form.sel[e.tipo]) { form.sel[e.tipo] = true; form.cod[e.tipo] = e.id; } });
  if (eqPreset) { form.sel[eqPreset.tipo] = true; form.cod[eqPreset.tipo] = eqPreset.id; }
  $("#mov-titulo").textContent = tipo === "retiro" ? "Retirar equipo" : "Devolver equipo";
  $("#mov-enviar").textContent = tipo === "retiro" ? "Registrar retiro" : "Registrar devolución";
  const fotoReq = tipo === "retiro" ? AJUSTES.fotoObligatoriaRetiro : AJUSTES.fotoObligatoriaDevolucion;
  $("#mov-foto-lbl").textContent = (tipo === "retiro" ? "Foto de cómo recibes el equipo" : "Foto de cómo dejas el equipo") + (fotoReq ? "" : " (opcional)");
  $("#mov-nota").value = ""; $("#mov-nota").closest("details").open = false;
  limpiarFoto(); renderMov(); empujar(); mostrar("v-mov");
}
$("#mov-volver").onclick = () => history.back();

function tiposDelForm() {
  const act = cat.tiposActivos();
  // incluye tipos preseleccionados aunque no estén activos (p. ej. devolver un equipo de un tipo oculto)
  Object.keys(form.sel).filter((k) => form.sel[k] && !act.some((t) => t.clave === k)).forEach((k) => act.push(cat.tipo(k)));
  return act;
}
function sugerido(tipo) {
  const lib = cat.equiposActivos().filter((e) => e.tipo === tipo && libre(e));
  return (lib.find(asignadoAMi) || {}).id || "";
}
function renderMov() {
  const tipos = tiposDelForm();
  $("#mov-tiles").innerHTML = tipos.map((t) => `<button class="tile ${form.sel[t.clave] ? "on" : ""}" data-t="${esc(t.clave)}">
    <span class="check">✓</span>${icono(t.icono)}${esc(t.nombre)}<span class="tile-sub">${form.sel[t.clave] ? "Seleccionado" : "Tocar para elegir"}</span></button>`).join("");
  $("#mov-codigos").innerHTML = tipos.filter((t) => form.sel[t.clave]).map((t) => {
    const inf = infoCodigo(t.clave);
    return `<div class="cod-row"><div class="cod-top"><span class="t">CÓDIGO ${esc(t.nombre.toUpperCase())}</span></div>
      <div class="cod-sel"><select data-t="${esc(t.clave)}" class="${form.cod[t.clave] ? "" : "vacio"}">${opciones(t.clave)}</select>
      <button class="btn-qr" data-qr="${esc(t.clave)}">${ICO_QR}QR</button></div>
      <div class="cod-info ${inf.cls}">${inf.txt}</div></div>`;
  }).join("");
  renderDano();
}
// ---- reporte de daño (solo al devolver)
function renderDano() {
  const z = $("#mov-dano-zona");
  const eqs = Object.keys(form.sel).filter((t) => form.sel[t]).map((t) => cat.eq(form.cod[t])).filter(Boolean);
  z.hidden = form.tipo !== "devolucion" || !eqs.length;
  if (z.hidden) return;
  [...form.danoIds].forEach((id) => { if (!eqs.some((e) => e.id === id)) form.danoIds.delete(id); });
  if (form.dano && eqs.length === 1) form.danoIds = new Set([eqs[0].id]);
  z.innerHTML = `<label class="dano-toggle ${form.dano ? "on" : ""}"><input type="checkbox" id="dano-on" ${form.dano ? "checked" : ""}>
      <span><b>Reportar daño o falla</b><small>El equipo quedará en revisión y no se podrá retirar</small></span></label>
    ${form.dano ? `<div class="dano-box">
      ${eqs.length > 1 ? `<p class="lbl">¿Qué equipo tiene el daño?</p>${eqs.map((e) => `<label class="check-fila"><input type="checkbox" data-dano="${esc(e.id)}" ${form.danoIds.has(e.id) ? "checked" : ""}> ${esc(nombreTipo(e.tipo))} ${esc(e.codigo)}</label>`).join("")}` : ""}
      <textarea id="dano-desc" class="input" rows="2" placeholder="Describe el daño o la falla (obligatorio)">${esc(form.danoDesc)}</textarea></div>` : ""}`;
}
$("#mov-dano-zona").addEventListener("change", (e) => {
  if (e.target.id === "dano-on") { form.dano = e.target.checked; if (!form.dano) form.danoIds.clear(); renderDano(); }
  if (e.target.dataset.dano) { e.target.checked ? form.danoIds.add(e.target.dataset.dano) : form.danoIds.delete(e.target.dataset.dano); }
});
$("#mov-dano-zona").addEventListener("input", (e) => { if (e.target.id === "dano-desc") form.danoDesc = e.target.value; });
function opciones(tipo) {
  const lista = cat.equipos.filter((e) => e.tipo === tipo && (e.activo !== false || e.id === form.cod[tipo] || loTengoYo(e)));
  const opt = (e) => `<option value="${esc(e.id)}" ${form.cod[tipo] === e.id ? "selected" : ""}>${esc(`${e.codigo} — ${asignadosTxt(e)}`)}</option>`;
  const grupo = (titulo, arr) => arr.length ? `<optgroup label="${titulo}">${arr.map(opt).join("")}</optgroup>` : "";
  let html = `<option value="">Elegir o escanear código…</option>`;
  if (form.tipo === "retiro") {
    html += grupo("Asignados a ti", lista.filter((e) => asignadoAMi(e) && libre(e)));
    html += grupo("Disponibles", lista.filter((e) => !asignadoAMi(e) && libre(e)));
    html += grupo("En uso (figura con otra persona)", lista.filter((e) => enUso(e)));
    const rev = lista.filter(enRevision);
    if (rev.length) html += `<optgroup label="En revisión (no se puede retirar)">${rev.map((e) => `<option disabled>${esc(`${e.codigo} — en revisión`)}</option>`).join("")}</optgroup>`;
  } else {
    html += grupo("En tu poder", lista.filter(loTengoYo));
    html += grupo("Otros equipos", lista.filter((e) => !loTengoYo(e)));
  }
  return html;
}
function infoCodigo(t) {
  const e = cat.eq(form.cod[t]);
  if (!e) return { cls: "", txt: "Escanea el QR del equipo o elígelo de la lista" };
  if (form.tipo === "retiro") {
    if (enRevision(e)) return { cls: "alerta", txt: `🔧 En revisión: ${esc(e.dano?.desc || "reportado con daño")}` };
    if (enUso(e) && !loTengoYo(e)) return { cls: "alerta", txt: `⚠ Figura con ${esc(e.usuario)} desde ${hora(e.desde)}` };
    if (enUso(e)) return { cls: "alerta", txt: `⚠ Ya figura contigo desde ${hora(e.desde)}` };
    return { cls: "ok", txt: `✓ Disponible · Asignado a ${esc(asignadosTxt(e))}` };
  }
  if (loTengoYo(e)) return { cls: "ok", txt: `✓ Lo retiraste ${hora(e.desde)}` };
  if (enUso(e)) return { cls: "alerta", txt: `⚠ Figura con ${esc(e.usuario)} (lo devuelves por él/ella)` };
  return { cls: "alerta", txt: "⚠ Este equipo ya figura como disponible" };
}
$("#mov-tiles").onclick = (e) => {
  const b = e.target.closest(".tile"); if (!b) return;
  const t = b.dataset.t;
  form.sel[t] = !form.sel[t];
  if (form.sel[t] && !form.cod[t]) form.cod[t] = form.tipo === "retiro" ? sugerido(t) : ((misEquipos().find((x) => x.tipo === t) || {}).id || "");
  if (!form.sel[t]) form.cod[t] = "";
  renderMov();
};
$("#mov-codigos").onchange = (e) => {
  const s = e.target.closest("select"); if (!s) return;
  form.cod[s.dataset.t] = s.value; renderMov();
};
function resolverQR(txt) {
  for (const c of codigoDesdeQR(txt)) { const e = cat.porCodigo(c); if (e) return e; }
  return null;
}
$("#mov-codigos").onclick = async (e) => {
  const b = e.target.closest("[data-qr]"); if (!b) return;
  const t = b.dataset.qr;
  const txt = await escanearQR({ titulo: `Escanea el QR · ${nombreTipo(t)}` });
  if (!txt) return;
  const eq = resolverQR(txt);
  if (!eq) return toast(`QR no reconocido: ${String(txt).slice(0, 40)}`);
  if (form.tipo === "retiro" && enRevision(eq)) return toast(`${nombreTipo(eq.tipo)} ${eq.codigo} está en revisión y no se puede retirar`, 4000);
  if (eq.tipo !== t) toast(`El código ${eq.codigo} es ${nombreTipo(eq.tipo)}; se agregó como ${nombreTipo(eq.tipo)}`);
  form.sel[eq.tipo] = true; form.cod[eq.tipo] = eq.id;
  renderMov();
};

// foto
function limpiarFoto() {
  if (form) form.foto = null;
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
  } catch (err) { console.error(err); toast("No se pudo procesar la foto, intenta otra vez"); }
  finally { $(".foto-vacia span").textContent = "Tomar foto"; }
};

// enviar
let okT = null;
$("#mov-enviar").onclick = async () => {
  const btn = $("#mov-enviar");
  const tipos = Object.keys(form.sel).filter((t) => form.sel[t]);
  if (!tipos.length) return toast("Elige al menos un equipo");
  const falta = tipos.find((t) => !cat.eq(form.cod[t]));
  if (falta) return toast(`Falta el código de ${nombreTipo(falta)}`);
  const fotoReq = form.tipo === "retiro" ? AJUSTES.fotoObligatoriaRetiro : AJUSTES.fotoObligatoriaDevolucion;
  if (fotoReq && !form.foto) return toast("Toma la foto del equipo");

  const eqs = tipos.map((t) => cat.eq(form.cod[t]));
  const rev = form.tipo === "retiro" && eqs.find(enRevision);
  if (rev) return toast(`${nombreTipo(rev.tipo)} ${rev.codigo} está en revisión y no se puede retirar`, 4000);
  const conDano = form.tipo === "devolucion" && form.dano;
  if (conDano && !form.danoIds.size) return toast("Marca qué equipo tiene el daño");
  if (conDano && form.danoDesc.trim().length < 4) return toast("Describe el daño o la falla");
  const avisos = [];
  for (const e of eqs) {
    const nom = `${nombreTipo(e.tipo)} ${e.codigo}`;
    if (form.tipo === "retiro" && enUso(e)) {
      const quien = loTengoYo(e) ? "ti" : e.usuario;
      if (!(await confirmar(`<b>${esc(nom)}</b> figura con <b>${esc(quien)}</b> desde ${hora(e.desde)}.<br><br>¿Registrar el retiro igual? Quedará anotado en el historial.`))) return;
      avisos.push(`${e.codigo} figuraba con ${e.usuario}`);
    }
    if (form.tipo === "devolucion" && !enUso(e)) avisos.push(`${e.codigo} ya figuraba disponible`);
    if (form.tipo === "devolucion" && enUso(e) && !loTengoYo(e)) {
      if (!(await confirmar(`<b>${esc(nom)}</b> figura con <b>${esc(e.usuario)}</b>.<br><br>¿Lo estás devolviendo en su nombre?`))) return;
      avisos.push(`${e.codigo} devuelto por ${usuario.nombre} (figuraba con ${e.usuario})`);
    }
  }

  btn.disabled = true; btn.textContent = "Enviando…";
  try {
    const ts = Date.now();
    const items = eqs.map((e) => ({ id: e.id, codigo: e.codigo, tipo: e.tipo, ...(conDano && form.danoIds.has(e.id) ? { dano: true } : {}) }));
    const r = await backend.registrar({ tipo: form.tipo, usuario: usuario.nombre, usuarioId: usuario.id, items, foto: form.foto,
      nota: $("#mov-nota").value.trim(), avisos, ts, danoDesc: conDano ? form.danoDesc.trim() : null });
    const det = items.map((i) => `${nombreTipo(i.tipo)} ${i.codigo}${i.dano ? " (a revisión)" : ""}`).join(" · ") + " · " + hora(ts);
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
$("#ok-listo").onclick = () => mostrar("v-inicio");

// ------------------------------------------------------------------ panel público
function renderChips() {
  const tipos = cat.tiposActivos();
  if (filtroTipo && !tipos.some((t) => t.clave === filtroTipo)) filtroTipo = "";
  $("#pan-chips-tipo").innerHTML = `<button data-v="" class="chip ${!filtroTipo ? "on" : ""}">Todos</button>` +
    tipos.map((t) => `<button data-v="${esc(t.clave)}" class="chip ${filtroTipo === t.clave ? "on" : ""}">${esc(t.nombre)}</button>`).join("");
  const act = cat.equiposActivos(), nV = act.filter(muyLargo).length, nR = act.filter(enRevision).length;
  if ((filtroEst === "vencidos" && !nV) || (filtroEst === "revision" && !nR)) filtroEst = "";
  $("#pan-chips-est").innerHTML = [["", "Todos"], ["disponible", "Disponibles"], ["en_uso", "En uso"],
    ...(nV ? [["vencidos", `⚠ No devueltos (${nV})`]] : []), ...(nR ? [["revision", `🔧 En revisión (${nR})`]] : []), ["mios", "👤 Mis equipos"]]
    .map(([v, n]) => `<button data-v="${v}" class="chip ${v === "mios" ? "chip-mio" : v === "vencidos" ? "chip-rojo" : ""} ${filtroEst === v ? "on" : ""}">${n}</button>`).join("");
}
$("#pan-chips-tipo").onclick = (e) => { const c = e.target.closest(".chip"); if (!c) return; filtroTipo = c.dataset.v; renderPanel(); };
$("#pan-chips-est").onclick = (e) => { const c = e.target.closest(".chip"); if (!c) return; filtroEst = c.dataset.v; renderPanel(); };
$("#pan-buscar").oninput = () => renderPanel();

function renderPanel() {
  renderChips();
  $("#pan-cont").innerHTML = tarjetasConteo();
  const q = norm($("#pan-buscar").value);
  const lista = cat.equiposActivos().filter((e) => {
    if (filtroTipo && e.tipo !== filtroTipo) return false;
    if (filtroEst === "mios") { if (!(asignadoAMi(e) || loTengoYo(e))) return false; }
    else if (filtroEst === "vencidos") { if (!muyLargo(e)) return false; }
    else if (filtroEst === "revision") { if (!enRevision(e)) return false; }
    else if (filtroEst === "en_uso") { if (!enUso(e)) return false; }
    else if (filtroEst === "disponible") { if (!libre(e)) return false; }
    if (!q) return true;
    return norm([e.codigo, e.tipo, nombreTipo(e.tipo), ...cat.nombres(e.asignados), e.usuario, e.ultimoUsuario].join(" ")).includes(q);
  });
  const vacio = filtroEst === "mios"
    ? (usuario?.id ? "No tienes equipos asignados ni en tu poder" : "Tu nombre no está vinculado al personal; pide al administrador que te agregue")
    : `Sin resultados${q ? ` para “${esc($("#pan-buscar").value)}”` : ""}`;
  $("#pan-lista").innerHTML = lista.map((e) => {
    const u = enUso(e), largo = muyLargo(e), rv = enRevision(e);
    const mio = asignadoAMi(e) ? `<span class="tag-mio">Tuyo</span>` : "";
    return `<button class="eq ${u ? "uso" : ""} ${largo ? "largo" : ""} ${rv ? "rev" : ""}" data-id="${esc(e.id)}">${icoTipo(e.tipo)}
      <div class="cuerpo"><div class="cod">${esc(e.codigo)}<small>${esc(nombreTipo(e.tipo).toUpperCase())}</small></div><div class="asig">${mio}${esc(asignadosTxt(e))}</div></div>
      <div class="estado">${rv ? `<span class="pill rev">🔧 En revisión</span><div class="cuando">desde ${hora(e.desde)}</div>` : u ? `<span class="pill ${largo ? "largo" : "uso"}">${largo ? "No devuelto" : loTengoYo(e) ? "Lo tienes tú" : "En uso"}</span><div class="quien">${esc(e.usuario)}</div><div class="cuando">${hora(e.desde)} · ${duracion(e.desde)}</div>`
        : `<span class="pill disp">Disponible</span>${e.ultimoUsuario ? `<div class="cuando">devuelto ${hora(e.desde)}</div>` : ""}`}</div></button>`;
  }).join("") || `<p class="vacio-msg">${vacio}</p>`;
}
$("#pan-lista").onclick = (e) => { const b = e.target.closest(".eq"); if (b) detalleEquipo(b.dataset.id); };

function detalleEquipo(id) {
  const e = cat.eq(id); if (!e) return;
  const u = enUso(e);
  const hist = movs.filter((m) => (m.ids || []).includes(id) || (!m.ids && (m.codigos || []).includes(e.codigo))).slice(0, 12);
  abrirHoja(`<div class="det-cab">${icoTipo(e.tipo)}<div><h2 class="h-lg">${esc(nombreTipo(e.tipo))} ${esc(e.codigo)}</h2>
      ${enRevision(e) ? `<span class="pill rev">🔧 En revisión</span>` : u ? `<span class="pill ${muyLargo(e) ? "largo" : "uso"}">${muyLargo(e) ? "No devuelto" : "En uso"}</span>` : `<span class="pill disp">Disponible</span>`}</div></div>
    <div class="det-tabla">
      ${enRevision(e) ? `<div><span>Daño reportado</span><b>${esc(e.dano?.desc || "—")}</b></div><div><span>Reportado por</span><b>${esc(e.dano?.por || "—")} · ${hora(e.dano?.ts || e.desde)}</b></div>` : ""}
      ${u && muyLargo(e) && aj.cierres.length ? `<div><span>Turno cerró</span><b style="color:var(--rojo)">${horaCorta(cierreSiguiente(e.desde, aj))}</b></div>` : ""}
      ${u ? `<div><span>Lo tiene</span><b>${esc(e.usuario)}</b></div><div><span>Desde</span><b>${hora(e.desde)} (${duracion(e.desde)})</b></div>` : ""}
      ${!u && e.ultimoUsuario ? `<div><span>Último en usarlo</span><b>${esc(e.ultimoUsuario)}</b></div><div><span>Devuelto</span><b>${hora(e.desde)}</b></div>` : ""}
      <div><span>Asignado a</span><b>${esc(asignadosTxt(e))}</b></div>
    </div>
    ${e.fotoId ? `<p class="h-sec">Foto del último movimiento</p><img class="det-foto" id="det-foto" alt="Foto del equipo">` : ""}
    <p class="h-sec">Movimientos de hoy</p>
    <div class="lista-mov">${hist.map(htmlMov).join("") || `<p class="vacio-msg">Sin movimientos hoy</p>`}</div>`);
  if (e.fotoId) cargarFoto(e.fotoId, $("#det-foto"));
}
async function cargarFoto(id, img) {
  try { const d = await backend.getFoto(id); if (d && img) img.src = d; else if (img) img.alt = "Foto no disponible"; } catch {}
}

// ------------------------------------------------------------------ historial (solo HOY)
const inicioDia = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
function suscribirMovs() {
  const hoy = inicioDia();
  if (offMovs && diaSub === hoy) return;
  if (offMovs) offMovs();
  diaSub = hoy;
  offMovs = backend.onMovimientosDesde(hoy, (lista) => { movs = lista; if (vistaActual === "v-hist") renderHist(); });
}
function eqTxt(m) { return (m.equipos || []).map((i) => `${nombreTipo(i.tipo)} ${i.codigo}`).join(" · "); }
const TMOV = { retiro: ["ret", "↑", "Retiró", "Retiro"], devolucion: ["dev", "↓", "Devolvió", "Devolución"],
  revision: ["rev", "🔧", "Envió a revisión", "Enviado a revisión"], liberacion: ["lib", "✔", "Liberó", "Liberado (reparado)"] };
const tm = (m) => TMOV[m.tipo] || TMOV.devolucion;
function htmlMov(m) {
  const [cls, ico, verbo] = tm(m);
  return `<button class="mov" data-m="${esc(m.id)}"><div class="ico ${cls}">${ico}</div>
    <div class="cuerpo"><div class="q">${esc(m.usuario)}</div><div class="d">${verbo} ${esc(eqTxt(m))}${m.fotoId ? " · 📷" : ""}</div>
    ${(m.danados || []).length ? `<div class="aviso">🔧 Daño: ${esc(m.danoDesc || "")}</div>` : ""}
    ${(m.avisos || []).length ? `<div class="aviso">⚠ ${esc(m.avisos.join("; "))}</div>` : ""}</div><div class="h">${hora(m.ts)}</div></button>`;
}
function renderHist() {
  const q = norm($("#his-buscar").value);
  const lista = movs.filter((m) => !q || norm([m.usuario, ...(m.codigos || []), m.tipo, m.nota].join(" ")).includes(q));
  $("#his-lista").innerHTML = lista.map(htmlMov).join("") || `<p class="vacio-msg">${movs.length ? "Sin coincidencias" : "Aún no hay movimientos hoy"}</p>`;
}
$("#his-buscar").oninput = renderHist;
document.addEventListener("click", (e) => {
  const b = e.target.closest(".mov[data-m]"); if (!b) return;
  const m = movs.find((x) => x.id === b.dataset.m); if (!m) return;
  const [cls, ico, , titulo] = tm(m);
  abrirHoja(`<div class="det-cab"><div class="mov" style="box-shadow:none;padding:0;background:none"><div class="ico ${cls}">${ico}</div></div>
      <div><h2 class="h-lg">${titulo}</h2><span class="sub">${new Date(m.ts).toLocaleString("es-PE")}</span></div></div>
    <div class="det-tabla"><div><span>Persona</span><b>${esc(m.usuario)}</b></div>
      ${(m.equipos || []).map((i) => `<div><span>${esc(nombreTipo(i.tipo))}</span><b>${esc(i.codigo)}</b></div>`).join("")}
      ${(m.danados || []).length ? `<div><span>Daño (${esc(m.danados.join(", "))})</span><b style="color:var(--rojo)">${esc(m.danoDesc || "")}</b></div>` : ""}
      ${m.nota ? `<div><span>Observación</span><b>${esc(m.nota)}</b></div>` : ""}
      ${(m.avisos || []).length ? `<div><span>Aviso</span><b style="color:var(--rojo)">${esc(m.avisos.join("; "))}</b></div>` : ""}</div>
    ${m.fotoId ? `<img class="det-foto" id="mov-foto-det" alt="Cargando foto…">` : `<p class="vacio-msg">Sin foto</p>`}`);
  if (m.fotoId) cargarFoto(m.fotoId, $("#mov-foto-det"));
});

// ------------------------------------------------------------------ enlace directo desde QR del equipo (?eq=CODIGO)
function procesarDeepLink() {
  if (!pendienteEq || !usuario || !listo) return;
  const c = pendienteEq; pendienteEq = null;
  history.replaceState(null, "", location.pathname);
  const e = cat.porCodigo(c);
  if (!e) return toast(`Código ${c} no está registrado`);
  if (enRevision(e)) return toast(`${nombreTipo(e.tipo)} ${e.codigo} está en revisión y no se puede retirar`, 4500);
  abrirMov(loTengoYo(e) ? "devolucion" : "retiro", e);
}

// ------------------------------------------------------------------ arranque
function actualizarConexion() { $("#banner-offline").hidden = navigator.onLine; }
window.addEventListener("online", actualizarConexion);
window.addEventListener("offline", actualizarConexion);

function alCambiarCatalogo() {
  cat = construirCatalogo(fsData);
  if (!listo) {
    listo = true;
    $("#cargando").hidden = true;
    if (usuario && sincronizarUsuario()) { mostrar("v-inicio"); procesarDeepLink(); }
    else mostrar("v-registro");
    return;
  }
  if (usuario && !sincronizarUsuario()) { mostrar("v-registro"); return; }
  if (vistaActual === "v-registro") renderRegistro();
  if (vistaActual === "v-inicio") renderInicio();
  if (vistaActual === "v-panel") renderPanel();
  if (vistaActual === "v-mov") renderMov();
}

async function iniciar() {
  actualizarConexion();
  try { backend = await crearBackend(); }
  catch (e) {
    console.error(e);
    $("#cargando").innerHTML = `<p style="padding:20px;text-align:center">No se pudo conectar con el servidor.<br><small>${esc(e.message || e)}</small><br><br><button class="btn btn-pri" onclick="location.reload()">Reintentar</button></p>`;
    return;
  }
  backend.onColeccion("ajustes", (m) => { aj = leerAjustes(m); if (listo) alCambiarCatalogo(); });
  ["tipos", "personal", "equipos"].forEach((n) => backend.onColeccion(n, (m) => {
    fsData[n] = m; cargadas.add(n);
    if (cargadas.size === 3) alCambiarCatalogo();
  }));
  setInterval(() => {
    if (offMovs && diaSub !== inicioDia()) suscribirMovs();
    if (vistaActual === "v-inicio") renderInicio();
    if (vistaActual === "v-panel") renderPanel();
  }, 60000);
}
iniciar();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
