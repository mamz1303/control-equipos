// Capa de datos: Firebase (Firestore + Auth anónima) o MODO DEMO (localStorage).
import { firebaseConfig } from "./config.js";

const FB = "https://www.gstatic.com/firebasejs/10.12.2/";
const RESET_ESTADO = { estado: "disponible", usuario: null, usuarioId: null, desde: null, movId: null, fotoId: null, ultimoUsuario: null, dano: null };

export async function crearBackend() {
  if (firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId) return await backendFirebase();
  return backendDemo();
}

// Estado del equipo después de cada tipo de movimiento:
//   retiro → en_uso · devolucion → disponible (o revision si se reportó daño)
//   revision (admin) → revision · liberacion (admin) → disponible
function estadoNuevo(mov, it, movId, fotoId) {
  const base = { movId, fotoId, desde: mov.ts };
  if (mov.tipo === "retiro") return { ...base, estado: "en_uso", usuario: mov.usuario, usuarioId: mov.usuarioId || null, dano: null };
  const libre = { usuario: null, usuarioId: null };
  if (mov.tipo === "devolucion") {
    if (it.dano) return { ...base, ...libre, estado: "revision", ultimoUsuario: mov.usuario, dano: { desc: mov.danoDesc || "", por: mov.usuario, ts: mov.ts, movId } };
    return { ...base, ...libre, estado: "disponible", ultimoUsuario: mov.usuario, dano: null };
  }
  if (mov.tipo === "revision") return { ...base, ...libre, estado: "revision", dano: { desc: mov.danoDesc || mov.nota || "", por: mov.usuario, ts: mov.ts, movId } };
  return { ...base, ...libre, estado: "disponible", dano: null }; // liberacion
}

// ---------------------------------------------------------------- Firebase
async function backendFirebase() {
  const { initializeApp } = await import(FB + "firebase-app.js");
  const { getAuth, signInAnonymously, onAuthStateChanged } = await import(FB + "firebase-auth.js");
  const {
    initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
    collection, doc, onSnapshot, query, orderBy, limit, writeBatch,
    serverTimestamp, getDoc, setDoc, getDocs, where
  } = await import(FB + "firebase-firestore.js");

  const app = initializeApp(firebaseConfig);
  let db;
  try {
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch (e) { db = initializeFirestore(app, {}); }
  const auth = getAuth(app);
  const uid = await new Promise((resolve, reject) => {
    const off = onAuthStateChanged(auth, (u) => { if (u) { off(); resolve(u.uid); } });
    signInAnonymously(auth).catch((e) => { off(); reject(e); });
  });

  const conTiempo = (p) => Promise.race([p.then(() => "ok"), new Promise((r) => setTimeout(() => r("pendiente"), 7000))]);
  async function lote(ops) {
    let estado = "ok";
    for (let i = 0; i < ops.length; i += 450) {
      const b = writeBatch(db);
      ops.slice(i, i + 450).forEach((o) => {
        const ref = doc(db, o.col, o.id);
        if (o.borrar) b.delete(ref); else b.set(ref, o.data, { merge: o.merge !== false });
      });
      if ((await conTiempo(b.commit())) === "pendiente") estado = "pendiente";
    }
    return estado;
  }

  return {
    modo: "firebase", uid,
    onColeccion(nombre, cb) {
      return onSnapshot(collection(db, nombre), (snap) => {
        const m = {}; snap.forEach((d) => (m[d.id] = d.data())); cb(m);
      }, (e) => { console.error(nombre, e); cb({}); });
    },
    lote,
    async guardar(col, id, data) { return lote([{ col, id, data }]); },
    onMovimientosDesde(desde, cb) {
      const q = query(collection(db, "movimientos"), where("ts", ">=", desde), orderBy("ts", "desc"), limit(1000));
      return onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => console.error(e));
    },
    async consultar(desde, hasta) {
      const q = query(collection(db, "movimientos"), where("ts", ">=", desde), where("ts", "<", hasta), orderBy("ts", "desc"));
      return (await getDocs(q)).docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    async config() {
      try { const s = await getDoc(doc(db, "config", "app")); return s.exists() ? s.data() : {}; } catch { return {}; }
    },
    async guardarUsuario(nombre, personaId) {
      await setDoc(doc(db, "usuarios", uid), { nombre, personaId: personaId || null, ts: Date.now(), fecha: serverTimestamp() }, { merge: true });
    },
    async getFoto(id) { const s = await getDoc(doc(db, "fotos", id)); return s.exists() ? s.data().data : null; },
    async registrar(mov) {
      const batch = writeBatch(db);
      const movRef = doc(collection(db, "movimientos"));
      let fotoId = null;
      if (mov.foto) {
        const fRef = doc(collection(db, "fotos")); fotoId = fRef.id;
        batch.set(fRef, { data: mov.foto, movId: movRef.id, ts: mov.ts, fecha: serverTimestamp() });
      }
      batch.set(movRef, {
        tipo: mov.tipo, usuario: mov.usuario, usuarioId: mov.usuarioId || null, uid,
        equipos: mov.items, codigos: mov.items.map((i) => i.codigo), ids: mov.items.map((i) => i.id),
        ts: mov.ts, fecha: serverTimestamp(), fotoId, nota: mov.nota || "", avisos: mov.avisos || [],
        danoDesc: mov.danoDesc || null, danados: mov.items.filter((i) => i.dano).map((i) => i.codigo)
      });
      for (const it of mov.items) batch.set(doc(db, "equipos", it.id), estadoNuevo(mov, it, movRef.id, fotoId), { merge: true });
      return await conTiempo(batch.commit());
    },
    // Modo pruebas: borra movimientos y fotos; los equipos quedan disponibles (el catálogo NO se borra)
    async borrarTodo(progreso = () => {}) {
      const ops = [];
      (await getDocs(collection(db, "movimientos"))).forEach((d) => {
        ops.push({ col: "movimientos", id: d.id, borrar: true });
        if (d.data().fotoId) ops.push({ col: "fotos", id: d.data().fotoId, borrar: true });
      });
      (await getDocs(collection(db, "equipos"))).forEach((d) => ops.push({ col: "equipos", id: d.id, data: RESET_ESTADO }));
      for (let i = 0; i < ops.length; i += 400) {
        const b = writeBatch(db);
        ops.slice(i, i + 400).forEach((o) => { const r = doc(db, o.col, o.id); o.borrar ? b.delete(r) : b.set(r, o.data, { merge: true }); });
        await b.commit();
        progreso(Math.min(ops.length, i + 400), ops.length);
      }
      return ops.filter((o) => o.borrar).length;
    }
  };
}

// ---------------------------------------------------------------- DEMO (localStorage)
function backendDemo() {
  const key = (c) => "demo_col_" + c;
  const leer = (c) => { try { return JSON.parse(localStorage.getItem(key(c))) || {}; } catch { return {}; } };
  const escribir = (c, v) => { try { localStorage.setItem(key(c), JSON.stringify(v)); } catch (e) { console.warn(e); } };
  const subs = new Set();
  const emitir = () => subs.forEach((s) => s());
  window.addEventListener("storage", emitir);
  let uid = localStorage.getItem("demo_uid");
  if (!uid) { uid = "demo-" + Math.random().toString(36).slice(2, 10); localStorage.setItem("demo_uid", uid); }
  const movsOrdenados = () => Object.entries(leer("movimientos")).map(([id, m]) => ({ id, ...m })).sort((a, b) => b.ts - a.ts);
  const sub = (fn) => { subs.add(fn); setTimeout(fn); return () => subs.delete(fn); };
  async function lote(ops) {
    const cache = {};
    for (const o of ops) {
      const m = cache[o.col] || (cache[o.col] = leer(o.col));
      if (o.borrar) delete m[o.id]; else m[o.id] = o.merge === false ? o.data : { ...(m[o.id] || {}), ...o.data };
    }
    Object.entries(cache).forEach(([c, m]) => escribir(c, m));
    emitir(); return "ok";
  }
  return {
    modo: "demo", uid,
    onColeccion(nombre, cb) { return sub(() => cb(leer(nombre))); },
    lote,
    async guardar(col, id, data) { return lote([{ col, id, data }]); },
    onMovimientosDesde(desde, cb) { return sub(() => cb(movsOrdenados().filter((m) => m.ts >= desde))); },
    async consultar(desde, hasta) { return movsOrdenados().filter((m) => m.ts >= desde && m.ts < hasta); },
    async config() { return { modoPruebas: true }; },
    async guardarUsuario() {},
    async getFoto(id) { return leer("fotos")[id]?.data || null; },
    async registrar(mov) {
      const id = "m" + Date.now();
      const ops = [];
      let fotoId = null;
      if (mov.foto) {
        fotoId = "f" + Date.now();
        const f = leer("fotos"); const ks = Object.keys(f);
        if (ks.length >= 15) ops.push({ col: "fotos", id: ks[0], borrar: true }); // demo: solo 15 fotos
        ops.push({ col: "fotos", id: fotoId, data: { data: mov.foto, movId: id, ts: mov.ts } });
      }
      ops.push({ col: "movimientos", id, data: { tipo: mov.tipo, usuario: mov.usuario, usuarioId: mov.usuarioId || null, uid,
        equipos: mov.items, codigos: mov.items.map((i) => i.codigo), ids: mov.items.map((i) => i.id),
        ts: mov.ts, fotoId, nota: mov.nota || "", avisos: mov.avisos || [],
        danoDesc: mov.danoDesc || null, danados: mov.items.filter((i) => i.dano).map((i) => i.codigo) } });
      mov.items.forEach((it) => ops.push({ col: "equipos", id: it.id, data: estadoNuevo(mov, it, id, fotoId) }));
      return lote(ops);
    },
    async borrarTodo() {
      const n = Object.keys(leer("movimientos")).length;
      escribir("movimientos", {}); escribir("fotos", {});
      const eq = leer("equipos"); Object.keys(eq).forEach((k) => (eq[k] = { ...eq[k], ...RESET_ESTADO })); escribir("equipos", eq);
      emitir(); return n;
    }
  };
}
