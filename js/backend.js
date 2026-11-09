// Capa de datos: Firebase (Firestore + Auth anónima) o MODO DEMO (localStorage).
import { firebaseConfig } from "./config.js";

const FB = "https://www.gstatic.com/firebasejs/10.12.2/";

export async function crearBackend() {
  if (firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId) {
    return await backendFirebase();
  }
  return backendDemo();
}

// ---------------------------------------------------------------- Firebase
async function backendFirebase() {
  const { initializeApp } = await import(FB + "firebase-app.js");
  const { getAuth, signInAnonymously, onAuthStateChanged } = await import(FB + "firebase-auth.js");
  const fs = await import(FB + "firebase-firestore.js");
  const {
    initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
    collection, doc, onSnapshot, query, orderBy, limit, writeBatch,
    serverTimestamp, getDoc, setDoc, getDocs, where
  } = fs;

  const app = initializeApp(firebaseConfig);
  let db;
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
  } catch (e) {
    db = initializeFirestore(app, {});
  }
  const auth = getAuth(app);

  const uid = await new Promise((resolve, reject) => {
    const off = onAuthStateChanged(auth, (u) => {
      if (u) { off(); resolve(u.uid); }
    });
    signInAnonymously(auth).catch((e) => { off(); reject(e); });
  });

  return {
    modo: "firebase",
    uid,
    onEquipos(cb) {
      return onSnapshot(collection(db, "equipos"), (snap) => {
        const m = {};
        snap.forEach((d) => (m[d.id] = d.data()));
        cb(m, snap.metadata.fromCache);
      }, (e) => console.error(e));
    },
    onMovimientos(n, cb) {
      const q = query(collection(db, "movimientos"), orderBy("ts", "desc"), limit(n));
      return onSnapshot(q, (snap) => {
        cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }, (e) => console.error(e));
    },
    // movimientos desde una fecha (en vivo) — usado por "Historial de hoy"
    onMovimientosDesde(desde, cb) {
      const q = query(collection(db, "movimientos"), where("ts", ">=", desde), orderBy("ts", "desc"), limit(1000));
      return onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => console.error(e));
    },
    // consulta por rango [desde, hasta) — usado por /panel
    async consultar(desde, hasta) {
      const q = query(collection(db, "movimientos"), where("ts", ">=", desde), where("ts", "<", hasta), orderBy("ts", "desc"));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    // config/app (se crea a mano en la consola). { modoPruebas: true } habilita "Borrar datos"
    async config() {
      try { const s = await getDoc(doc(db, "config", "app")); return s.exists() ? s.data() : {}; } catch { return {}; }
    },
    async borrarTodo(progreso = () => {}) {
      const movsSnap = await getDocs(collection(db, "movimientos"));
      const eqSnap = await getDocs(collection(db, "equipos"));
      const refs = [];
      movsSnap.forEach((d) => { refs.push(d.ref); const f = d.data().fotoId; if (f) refs.push(doc(db, "fotos", f)); });
      eqSnap.forEach((d) => refs.push(d.ref));
      for (let i = 0; i < refs.length; i += 400) {
        const b = writeBatch(db);
        refs.slice(i, i + 400).forEach((r) => b.delete(r));
        await b.commit();
        progreso(Math.min(refs.length, i + 400), refs.length);
      }
      return refs.length;
    },
    async guardarUsuario(nombre) {
      await setDoc(doc(db, "usuarios", uid), { nombre, ts: Date.now(), fecha: serverTimestamp() }, { merge: true });
    },
    async getFoto(id) {
      const s = await getDoc(doc(db, "fotos", id));
      return s.exists() ? s.data().data : null;
    },
    // Devuelve "ok" (confirmado por servidor) o "pendiente" (sin señal: se enviará solo)
    async registrar(mov) {
      const batch = writeBatch(db);
      const movRef = doc(collection(db, "movimientos"));
      let fotoId = null;
      if (mov.foto) {
        const fRef = doc(collection(db, "fotos"));
        fotoId = fRef.id;
        batch.set(fRef, { data: mov.foto, movId: movRef.id, ts: mov.ts, fecha: serverTimestamp() });
      }
      batch.set(movRef, {
        tipo: mov.tipo, usuario: mov.usuario, uid,
        equipos: mov.items, codigos: mov.items.map((i) => i.codigo),
        ts: mov.ts, fecha: serverTimestamp(), fotoId, nota: mov.nota || "", avisos: mov.avisos || []
      });
      for (const it of mov.items) {
        batch.set(doc(db, "equipos", it.codigo), estadoNuevo(mov, it, movRef.id, fotoId), { merge: true });
      }
      const commit = batch.commit().then(() => "ok");
      const espera = new Promise((r) => setTimeout(() => r("pendiente"), 7000));
      return await Promise.race([commit, espera]);
    }
  };
}

function estadoNuevo(mov, it, movId, fotoId) {
  if (mov.tipo === "retiro") {
    return { tipo: it.tipo, estado: "en_uso", usuario: mov.usuario, desde: mov.ts, movId, fotoId };
  }
  return { tipo: it.tipo, estado: "disponible", usuario: null, desde: mov.ts, ultimoUsuario: mov.usuario, movId, fotoId };
}

// ---------------------------------------------------------------- DEMO
function backendDemo() {
  const K = { eq: "demo_equipos", mov: "demo_movs", fot: "demo_fotos" };
  const leer = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn(e); } };
  const subsEq = new Set(), subsMov = new Set();
  const emitir = () => {
    const eq = leer(K.eq, {});
    subsEq.forEach((cb) => cb(eq, false));
    const movs = leer(K.mov, []);
    subsMov.forEach(({ n, cb }) => cb(movs.slice(0, n)));
  };
  window.addEventListener("storage", emitir);
  let uid = leer("demo_uid", null);
  if (!uid) { uid = "demo-" + Math.random().toString(36).slice(2, 10); escribir("demo_uid", uid); }

  return {
    modo: "demo",
    uid,
    onEquipos(cb) { subsEq.add(cb); setTimeout(() => cb(leer(K.eq, {}), false)); return () => subsEq.delete(cb); },
    onMovimientos(n, cb) {
      const s = { n, cb }; subsMov.add(s);
      setTimeout(() => cb(leer(K.mov, []).slice(0, n)));
      return () => subsMov.delete(s);
    },
    onMovimientosDesde(desde, cb) {
      const s = { n: 1e9, cb: (l) => cb(l.filter((m) => m.ts >= desde)) }; subsMov.add(s);
      setTimeout(() => s.cb(leer(K.mov, [])));
      return () => subsMov.delete(s);
    },
    async consultar(desde, hasta) { return leer(K.mov, []).filter((m) => m.ts >= desde && m.ts < hasta); },
    async config() { return { modoPruebas: true }; },
    async borrarTodo() {
      const n = leer(K.mov, []).length;
      [K.eq, K.mov, K.fot].forEach((k) => localStorage.removeItem(k)); emitir(); return n;
    },
    async guardarUsuario() {},
    async getFoto(id) { return leer(K.fot, {})[id] || null; },
    async registrar(mov) {
      const id = "m" + Date.now();
      let fotoId = null;
      if (mov.foto) {
        fotoId = "f" + Date.now();
        const f = leer(K.fot, {});
        f[fotoId] = mov.foto;
        // en demo guardamos solo las últimas 15 fotos para no llenar el celular
        const keys = Object.keys(f); if (keys.length > 15) delete f[keys[0]];
        escribir(K.fot, f);
      }
      const movs = leer(K.mov, []);
      movs.unshift({ id, tipo: mov.tipo, usuario: mov.usuario, uid, equipos: mov.items,
        codigos: mov.items.map((i) => i.codigo), ts: mov.ts, fotoId, nota: mov.nota || "", avisos: mov.avisos || [] });
      escribir(K.mov, movs.slice(0, 300));
      const eq = leer(K.eq, {});
      for (const it of mov.items) eq[it.codigo] = { ...(eq[it.codigo] || {}), ...estadoNuevo(mov, it, id, fotoId) };
      escribir(K.eq, eq);
      emitir();
      return "ok";
    }
  };
}
