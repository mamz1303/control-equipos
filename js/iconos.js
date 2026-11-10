// Íconos ilustrados para los tipos de equipo. Para un tipo nuevo se elige uno de esta lista.
export const ICONOS_DISPONIBLES = [
  ["pda", "PDA"], ["radio", "Radio"], ["tablet", "Tablet / celular"], ["lector", "Lector / pistola"],
  ["laptop", "Laptop"], ["linterna", "Linterna"], ["llave", "Llave / herramienta"], ["generico", "Otro"]
];

export function icono(clave, oscuro = false) {
  const C = oscuro ? "#FFFFFF" : "#0A2F6B";      // cuerpo
  const P = oscuro ? "#0A2F6B" : "#BFD3F2";      // pantalla
  const D = oscuro ? "#0A2F6B" : "#FFFFFF";      // detalles
  const N = "#F47B20";                           // naranja
  const svg = (x) => `<svg viewBox="0 0 64 64" aria-hidden="true">${x}</svg>`;
  switch (clave) {
    case "pda":
      return svg(`<rect x="22" y="3" width="20" height="9" rx="3" fill="${N}"/>
        <rect x="14" y="9" width="36" height="52" rx="8" fill="${C}"/><rect x="19" y="14" width="26" height="19" rx="2.5" fill="${P}"/>
        <rect x="22" y="19" width="14" height="2.5" rx="1" fill="${C}" opacity=".35"/><rect x="22" y="24" width="18" height="2.5" rx="1" fill="${C}" opacity=".35"/>
        ${[0, 1, 2].map((r) => [0, 1, 2].map((c) => `<rect x="${20.5 + c * 8.5}" y="${38 + r * 6.5}" width="6" height="4" rx="1.3" fill="${D}"/>`).join("")).join("")}
        <rect x="27" y="57" width="10" height="2" rx="1" fill="${N}"/>`);
    case "radio":
      return svg(`<rect x="18" y="1" width="6" height="18" rx="3" fill="${oscuro ? "#FFFFFF" : "#14213D"}"/>
        <rect x="36" y="5" width="8" height="9" rx="2" fill="${N}"/><rect x="10" y="26" width="5" height="13" rx="2" fill="${N}"/>
        <rect x="14" y="12" width="36" height="50" rx="8" fill="${C}"/><rect x="20" y="18" width="24" height="11" rx="2.5" fill="${P}"/>
        ${[0, 1, 2, 3, 4].map((i) => `<rect x="21" y="${35 + i * 4.5}" width="22" height="2.2" rx="1.1" fill="${D}"/>`).join("")}`);
    case "tablet":
      return svg(`<rect x="8" y="10" width="48" height="44" rx="7" fill="${C}"/><rect x="13" y="15" width="38" height="31" rx="2.5" fill="${P}"/>
        <circle cx="32" cy="50" r="2" fill="${N}"/><rect x="18" y="21" width="20" height="3" rx="1.2" fill="${C}" opacity=".35"/>
        <rect x="18" y="27" width="26" height="3" rx="1.2" fill="${C}" opacity=".35"/><rect x="18" y="33" width="14" height="3" rx="1.2" fill="${C}" opacity=".35"/>`);
    case "lector":
      return svg(`<path d="M8 14h40a6 6 0 0 1 6 6v6a6 6 0 0 1-6 6H34l-6 26a3 3 0 0 1-3 2h-8a2 2 0 0 1-2-2.5L20 32H8a4 4 0 0 1-4-4v-10a4 4 0 0 1 4-4Z" fill="${C}"/>
        <rect x="50" y="16" width="8" height="14" rx="2" fill="${N}"/><rect x="10" y="19" width="20" height="8" rx="2" fill="${P}"/>
        <path d="M58 18 63 14M58 23h5M58 28l5 4" stroke="${N}" stroke-width="2" stroke-linecap="round"/>`);
    case "laptop":
      return svg(`<rect x="12" y="12" width="40" height="28" rx="3" fill="${C}"/><rect x="16" y="16" width="32" height="20" rx="1.5" fill="${P}"/>
        <path d="M4 44h56l-4 8H8Z" fill="${C}"/><rect x="26" y="46" width="12" height="2" rx="1" fill="${N}"/>`);
    case "linterna":
      return svg(`<path d="M18 6h28l-4 16H22Z" fill="${C}"/><rect x="22" y="22" width="20" height="38" rx="4" fill="${C}"/>
        <rect x="21" y="5" width="22" height="5" rx="2" fill="${N}"/><rect x="29" y="30" width="6" height="10" rx="2" fill="${N}"/>
        ${[0, 1, 2].map((i) => `<rect x="25" y="${45 + i * 4}" width="14" height="2" rx="1" fill="${D}" opacity=".6"/>`).join("")}`);
    case "llave":
      return svg(`<circle cx="20" cy="20" r="14" fill="${C}"/><circle cx="20" cy="20" r="6" fill="${D}"/>
        <path d="M29 29 56 56l-5 5-4-4 3-3-3-3-3 3-3-3 3-3-11-11Z" fill="${C}"/><circle cx="20" cy="20" r="2.5" fill="${N}"/>`);
    default:
      return svg(`<rect x="8" y="16" width="48" height="40" rx="6" fill="${C}"/><path d="M8 26h48" stroke="${D}" stroke-width="2"/>
        <rect x="24" y="10" width="16" height="10" rx="3" fill="none" stroke="${C}" stroke-width="4"/><rect x="27" y="32" width="10" height="10" rx="2" fill="${N}"/>`);
  }
}
