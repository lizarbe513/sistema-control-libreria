# Fase 3 — Implementación

La app real: **Tauri 2 + Rust** (base cifrada, reglas de negocio) con la interfaz **Svelte 5** que salió del
prototipo. Se construye por hitos, y cada hito queda usable, probado y en su commit.

## Cómo correrla

| Qué | Comando |
|---|---|
| App de escritorio (desarrollo) | `cd app && cargo tauri dev` (levanta la interfaz en el puerto 5175 y abre la ventana) |
| Solo la interfaz, en el navegador (modo demostración) | `cd ui && npm install && npm run dev` → http://localhost:5175 |
| Tests del núcleo | `cargo test -p libreria-core` (más `-- --ignored` para la consulta real de ISBN por internet) |
| Rendimiento de la búsqueda | `cargo test -p libreria-core --release rendimiento -- --nocapture` |
| Revisión estática | `cargo clippy --workspace --all-targets -- -D warnings` y `cd ui && npm run check` |
| Instalador de Windows | Hito 9 (GitHub Actions, `windows-latest`, NSIS) |

- En Linux hacen falta `webkit2gtk-4.1` y `libsoup3`.
- La primera compilación tarda unos 15–20 minutos, porque compila SQLCipher con OpenSSL incluido; las siguientes son incrementales.

En el navegador no hay Rust: la interfaz usa **`ApiDemo`**, un backend en memoria con los libros de ejemplo, que
imita las reglas del real (validaciones, roles, costos ocultos). Sirve para ver la interfaz y para las pruebas
automáticas. Dentro de Tauri se usa **`ApiTauri`**, que llama a Rust con `invoke`.

## Estructura

```
biblioteca/
├── Cargo.toml                 # workspace
├── crates/core/               # libreria-core: sin Tauri, con tests
│   ├── migraciones/           # SQL versionado (001 inicio, 002 inventario y tienda)
│   └── src/
│       ├── llave.rs           # Argon2id → llave cruda de SQLCipher
│       ├── db.rs              # abrir la base cifrada + migraciones
│       ├── carpeta.rs         # carpeta de datos portable (libreria.db, libreria.json, portadas/, respaldos/)
│       ├── usuarios.rs        # Dueña / Vendedor, PIN (Argon2id), preferencias, límite de intentos
│       ├── libros.rs          # alta, edición, stock con movimientos, etiquetas, categorías
│       ├── busqueda.rs        # búsqueda tolerante a tildes y errores de tipeo
│       ├── isbn.rs            # ISBN-10/13 y datos desde Open Library / Google Books
│       ├── portadas.rs        # portadas en JPEG ≤ 600 px
│       └── tienda.rs          # tienda en bloques y plantillas
├── app/src-tauri/             # libreria-app: fases, llavero, comandos con permisos
├── ui/                        # interfaz (Svelte 5 + Vite + TS + Three.js)
│   └── src/lib/api/           # contrato Api + ApiTauri + ApiDemo
├── prototipo/                 # prototipo de la fase de diseño (referencia)
└── docs/
```

## Decisiones

### Seguridad de los datos
- **Base cifrada con SQLCipher.** La llave son 32 bytes derivados de la contraseña maestra con **Argon2id**
  (64 MiB, 3 pasadas) y una sal propia de la carpeta. SQLCipher recibe la llave «cruda», así que no aplica su
  propio PBKDF2.
- **La llave se guarda en el llavero del sistema** (Administrador de credenciales en Windows; Secret Service en
  Linux), con el id de la carpeta como nombre. En el día a día solo se entra con el PIN de cada persona.
  - La contraseña maestra se pide si el llavero no tiene la llave: otro PC, restauración, o un equipo sin llavero.
- **El PIN** se guarda con hash Argon2id. Tras 5 intentos fallidos hay que esperar 30 s.
- **Los permisos se comprueban en Rust** en cada comando:
  - la Dueña ve y cambia costos;
  - los vendedores no ven costos y, al editar, no pueden cambiarlos;
  - editar libros: la Dueña, o los vendedores si ella lo permite en Ajustes;
  - diseñar la tienda: solo la Dueña.
- **Las preferencias y las notas de la libreta** se guardan por persona en la base cifrada, no en el
  almacenamiento del navegador. Solo el fondo y la calma se copian al equipo, para la pantalla de entrada.
- **Al cerrar la app se consolida el WAL**, así `libreria.db` queda completa para copiar la carpeta.
  - El WAL también va cifrado.
- **CSP estricta**, *capabilities* mínimas y protocolo de assets limitado a la carpeta `portadas/` activa.

### Búsqueda
Hay un **índice en memoria** en Rust, que se reconstruye cuando cambia el inventario, con el mismo algoritmo del prototipo:
- cada palabra buscada debe coincidir de forma exacta, por prefijo, como parte de una palabra o con 1–2 errores;
- el título pesa más y tener stock suma un poco;
- un ISBN o un código interno van directo al libro.

Con **10 000 libros, la consulta más lenta tarda unos 21 ms** (objetivo: < 100 ms). FTS5 no hizo falta: no tolera
errores de tipeo, y el índice en memoria ya cumple el objetivo con margen.

### Libros
- **Código:** el ISBN normalizado a ISBN-13 (acepta ISBN-10 y valida el dígito de control). Sin ISBN, se usa un
  código interno `SXXI-000123`.
- **El stock solo cambia con movimientos registrados:** alta, ingreso o ajuste. Las ventas y anulaciones llegarán
  en el hito 3. Nunca queda negativo.
- **Las bajas no borran:** el libro deja de aparecer, su historial se conserva y su ISBN se libera.
- **Ubicación:** estante + tramo + repisa, una referencia blanda a «Mi tienda». Si el compartimento deja de
  existir, la ficha muestra «Por revisar».
- **Búsqueda en internet por título o autor** (para libros sin ISBN):
  - Open Library es la base: devuelve portada, ISBN, editorial y año;
  - Google Books solo ayuda si responde, porque su cuota gratuita anónima se agota (se ignora en silencio; se puede
    guardar una clave propia en `config`, `clave_google_books`);
  - los resultados se ordenan (con portada y en español primero) y se quitan los repetidos;
  - al elegir uno se llena el formulario y su portada queda pendiente; la usuaria la puede cambiar por una imagen propia.
- **Datos por ISBN:**
  - se piden a Open Library, y Google Books completa lo que falte;
  - el *timeout* es de 6 s y, sin internet, aparece un aviso amable;
  - la usuaria revisa los datos antes de guardar.
- **Portadas:** se descargan o se eligen de un archivo, y se guardan como `portadas/<id>-<n>.jpg` (≤ 600 px).
  Sin portada se usa la generada del prototipo.

### Tienda en bloques
- **Divisiones verticales (tramos):** cada estante tiene «− N +» tramos (1 = repisas corridas, sin divisiones), en
  «Organizar» y en la tarjeta del estante. Con un solo tramo, la ubicación de un libro es «Tramo 1».
- **Repisas:** la tabla de madera se ve gruesa y sobresale al frente, y los libros se apoyan en ella.

El editor trabaja con el objeto `Tienda` completo (con deshacer). `tienda_guardar` reemplaza las filas de
`tienda`, `bloques` y `estantes` en una transacción, con *debounce* desde la interfaz.
- **Primer arranque:** se guarda la plantilla por defecto («SIGLO XXI (croquis)»).
- **Plantillas con nombre:** en `plantillas_tienda`.

### Red
`reqwest` con TLS nativo del sistema: en Windows usa SChannel, así que no necesita OpenSSL ni cmake para el
instalador.

## Estado de los hitos

| Hito | Contenido | Estado |
|---|---|---|
| 1. Cimientos | Workspace, base cifrada, carpeta portable, llavero, primer arranque, desbloquear, entrar con PIN, usuarias, preferencias | ✅ |
| 2. Inventario y búsqueda | Libros, stock, categorías, etiquetas, ISBN por internet, portadas, búsqueda tolerante, tienda en bloques y plantillas en la base, vista «Libros», ubicación elegida en la tienda 3D | ✅ |
| 3. Ventas | Carrito, tipos de cliente con %, métodos de pago, vuelto, anulación (Dueña) | Pendiente |
| 4. Encargos y clientes | Fichas, estados, aviso por WhatsApp, aviso al ingresar stock | Pendiente |
| 5. Reportes | Por período, más vendidos, cuadre de caja, exportar CSV | Pendiente |
| 6. Respaldos y configuración | Respaldo automático y manual, restaurar, tipos de cliente | Pendiente |
| 7. Celular | Servidor LAN (axum), vinculación por QR, escaneo de ISBN, app Android | Pendiente (falta el SDK de Android en el equipo de desarrollo) |
| 8. Asistente IA | Gemini + Groq, *function calling* sobre el inventario | Pendiente |
| 9. Entrega | Instalador de Windows (GitHub Actions), pruebas en el PC de la tienda | Pendiente |

## Cómo se probó (hitos 1 y 2)
- **`cargo test -p libreria-core`:** 28 tests, más 1 con red. Cubren:
  - el cifrado real y la llave equivocada;
  - PIN y bloqueo tras 5 intentos;
  - CRUD de libros y costos ocultos al vendedor;
  - stock sin negativos y validación de ISBN;
  - lectura de Open Library y Google Books (con JSON guardado) y portadas;
  - ida y vuelta de la tienda, plantillas, y búsqueda con tildes, errores y filtros;
  - rendimiento.
- **Playwright sobre la interfaz** (modo demostración):
  - primer arranque y entrada con PIN, incluido un PIN incorrecto;
  - cuentas de vendedores;
  - alta de un libro por ISBN con ubicación;
  - búsqueda con errores, ficha y edición.
- **App real de punta a punta con `tauri-driver` + `WebKitWebDriver`** (Linux):
  1. configurar por la interfaz y comprobar que `libreria.db` y su WAL no tienen texto en claro;
  2. reabrir y que el llavero la desbloquee sola;
  3. entrar con PIN;
  4. agregar un libro con datos reales de Open Library y su portada descargada;
  5. buscarlo con un error de tipeo y ver su ficha;
  6. reabrir y que siga ahí.

## Preparar Android (hito 7)

Para compilar el APK hacen falta el SDK de Android y un teléfono (o el emulador). En este equipo ya están el
JDK 17, `yay`, `/dev/kvm` y espacio en disco; faltan estas piezas, que se instalan con `sudo`:

```bash
# 1. SDK (herramientas de línea de comandos, plataforma-tools y NDK) desde AUR
yay -S android-sdk-cmdline-tools-latest android-sdk-platform-tools android-ndk
sudo gpasswd -a $USER sdkusers        # permite usar /opt/android-sdk sin sudo (cerrar sesión y volver a entrar)

# 2. Licencias y plataformas
export ANDROID_HOME=/opt/android-sdk
yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "platforms;android-35" "build-tools;35.0.0"
```

Variables que usa Tauri (se agregan a `~/.bashrc` o `~/.zshrc`):

```bash
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk   # Gradle no soporta bien el JDK 26
export ANDROID_HOME=/opt/android-sdk
export NDK_HOME=/opt/android-ndk
```

Teléfono: Android 8 o superior, con *Opciones de desarrollador → Depuración por USB*, conectado por cable y
aceptando la huella de la PC en su pantalla (`adb devices` debe listarlo). Sin teléfono se puede usar el emulador
(`/dev/kvm` está disponible; la imagen del sistema pesa unos 3 GB).

Lo demás lo hace el desarrollo: `rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android`,
`cargo tauri android init` y la compilación del APK.
