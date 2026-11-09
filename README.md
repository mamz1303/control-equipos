# Control de PDA y Radios · Almacén Cerro Verde

App web instalable (PWA) para registrar retiro y devolución de PDA y radios.
Hosting: **GitHub Pages** · Datos: **Firebase (Firestore + sesión anónima)**.

## Estructura
```
index.html              pantalla única de la app
css/styles.css          diseño (azul Freeport / naranja Cerro Verde)
js/config.js            ← ÚNICO archivo a editar: Firebase, personal y equipos
js/app.js               lógica de pantallas
js/backend.js           Firebase o MODO DEMO (si config.js no tiene Firebase)
js/scanner.js           lector de QR con la cámara
js/imagen.js            compresión de fotos a ~100 KB
sw.js / manifest        para instalarla como app
firestore.rules         reglas de seguridad para pegar en Firebase
```

## Puesta en marcha (≈15 min)

### 1. Firebase
1. https://console.firebase.google.com → **Agregar proyecto** (ej. `control-equipos-almacen`). Analytics no es necesario.
2. **Compilación → Authentication → Comenzar → Método de acceso → Anónimo → Habilitar.**
3. **Compilación → Firestore Database → Crear base de datos** → modo producción → región `southamerica-east1` (São Paulo) o `us-east1`.
4. En Firestore → pestaña **Reglas**: pega el contenido de `firestore.rules` → **Publicar**.
5. ⚙ **Configuración del proyecto → Tus apps → `</>` (Web)** → registra la app → copia el objeto `firebaseConfig`.
6. Pégalo en `js/config.js` (reemplaza el bloque vacío).

> No se usa Firebase Storage: las fotos (~100 KB) se guardan dentro de Firestore, así todo queda en el plan gratuito.

### 2. GitHub Pages
1. Crea el repositorio **`control-equipos`** en tu cuenta `mamz1303` (público).
2. Sube TODO el contenido de esta carpeta (no la carpeta en sí) a la raíz del repo.
3. **Settings → Pages → Branch: main / (root) → Save.**
4. En 1–2 min queda en: `https://mamz1303.github.io/control-equipos/`

Si usas otro nombre de repositorio, las etiquetas QR deben regenerarse con la nueva dirección.

### 3. Etiquetas QR
- `etiquetas_qr_equipos.pdf`: página 1 = cartel de acceso para pegar en el almacén;
  siguientes = una etiqueta por equipo (34). Imprimir al 100 %, recortar y plastificar/cinta transparente.
- Cada etiqueta abre la app con ese equipo ya elegido: si lo tienes tú → **Devolver**, si no → **Retirar**.
  Dentro de la app, el botón **QR** lee esas mismas etiquetas.

## Cómo funciona
- **Primera vez:** cada persona elige su nombre (queda guardado en ese celular). “No soy yo” para cambiar.
- **Retirar:** toca PDA, Radio o ambos → se propone su equipo asignado si está libre (o escanea el QR) → foto → Registrar.
- **Devolver:** si la persona tiene equipos, el inicio muestra **Devolver equipo** con todo autocompletado; solo falta la foto.
- **Panel:** estado en vivo de los 34 equipos, buscar por código o nombre (asignado o quien lo tiene), filtros PDA/Radio y Disponible/En uso. Rojo = más de 14 h fuera (`alertaHorasEnUso`).
- **Historial:** todos los movimientos con foto; **Exportar CSV** abre en Excel.
- Si alguien retira un equipo que figura con otra persona, la app avisa y deja constancia en el historial.
- Sin señal: el registro se guarda en el celular y se envía solo al recuperar conexión.

## Capacidad (plan gratuito Spark)
Firestore da 1 GB. Con 2 fotos por persona y turno (~26 personas) se usan ~5 MB/día → ~6 meses.
Cuando se acerque al límite, borra la colección `fotos` antigua desde la consola (los movimientos se conservan).

## Cambios frecuentes (en `js/config.js`)
- Agregar/quitar personal → lista `PERSONAL`.
- Agregar equipo o cambiar asignado → lista `EQUIPOS` (el código es lo que importa).
- Foto opcional → `fotoObligatoriaRetiro: false`.
- Después de subir cambios, sube la versión en `sw.js` (`equipos-v2`, …) para que los celulares se actualicen.
