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
- **El stock solo cambia con movimientos registrados:** alta, ingreso, ajuste, venta o anulación. Nunca queda negativo.
- **Las bajas no borran:** el libro deja de aparecer, su historial se conserva y su ISBN se libera.
- **Borrador del libro nuevo:** si se sale del cajón sin guardar (Esc, clic afuera, Cancelar o cambiando de vista),
  lo escrito se conserva en memoria y se recupera al volver («Empezar de cero» lo descarta). No se escribe a disco y
  se olvida al cerrar la sesión.
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
- **Visor de ubicación** (ficha del libro y cajón de «Libros»): se gira arrastrando, **Espacio + clic derecho** mueve la
  maqueta, las flechas la recorren y la rueda hace zoom. Al elegir un estante en las listas, la cámara vuela a enfocarlo.
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

## Ventas (hito 3)

**Cálculo** (`crates/core/src/ventas.rs`; la interfaz lo imita en `ui/src/lib/ventas/calculo.ts` solo para mostrar los
totales mientras se arma la venta, pero al registrar el núcleo **recalcula todo** con los precios de la base):
1. subtotal de cada línea = precio × cantidad;
2. descuento del libro (% o monto);
3. descuento del tipo de cliente (Público 0 %, Profesor 15 %, Mayorista 25 %; la Dueña los edita en Ajustes);
4. descuento al total (% o monto);
5. **redondeo en efectivo:** lo que se paga en efectivo se baja a múltiplo de 10 céntimos (en Perú no circulan
   monedas de 1 y 5 céntimos). Tarjeta, Yape/Plin y transferencia cobran exacto. El redondeo se guarda en la venta.

Los porcentajes se redondean al céntimo a favor del cliente. Todo en céntimos enteros.

**Pagos:** uno o varios por venta (efectivo, tarjeta, Yape/Plin, transferencia). Cada pago aporta un monto y la suma
debe ser exactamente el total. Solo el efectivo da vuelto: se guarda lo recibido y el vuelto de cada pago.

**Permisos:**
- cualquiera que haya entrado vende;
- los descuentos a mano (por libro o al total) de una vendedora tienen un **tope** (10 % de partida; la Dueña lo
  cambia en Ajustes). El descuento del tipo de cliente no cuenta contra el tope. La Dueña no tiene tope;
- **anular una venta solo la Dueña:** exige un motivo, devuelve el stock con un movimiento `anulacion` y no borra
  nada (la venta queda tachada en el historial).

**Integridad:** registrar una venta es **una sola transacción**: la venta, sus ítems, sus pagos y el descuento de
stock. Si falta stock o los pagos no cuadran, no queda nada a medias. El título y el % del tipo de cliente se copian
en la venta, para que el historial no cambie si luego se editan.

**Libro que ya existía:** al agregar un libro nuevo (elegido en internet, o escrito) que ya está en el inventario —
típicamente agotado—, en vez de rechazarlo por duplicado se ofrece **sumar los ejemplares que llegaron** a ese libro
(movimiento de ingreso, y la carta de «¡llegó!» si había encargos). También se puede editar ese libro o, si es otra
edición, crearlo igual (un ISBN repetido nunca se crea).

**Nombre del cliente:** campo opcional en la venta. Vacío, queda «Cliente»; si se enlaza un cliente registrado, su
nombre se rellena solo. Se guarda en la venta (`cliente_nombre`), así que el historial no cambia si la ficha se edita.

**Yape y su QR:** el botón de Yape/Plin lleva la insignia de Yape. Al elegirlo se muestra el **QR del negocio**, que la
Dueña sube en **Ajustes → Métodos de pago** (se guarda como `qr-yape.png` en la carpeta de datos, así viaja con ella y
con los respaldos). Sin QR, el cobro muestra un recuadro discontinuo con el muñequito confundido y el camino a Ajustes.

**Venta en curso en 3D:** una bolsa de papel donde van entrando los libros (hasta 4 ejemplares); con 5 o más, la bolsa
sale y entra una caja de cartón que se cierra. Respeta el modo calma (sin animaciones queda estática).

**Al confirmar:** ventana de resumen tipo papelito con el Osito (moño, bolsa con 2 libros, caminando hacia la derecha) y
una explosión de pétalos. No es un comprobante de pago (sin SUNAT). Las «Ventas del día» tienen aspecto de papelito de
caja, con el Osito de una sola tinta.

**Interfaz:** vista «Vender» (buscar y agregar con Enter o con ＋, tipo de cliente, cliente opcional con alta rápida,
cobrar), «Ventas del día» con selector de fecha y anulación, «Hoy» en Inicio y el botón «Vender» de la ficha.
Al confirmar cae una lluvia breve de corazones y pétalos (si las animaciones están activas).
El día de «hoy» es el **día local**: la interfaz convierte el día a instantes UTC y el núcleo no sabe de zonas horarias.

## Encargos y clientes (hito 4)

**Estados:** pendiente → pedido al proveedor → llegó → avisado → entregado / cancelado. Entre los activos se puede mover
libremente (botón «→ siguiente» o arrastrando la tarjeta en el tablero); cada paso guarda su fecha. **«Entregado» solo
ocurre al registrar la venta** («Vender y entregar» precarga Vender con el libro, el cliente y el adelanto).

**Adelanto:** opcional al encargar, con su método de pago. Se guarda en `encargo_pagos` y **cuenta en la caja del día en
que se recibió** (el resumen por método suma pagos de ventas + adelantos). Al entregar, la venta guarda `adelanto_cent`
y solo se cobra el saldo (el redondeo de efectivo trata el adelanto como parte no efectivo). Al cancelar se elige si se
devolvió: la devolución es una fila negativa con la fecha de hoy. Anular la venta de una entrega reabre el encargo
(«avisado») con su adelanto.

**¿Lo encargamos?:** en Buscar (sin resultados) precarga el título buscado; en la ficha de un libro agotado, el libro.
El encargo puede ser de un libro del inventario o escrito a mano; luego se enlaza con un libro.

**Búsqueda en internet y precio del encargo:** el formulario tiene una pestaña «🔎 Buscar en internet» (la misma de
«Nuevo libro»): se elige el libro exacto con su portada. Si ya estuvo en el inventario (por ISBN o por título y autor),
se usa ese libro y su precio. Si no, se puede anotar el **costo del proveedor** (opcional): el precio sugerido es costo +
**margen de ganancia** (30 % de partida; la Dueña lo cambia en Ajustes), subido a los 10 céntimos, y se puede corregir. El
precio acordado se guarda en el encargo y se usa para el saldo y el mensaje de WhatsApp.

**Carta con sello de cera:** al ingresar stock de un libro que alguien esperaba (pendiente/pedido) aparece la carta con
«Marcar como llegó» y «Avisar por WhatsApp». Al dar de alta un libro nuevo, la carta pregunta si es el que encargaron
cuando un encargo sin libro tiene un título parecido (normalizado, contención o Jaro-Winkler ≥ 0,92).

**WhatsApp:** la URL `https://wa.me/<número>?text=…` se arma en Rust (un celular de 9 dígitos que empieza con 9 recibe
el 51) y se abre con `tauri-plugin-opener` **desde Rust**: la interfaz no tiene permiso para abrir direcciones
arbitrarias. La plantilla se edita en Ajustes con `{cliente}` (primer nombre), `{libro}`, `{tienda}` y `{saldo}`.
Si el encargo estaba en «llegó», pasa a «avisado».

**Clientes:** pestaña dentro de Encargos. Ficha editable (nombre, teléfono/WhatsApp, correo, tipo, notas) con su
historial de compras (sin anuladas) y de encargos. La búsqueda encuentra el teléfono aunque se escriba sin espacios.

**Libro apartado:** al agregar en Vender un libro que está apartado para el encargo de otro cliente (llegó/avisado) y
no sobra stock, se avisa (no se impide).

## Reportes (hito 5)

Solo la Dueña (el núcleo lo exige, no solo la interfaz). Todo se calcula en `crates/core/src/reportes.rs`.

- **Período:** Hoy, Ayer, Esta semana (lunes a domingo), Este mes, Últimos 30 días, Este año o fechas a elección. La
  interfaz elige los días **locales** y los manda como instantes UTC `[desde, hasta)` más el desfase local (`tzMin`,
  Perú −300): el núcleo no conoce zonas horarias, solo agrupa con ese desfase. Hasta 92 días se agrupa por día; más, por mes.
  Los días sin ventas aparecen en cero.
- **Resumen:** vendido, nº de ventas y libros, ticket promedio, descuentos (con el redondeo), anuladas (no cuentan) y
  **ganancia estimada** = lo vendido − el costo de esos libros. El costo se **congela en cada venta**
  (`venta_items.costo_unit_cent`): si el costo del libro sube después, el historial no cambia.
- **Caja:** lo cobrado por método = pagos de las ventas + adelantos (y devoluciones) de encargos del período.
- **Más vendidos** (top 10 por unidades), **por categoría**, **por tipo de cliente** y **por vendedora**.
- **Libros sin movimiento:** con stock y sin ventas ni ingresos de stock desde hace 30/60/90/180/365 días (se mira lo
  más reciente entre la última venta, el último ingreso y el alta). Muestra los 50 más antiguos, cuántos son en total y
  **cuánta plata detenida** hay (stock × costo): candidatos a oferta o liquidación.
- **Exportar a Excel (CSV):** ventas (una fila por libro), más vendidos, caja y sin movimiento. El archivo se escribe en
  Rust a la ruta que se elige en el diálogo de guardar (permiso `dialog:allow-save`), en UTF-8 con BOM para que Excel lea
  bien las tildes. Los textos que empiezan con `= + - @` se neutralizan (inyección de fórmulas) y las comas y comillas se escapan.

## Respaldos y configuración (hito 6)

**Formato:** un `.zip` (`respaldo-AAAAMMDDTHHMMSSZ-<tipo>.zip`, hora UTC; la interfaz la muestra en hora local) con la base
(`libreria.db`, **sigue cifrada**: el zip es seguro aunque vaya a la nube y solo se abre con la contraseña maestra),
`libreria.json`, las portadas, el QR de cobro y un manifiesto. Se escribe a un temporal y se renombra al final: nunca
queda un zip a medias. Antes de copiar se hace un *checkpoint* del WAL y se copia con la app abierta, bajo el candado del estado.

**Tipos:** *automático* (uno al día), *manual* y *de seguridad* (antes de restaurar o de cambiar la contraseña maestra).
La retención (por defecto los últimos 14, configurable de 3 a 60) solo borra automáticos: los otros nunca se borran solos.

**Destino:** siempre se guarda uno en `respaldos/` de la carpeta de datos y, si la Dueña eligió una **carpeta externa**
(pendrive, OneDrive, Google Drive…), se copia también ahí. Si la carpeta externa no está disponible (pendrive
desconectado) el respaldo interno se hace igual y se avisa. Un respaldo manual puede además guardarse en otra carpeta.

**Cuándo:** un hilo en segundo plano revisa 20 s después de abrir y luego cada hora, y otra vez al cerrar la app; solo
hace uno si pasaron 24 h. Ajustes muestra el último («Al día», amarillo o rojo), la lista, y la pantalla de Inicio le
recuerda a la Dueña si no hay respaldo reciente o si los respaldos solo están en este PC.

**Restaurar** (Ajustes → lista → «Restaurar…», o «Restaurar desde un archivo…»): en dos fases.
1. *Preparar:* extrae a `.restaurando/` y **verifica abriendo la base con la contraseña** (si es incorrecta, el zip está
   dañado o trae archivos ajenos —o rutas tipo *zip-slip*— no se toca nada y **no se pierde la sesión**).
2. *Aplicar:* hace un respaldo de seguridad de lo actual, cierra la base, reemplaza base, `libreria.json`, portadas y QR, y
   reabre con la contraseña del respaldo (el llavero se actualiza). Termina sin sesión: se vuelve a entrar con el PIN.
En un **PC nuevo**, la bienvenida tiene «Restaurar desde un respaldo (.zip)»: elige el zip, la carpeta nueva y la contraseña.

**Contraseña maestra:** Ajustes → Seguridad. Pide la actual (con límite de intentos), hace un respaldo de seguridad y
re-cifra la base (`PRAGMA rekey`) **conservando la sal**, para que `libreria.json` nunca quede desfasado de la base si algo
se corta. Los respaldos anteriores siguen pidiendo la contraseña con la que se hicieron.

**«Olvidé mi PIN»:** en la pantalla de entrada, al elegir a la Dueña. Pide la contraseña maestra (mismo límite de
intentos) y un PIN nuevo; el núcleo solo lo permite para una Dueña (a las vendedoras les cambia el PIN ella).

## Celulares (hito 7)

**Idea:** el celular no tiene base de datos propia. Es una app (Tauri para Android, la misma interfaz) que habla con el PC
de la tienda por el WiFi: una sola fuente de datos, siempre al día. El PC debe estar encendido con la app abierta.

**Servidor en el PC** (`app/src-tauri/src/{servidor,rpc,celular}.rs`):
- HTTPS (`tokio-rustls` con `ring`) con un **certificado propio**, que se crea la primera vez y se guarda **dentro de la base
  cifrada**. Escucha en el puerto 47321 (o el siguiente libre). Se enciende en Ajustes → Celulares y solo corre con la
  librería abierta.
- **Vinculación:** el PC muestra un QR (`siglo://vincular?h=<ips>&p=<puerto>&c=<código>&f=<huella>&n=<tienda>`) con un código
  de 8 letras de **un solo uso que vale 5 minutos** (cinco intentos fallidos bloquean 30 s). El celular recibe un **token de
  256 bits**; en la base solo queda su hash SHA-256. Cada celular tiene el suyo y la Dueña lo puede **desconectar** (el token
  deja de servir al instante).
- **Órdenes:** `POST /api/rpc/<orden>` con el token. `rpc.rs` llama a **las mismas funciones** que usa la interfaz del PC, así
  los permisos y las reglas son idénticos. Quedan fuera las que solo tienen sentido en el PC (configurar, abrir carpetas,
  respaldos, exportar, editor de la tienda). WhatsApp: el PC devuelve la dirección y el celular la abre.
- **Sesión por celular:** cada celular entra con el PIN de una persona, con el mismo límite de intentos. La sesión del celular
  se guarda aparte (vence a las 12 h sin uso) y se aplica a la orden con una variable por hilo (`estado::como_celular`): **un
  celular sin sesión nunca hereda la del PC** y el PC y el celular pueden tener personas distintas a la vez (hay una prueba
  para esto).
- Portadas: `GET /portadas/<archivo>` (solo nombres simples) con el token.

**Seguridad de la conexión:** los datos viajan cifrados. El celular **fija el certificado del PC por su huella** (la del
QR): si quien responde presenta otro certificado, rustls corta el apretón de manos **antes de enviar el token**
(`lan_cliente.rs`, con prueba). Vincular a mano (sin QR) fija la huella que presenta el PC en ese momento.

**App del celular** (`ui/src/lib/api/lan.ts`, `acceso/{Vincular,SinConexion}.svelte`, `vistas/Escanear.svelte`):
`ApiLan` es la misma API que el PC, pero cada orden va por el comando `lan_pedir` (Rust). Si el PC no responde, aparece
«No encuentro el PC»; si lo desconectaron, vuelve a «Vincular». En Ajustes del celular se ocultan las secciones que son
solo del PC (respaldos, celulares, contraseña maestra, QR de Yape).

**Escaneo continuo de ISBN:** botón 📷 del encabezado → cámara (plugin oficial `barcode-scanner`, en ventana, con la
pantalla transparente) → si el ISBN ya está, tarjeta «Ya lo tienes» con +1 / +5 / N; si es nuevo, formulario con los datos
de internet (título, autor, portada) para precio, costo, stock y categoría → «Guardar y siguiente». Un contador muestra
cuántos títulos y ejemplares van en la tanda. Sin cámara (o sin permiso) se puede escribir el ISBN a mano.

**Segunda vuelta, tras la primera prueba en el teléfono:**
- **Pantalla inmersiva:** `MainActivity.kt` oculta las barras del sistema. Aparecen un momento al deslizar desde el borde
  (`BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE`). `app/src-tauri/gen/android` ahora se versiona, para que estos cambios no se
  pierdan; quedan fuera lo que se genera (`build/`, `.gradle`, `jniLibs`, `assets`).
- **Botón «atrás»** (`ui/src/lib/atras.svelte.ts`, con `onBackButtonPress` de Tauri):
  1. primero cierra lo que esté encima (ficha, cobro, comprobante, cajones, carta, un libro a la vista en el escáner);
  2. luego vuelve al panel anterior;
  3. en Inicio pide tocar dos veces para salir.
  - En el navegador de pruebas queda como `window.__atras`.
- **Deslizar entre paneles** (Inicio · Buscar · «+» · Encargos · Más): gesto horizontal rápido de más de 70 px. No se
  activa sobre campos, el 3D, filas con desplazamiento (`data-sin-deslizar`) ni con una capa abierta.
- **Menú «Más»** (`vistas/Mas.svelte`): Libros, Clientes, Reportes (Dueña) y Ajustes.
- **Panel «+» (`vistas/Nuevo.svelte`):** guardar libros es lo principal del celular. Tres tarjetas grandes:
  - **Escanear el ISBN:** escaneo continuo del código de barras;
  - **Leer el título:** cámara **dentro de la app** (`componentes/LectorTitulo.svelte`, con `getUserMedia`; el WebView
    pide el permiso de cámara por su cuenta), con linterna si el teléfono la tiene. El flujo es **foto → selección →
    lectura**:
    1. se toma la foto, que es exactamente lo que se veía en pantalla;
    2. se marca el título con el dedo: un rectángulo con asas para ajustarlo;
    3. **solo ese recorte** (agrandado si es chico) se lee en el teléfono con ML Kit (plugin propio `OcrPlugin.kt`,
       registrado con `register_android_plugin`; sin internet). Así no se cuelan subtítulos ni editorial;
    4. después se puede marcar también el autor y buscar en internet. La foto no se guarda. Tras guardar el libro, la
       cámara se abre sola para el siguiente.
  - **Escribir el título:** búsqueda en internet por título y autor, o llenar los datos a mano.

  Debajo queda «Nueva venta». Dentro de «Guardar libros» se cambia de forma con las pestañas ISBN · Título · A mano.
  Después de guardar, se sigue en la misma forma.
- **Detalles al guardar libros:**
  - **Portada:** sale de internet.
  - **Ubicación:** los libros nuevos llevan la ubicación elegida (`componentes/SelectorUbicacion.svelte`), que se recuerda
    para el siguiente. A uno que ya estaba se le cambia la ubicación, guardando su ficha completa; el PC conserva el costo
    si quien registra no lo ve.
  - **Sin duplicados:** si el libro elegido en internet ya está (por ISBN o, sin ISBN, por título y autor), aparece
    «Ya lo tienes» para sumar stock.
  - **Al leer un código o un título:** vibración corta y un «bip» (Web Audio). Se apagan en Ajustes → «Este celular».
- **Buscar → 📷:** lee el ISBN y abre la ficha con la ubicación. Si el libro no está, ofrece «¿Lo encargamos?» con los datos
  de internet.
- **Si el router le cambia la IP al PC:** cuando ninguna dirección responde, el celular recorre su red /24 (`lan_descubrir`)
  buscando **el certificado fijado**: solo el PC vinculado pasa el TLS. Guarda la nueva dirección y reintenta.

**Estado:** probado.
- `cargo test`: sesiones, tokens, huella, descubrimiento, portada en base64.
- e2e con la app real y un navegador con pantalla de celular (vincular, PIN, deslizar, «atrás», menú «Más», escaneo con
  ubicación recordada y cambiada, panel «+», búsqueda por título con portada, sin duplicados, libro a mano, ficha,
  vender, desconectar). La lectura del título con ML Kit solo se puede probar en el teléfono.
- El APK se instaló en un teléfono real y se vinculó por código. Falta que la tienda confirme la cámara (ISBN, lectura del
  título, ficha) en el teléfono.

### Compilar e instalar el APK (sin cable)

```bash
scripts/apk.sh     # compila aarch64 + armv7, alinea, firma y deja Libreria-SIGLO-XXI.apk en Descargas
```

Para que Android acepte la actualización encima de la app instalada, se sube `version` en `app/src-tauri/tauri.conf.json`
(de ahí sale el `versionCode`).

Por dentro, el APK de *release* sale sin firmar: el script lo alinea y lo firma con `zipalign` y `apksigner` (build-tools 35.0.0) usando la llave
`~/.android/siglo-xxi-release.jks` (**fuera del repositorio**; su contraseña está en `~/.android/siglo-xxi-release.pass`). Hay
que **guardar esa llave**: las actualizaciones del APK deben firmarse con la misma. El archivo final es `Libreria-SIGLO-XXI.apk`
(paquete `pe.sigloxxi.libreria`, permisos de Internet y cámara). Se pasa al teléfono por Drive, WhatsApp o un pendrive OTG y se
instala permitiendo «orígenes desconocidos» para esa app. Con el teléfono conectado por USB (`adb devices`) también sirve
`cargo tauri android dev`. Si el PC tiene UFW, el celular necesita llegar al servidor:
`sudo ufw allow from 192.168.1.0/24 to any port 47321 proto tcp`.

## Mejoras tras el hito 7

- **Cuentas con CRUD completo** (Ajustes → Usuarias): además de crear y cambiar el PIN, se **editan** (nombre y rol)
  y se **quitan**. Quitar es una baja lógica: las ventas, los encargos y los movimientos siguen a su nombre.
  - Nadie se puede quitar a sí misma, y la tienda nunca se queda sin Dueña (no se puede quitar ni bajar de rol a la
    última).
  - Las órdenes que llegan del celular vuelven a leer la cuenta de la base (`Abierta::usuaria`). Si la Dueña la quitó,
    ese celular deja de poder hacer cosas al instante; si le cambió el rol, el cambio rige enseguida.
- **Dar de baja un libro con stock:** un diálogo propio (`componentes/Confirmar.svelte`, igual en PC y celular y se
  cierra con «atrás») avisa cuántos ejemplares quedan y sugiere ajustar el stock en su lugar.
- **«Libros»:** los agotados van en su propia sección, apagados (opacidad y gris), pero se abren y se editan igual.
  Recuperan el color al pasar el mouse. En «Buscar» también se ven apagados.
- **Categorías propias:**
  - `libros::{crear_categoria, editar_categoria, eliminar_categoria}`. La clave sale del nombre y el color pastel y el
    patrón se eligen solos. Solo se elimina una categoría sin libros, ni siquiera dados de baja.
  - Se crean con «+ Nueva» en el formulario del libro y en «Guardar libros» del celular (quien puede editar libros), y
    se administran en Ajustes → Categorías (Dueña: renombrar, color, eliminar).
  - La interfaz ya no tiene una lista fija: `categorias.svelte.ts` es un registro reactivo alimentado por la base.

## Asistente IA (hito 8)

**Idea:** una asistente que lee la tienda por ti y la resume: qué libros hay, cuáles se agotaron, qué reponer,
recomendaciones del inventario real y, para la Dueña, ventas, ganancias y reportes. También redacta mensajes para
clientes. Funciona en el PC y en el celular (Más → Asistente).

**Proveedores** (`crates/core/src/ia.rs`):
- Gemini como principal y Groq como respaldo, los dos con plan gratuito. Ambos tienen un endpoint **compatible con
  OpenAI** (`/chat/completions` con `tools`, `/models`), así que hay un solo cliente (`OpenAiCompat`) con dos
  configuraciones.
- Si un proveedor falla, se pasa al siguiente y se queda con él durante esa conversación:
  - sin red, sin cupo (429) o error del servidor;
  - con una clave inválida (401/403) se explica que hay que revisarla en Ajustes.
- Los mensajes del modelo vuelven **tal cual** (Gemini exige devolver sus firmas de pensamiento).
- El modelo de cada proveedor se elige en Ajustes. Los nombres de los modelos gratuitos cambian; «Probar» lista los que
  la clave puede usar.

**Herramientas** (`crates/core/src/asistente.rs`): el modelo no ve la base. Solo puede pedir herramientas, que la app
ejecuta con los permisos de quien pregunta:
- **para todos:** `buscar_libros`, `catalogo` (hojear una categoría en formato compacto, para recomendar por gustos),
  `detalle_libro`, `resumen_inventario`, `agotados_y_por_agotarse`, `categorias`, `encargos_activos`,
  `sugerir_reposicion`;
- **solo la Dueña:** `reporte_ventas` (totales, ganancia, caja por método, por vendedora y por categoría, inmovilizado),
  `mas_vendidos`, `libros_sin_movimiento`, y los costos y el valor del inventario. A los demás ni se les ofrecen, y si
  el modelo las pide igual, no se ejecutan.
- Hasta 5 rondas de herramientas por pregunta; en la última se le pide responder con lo que juntó.

**Privacidad:**
- Ninguna herramienta devuelve nombres, teléfonos ni notas de clientes. Los encargos van solo con título, cantidad y
  estado. Hay una prueba que lo verifica, y el e2e confirma que el servidor de IA nunca los recibe.
- La conversación queda solo en memoria y se borra si entra otra persona.

**Citas de libros:**
- El modelo cita los libros como `[[libro:ID]]` y la interfaz los muestra como fichas (portada, precio, stock,
  ubicación) que abren el libro.
- Los ids que no salieron de una herramienta se borran (`depurar_citas`): el modelo no puede inventar libros.

**Configuración:**
- Ajustes → Asistente IA (Dueña, en el PC) trae los pasos para sacar las claves gratis en Google AI Studio y en
  console.groq.com.
- Las claves se guardan en `config`, **dentro de la base cifrada**; a la interfaz solo vuelven sus últimas 4 letras.

**Celular:** `asistente_preguntar` va por `rpc.rs`:
- se prepara con la sesión del celular (rol incluido) y la conversación con la IA corre sin el candado del estado;
- el tiempo de espera del celular para esa orden es de 150 s.

**Probado:**
- `cargo test`:
  - el bucle con un proveedor guionado: herramienta → respuesta, respaldo ante 429, error claro ante 401, límite de
    rondas;
  - la lectura de respuestas de Gemini y Groq;
  - las herramientas, los roles, la privacidad, las fechas en hora peruana y las citas inventadas;
  - la configuración de claves.
  - Además, `ia::tests::con_red_real` con claves reales, en variables de entorno (`--ignored`).
- e2e contra la app real con un servidor falso compatible con OpenAI (`SIGLO_IA_URL`, solo en compilaciones de
  desarrollo):
  - Gemini sin cupo pasa a Groq;
  - la ficha del libro citado se abre y la cita inventada se borra;
  - la Dueña recibe ventas y la vendedora no recibe herramientas de dinero;
  - ningún dato de cliente llega a la IA.

### La bibliotecaria virtual: internet y acciones con confirmación

**Libros que la tienda no tiene:**
- Si se piden explícitamente, o el inventario no tiene nada que encaje, la IA propone títulos y los verifica con
  `buscar_en_internet`, el mismo buscador de libros de la app.
- Corre en la app sin el candado, porque va por la red. Cada resultado queda en memoria con una referencia `wN` y la IA
  lo cita como `[[web:wN]]`.
- En el chat sale una tarjeta con portada, datos, «No está en la tienda» y **«Encargar»**. «Encargar» abre el
  formulario del encargo con ese libro ya elegido (`Precarga.resultado`): solo falta el cliente.
- Si el ISBN ya está en la tienda, se cita como libro de la tienda.

**Agente** (`crates/core/src/agente.rs`):
- **Lo que puede proponer:** `proponer_encargo`, `proponer_estado_encargo` (pedido / llegó), `proponer_stock`,
  `proponer_editar_libro` y `proponer_libro_nuevo`.
- **Ninguna modifica nada.** Validan los datos y los permisos de quien pregunta y arman una explicación hecha por la app:
  qué se hará, sobre qué libro o encargo, y el antes → después.
- A un vendedor sin permiso para editar libros solo se le ofrecen encargos.

**Propuestas y confirmación:**
- La propuesta queda en memoria (`asistente::Memoria`): es de esa persona, vence a los 30 minutos y se usa una sola vez.
- La IA cita `[[accion:pN]]` y en el chat aparece la tarjeta: explicación, **Confirmar** y «No, gracias».
- `asistente_confirmar` la ejecuta con **los mismos comandos de siempre** (permisos idénticos), también desde el
  celular. Después muestra «Ver encargo» / «Abrir el libro» y deja una nota en la conversación, para que la IA sepa que
  se hizo.

**Clientes y privacidad:**
- Los encargos son siempre de un cliente. La IA pregunta para quién es, y el cliente **se elige en la tarjeta**:
  registrado (se busca) o nuevo (nombre y celular). Ese dato nunca va a la IA; el e2e lo verifica.

**Nada de eliminar:**
- No hay herramientas para dar de baja, cancelar ni borrar.
- La IA explica dónde se hace y da un enlace `[[ir:…]]`: `libro:ID` abre su edición, `encargo:ID` resalta el encargo,
  y también Ajustes → Usuarias o Categorías.
- Los destinos desconocidos se borran.

**Probado:**
- `cargo test`:
  - validación y explicación de cada propuesta (permisos, stock negativo, estados, costo solo para la Dueña, ISBN
    repetido);
  - que proponer no cambia la base;
  - los destinos de enlaces;
  - las citas inventadas de `web`, `accion` e `ir`;
  - que no hay herramientas para eliminar.
- e2e con el servidor de IA falso y la búsqueda real en internet:
  - tarjetas de internet con «Encargar»;
  - encargo con cliente nuevo elegido en la tarjeta; confirmar dos veces no lo duplica; «Ver encargo» lo resalta;
  - stock +5 al confirmar y nada con «No, gracias»;
  - «dar de baja» solo da el enlace, que abre la edición;
  - la vendedora sin permiso no recibe `proponer_stock`;
  - ningún dato de cliente llega a la IA.

## Estado de los hitos

| Hito | Contenido | Estado |
|---|---|---|
| 1. Cimientos | Workspace, base cifrada, carpeta portable, llavero, primer arranque, desbloquear, entrar con PIN, usuarias, preferencias | ✅ |
| 2. Inventario y búsqueda | Libros, stock, categorías, etiquetas, ISBN por internet, portadas, búsqueda tolerante, tienda en bloques y plantillas en la base, vista «Libros», ubicación elegida en la tienda 3D | ✅ |
| 3. Ventas | Carrito, tipos de cliente con %, descuentos, pago dividido, vuelto, redondeo en efectivo, anulación (Dueña), ventas del día | ✅ |
| 4. Encargos y clientes | Fichas con historial, tablero por estados, adelanto, aviso por WhatsApp, carta al ingresar stock, entrega desde Vender | ✅ |
| 5. Reportes | Por período, más vendidos, categorías, ganancia, cuadre de caja, libros sin movimiento, exportar CSV | ✅ |
| 6. Respaldos y configuración | Respaldo automático y manual con carpeta externa, restaurar, cambiar la contraseña maestra, «olvidé mi PIN» | ✅ |
| 7. Celular | Servidor LAN (HTTPS), vinculación por QR, guardar libros por ISBN, título leído con la cámara o escrito, app Android inmersiva con «atrás» y deslizar | ✅ |
| 8. Asistente IA | Bibliotecaria virtual: Gemini + Groq, herramientas sobre inventario, encargos y reportes (dinero solo para la Dueña), recomendaciones de internet con «Encargar», acciones con confirmación (sin eliminar), sin datos de clientes | ✅ (probado con claves reales); acciones e internet: falta probarlas en la tienda |
| 9. Entrega | Instalador de Windows (GitHub Actions, firmado, con prueba de humo), actualización automática de PC y celular, publicación al etiquetar; guía en `docs/04-entrega.md` | ✅ v1.0.0 publicada; v1.1.0 preparada (fondo «Noche quieta», modo rendimiento arreglado, esqueletos de carga, icono propio) para probar la actualización automática; falta la prueba en el PC de la tienda |

## Cómo se probó (hitos 1 a 6)
- **`cargo test -p libreria-core`:** 63 tests, más 2 con red. Cubren:
  - el cifrado real y la llave equivocada;
  - PIN y bloqueo tras 5 intentos;
  - ventas: el orden de los descuentos, el redondeo solo en efectivo, el pago dividido con vuelto, que un pago
    incorrecto o la falta de stock no dejen nada a medias, el tope de las vendedoras, la anulación (solo la Dueña,
    una sola vez, también con el libro dado de baja) y los resúmenes;
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

Para compilar el APK hacen falta el SDK de Android y un teléfono. En este equipo ya están el JDK 17, `yay`, `cmdline-tools` y
`platform-tools` (en `/opt/android-sdk`). Faltan estos pasos (el único `sudo` es el primero):

```bash
# 1. /opt/android-sdk pasa a ser del usuario (así sdkmanager puede instalar sin sudo)
sudo chown -R $USER:$USER /opt/android-sdk

# 2. Licencias + plataforma + herramientas de compilación + NDK
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk       # Gradle no soporta bien el JDK 26
export ANDROID_HOME=/opt/android-sdk
yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses
$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager "platforms;android-35" "build-tools;35.0.0" "ndk;27.2.12479018"

# 3. Variables permanentes
cat >> ~/.bashrc <<'EOF'
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk
export ANDROID_HOME=/opt/android-sdk
export NDK_HOME=/opt/android-sdk/ndk/27.2.12479018
export PATH=$PATH:/opt/android-sdk/platform-tools
EOF
```

Teléfono: Android 8 o superior, con *Opciones de desarrollador → Depuración por USB*, conectado por cable y aceptando la huella
de la PC (`adb devices` debe listarlo). Debe estar en el **mismo WiFi** que el PC. Ya están agregados los *targets* de Rust
(`aarch64-linux-android`, `armv7-linux-androideabi`, `i686-linux-android`, `x86_64-linux-android`).

`cargo tauri android init` y la compilación del APK.
