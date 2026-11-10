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
- **Panel:** estado en vivo de los equipos, buscar por código o nombre, filtros por tipo, Disponible/En uso y **Mis equipos** (asignados a ti o en tu poder). Rojo = más de 14 h fuera (`alertaHorasEnUso`).
- **Historial (público):** solo los movimientos de HOY, en vivo, con foto.
- **/panel (con código):** `https://mamz1303.github.io/control-equipos/panel/` → consulta por Día, Mes o Rango,
  vista Lista o Fotos, descarga de fotos y **Exportar CSV** del periodo. La sesión dura 8 h en ese celular.
  El código se cambia en `js/admin.js` (`HASH_CODIGO` = SHA-256 del código).
- Si alguien retira un equipo que figura con otra persona, la app avisa y deja constancia en el historial.
- Sin señal: el registro se guarda en el celular y se envía solo al recuperar conexión.

## Modo pruebas / paso a producción
- En la consola: Firestore → **Iniciar colección** `config` → ID de documento `app` → campo `modoPruebas` (boolean) = `true`.
  Con eso aparece **Borrar datos** en /panel.
- Para producción: cambia `modoPruebas` a `false` (el botón desaparece y las reglas bloquean el borrado).

## Capacidad (plan gratuito Spark)
Firestore da 1 GB. Con 2 fotos por persona y turno (~26 personas) se usan ~5 MB/día → ~6 meses.
Cuando se acerque al límite, borra la colección `fotos` antigua desde la consola (los movimientos se conservan).

## Panel de control (/panel)
Se entra desde **Panel → 🔒 Control** en la app, con cualquiera de los códigos autorizados (sesión de 8 h).
- **Registros:** consulta por día/mes/rango, lista o fotos, exportar CSV, borrar datos (solo en modo pruebas).
- **Equipos:** agregar, editar código/tipo/asignados, dar de baja. **⚙ Tipos de equipo** para crear tipos nuevos (Tablet, Linterna…) con su ícono, u ocultarlos.
- **Personal:** agregar, corregir nombre, asignar equipos, **reemplazar** (sus equipos pasan al nuevo; el historial queda con el nombre anterior) y dar de baja/reactivar.
- **QR:** genera el PDF de etiquetas para todos, por tipo o los que marques. Los equipos nuevos o con código cambiado quedan marcados solos.

La primera vez que se edita algo, el catálogo inicial (Excel, en `js/config.js`) se copia a Firebase. Desde ahí, todo se administra en el panel y `config.js` ya no se usa para equipos ni personal.

Para agregar otro código de acceso: calcula su SHA-256 y súmalo a la lista `HASHES` en `js/admin.js`.

## Turnos, equipos no devueltos y daños
- **Horarios de cierre de turno:** en /panel → Resumen (por defecto 07:00 y 19:00, tolerancia 30 min). Un equipo es **no devuelto** si sigue fuera después del cierre del turno en que se retiró + tolerancia. Se ve en rojo en la app (inicio de la persona y Panel → "No devueltos") y en el Resumen, con exportación a CSV.
- **Reporte de daño:** al devolver, "Reportar daño o falla" + descripción. El equipo queda **En revisión** y no se puede retirar (ni por lista, ni por QR). Se libera en /panel → Equipos (o desde el Resumen) con "Liberar: reparado"; el administrador también puede enviar un equipo a revisión. Todo queda en el historial.
- **Resumen:** estado actual (disponibles, en uso, no devueltos, en revisión) y, por periodo (hoy, 7 días, 30 días, mes): retiros, devoluciones, devueltos tarde, daños, uso por tipo, equipos que más salen, personas con más horas de uso y quién no devuelve a tiempo.

## Ajustes (en `js/config.js`)
- Foto opcional → `fotoObligatoriaRetiro: false`.
- `alertaHorasEnUso` solo se usa si se borran todos los horarios de cierre de turno.
- Después de subir cambios de código, sube la versión en `sw.js` (`equipos-v4`, …) para que los celulares se actualicen.
