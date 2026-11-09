// =====================================================================
//  CONFIGURACIÓN — Control de PDA's y Radios · Almacén Cerro Verde
//  Este es el ÚNICO archivo que normalmente necesitas editar.
// =====================================================================

// 1) Pega aquí la configuración de tu proyecto Firebase
//    (Consola Firebase → Configuración del proyecto → Tus apps → Web).
//    Si lo dejas vacío, la app funciona en MODO DEMO (datos solo en este celular).
export const firebaseConfig = {
  apiKey: "AIzaSyAd8j137Dtn7f6lS2HPU6Zv9-_Lrrg7O_M",
  authDomain: "control-equipos-almacen.firebaseapp.com",
  projectId: "control-equipos-almacen",
  storageBucket: "control-equipos-almacen.firebasestorage.app",
  messagingSenderId: "115103712411",
  appId: "1:115103712411:web:a3a99bb4621fa125ecb23e"
};

// 2) Ajustes generales
export const AJUSTES = {
  fotoObligatoriaRetiro: true,      // pedir foto al retirar
  fotoObligatoriaDevolucion: true,  // pedir foto al devolver
  fotoPesoObjetivoKB: 100,          // peso aproximado de cada foto guardada
  fotoLadoMaximo: 1280,             // px del lado mayor antes de comprimir
  historialPorPagina: 40,
  alertaHorasEnUso: 14              // marca en rojo si un equipo lleva más de X horas fuera
};

// 3) Personal del almacén (lista para el primer registro)
export const PERSONAL = [
  "Alex Mendoza", "Andrés Nina", "Brayan Churqui", "Carlos Budiel",
  "Carlos Sanchez", "Christian Velasquez", "Fernando Quelloya", "Giler Urday",
  "Gretel Valencia", "Hernán del Carpio", "Javier Checasaca", "Jesus Lima",
  "Jimmy Gomez", "Jose Delgado", "José Tapia", "Josymar Luna",
  "Juan Berrio", "Juan Luis Huamani", "Pedro Carrasco", "Pedro Olivares",
  "Renzo Torres", "Roger Calcina", "Santos Guerra", "Wilfredo Cutipa"
];

// 4) Catálogo de equipos. Todo se maneja por CÓDIGO;
//    "asignados" es solo referencia visual (prioridad, no exclusividad).
export const EQUIPOS = [
  // ---------- PDA (14) ----------
  { codigo: "2830", tipo: "PDA", asignados: ["Fernando Quelloya"] },
  { codigo: "2831", tipo: "PDA", asignados: ["Jose Delgado"] },
  { codigo: "2833", tipo: "PDA", asignados: ["Pedro Carrasco"] },
  { codigo: "2841", tipo: "PDA", asignados: ["Roger Calcina"] },
  { codigo: "2842", tipo: "PDA", asignados: ["Pedro Olivares"] },
  { codigo: "2851", tipo: "PDA", asignados: ["José Tapia"] },
  { codigo: "2853", tipo: "PDA", asignados: ["Wilfredo Cutipa"] },
  { codigo: "2855", tipo: "PDA", asignados: ["Jimmy Gomez"] },
  { codigo: "2859", tipo: "PDA", asignados: ["Carlos Budiel"] },
  { codigo: "2860", tipo: "PDA", asignados: ["Juan Berrio"] },
  { codigo: "2892", tipo: "PDA", asignados: ["Jesus Lima"] },
  { codigo: "2899", tipo: "PDA", asignados: ["Giler Urday"] },
  { codigo: "2907", tipo: "PDA", asignados: ["Carlos Sanchez"] },
  { codigo: "2916", tipo: "PDA", asignados: ["Renzo Torres"] },

  // ---------- RADIOS ----------
  // OJO: en el Excel la radio 3061 figura para Pedro Carrasco Y Juan Berrio,
  // por eso hay 20 códigos de radio y no 21. Corrige el código que falte aquí.
  { codigo: "2439", tipo: "RADIO", asignados: ["Fernando Quelloya"] },
  { codigo: "2440", tipo: "RADIO", asignados: ["Josymar Luna"] },
  { codigo: "2441", tipo: "RADIO", asignados: ["Jesus Lima"] },
  { codigo: "2610", tipo: "RADIO", asignados: ["Renzo Torres"] },
  { codigo: "2775", tipo: "RADIO", asignados: ["Roger Calcina"] },
  { codigo: "2776", tipo: "RADIO", asignados: ["Javier Checasaca"] },
  { codigo: "3058", tipo: "RADIO", asignados: ["Carlos Sanchez"] },
  { codigo: "3059", tipo: "RADIO", asignados: ["Jimmy Gomez"] },
  { codigo: "3060", tipo: "RADIO", asignados: ["Wilfredo Cutipa"] },
  { codigo: "3061", tipo: "RADIO", asignados: ["Pedro Carrasco", "Juan Berrio"] },
  { codigo: "3062", tipo: "RADIO", asignados: ["Giler Urday"] },
  { codigo: "3063", tipo: "RADIO", asignados: ["Brayan Churqui"] },
  { codigo: "3064", tipo: "RADIO", asignados: ["Pedro Olivares"] },
  { codigo: "3065", tipo: "RADIO", asignados: ["José Tapia"] },
  { codigo: "3066", tipo: "RADIO", asignados: ["Andrés Nina", "Gretel Valencia"] },
  { codigo: "3161", tipo: "RADIO", asignados: ["Juan Luis Huamani"] },
  { codigo: "3388", tipo: "RADIO", asignados: ["Jose Delgado"] },
  { codigo: "3498", tipo: "RADIO", asignados: ["Carlos Budiel"] },
  { codigo: "8563", tipo: "RADIO", asignados: ["Christian Velasquez"] },
  { codigo: "8581", tipo: "RADIO", asignados: ["Hernán del Carpio"] }
];
