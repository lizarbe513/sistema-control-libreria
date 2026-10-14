# Fase 2 — Diseño

> "Una biblioteca acogedora en rosa."
> La interfaz pesa tanto como la funcionalidad. Tiene que guiar a quien la usa, pero también ser un lugar
> cómodo y bonito donde dé gusto estar: que encontrar un libro se sienta tan bien como encontrarlo
> en el estante.

---

## 1. Sistema visual

### 1.1 Referencia
`.referencia/Untitled.jpg`: fondo rosa muy claro, tarjetas blancas muy redondeadas, botones píldora rosados,
acentos pastel (amarillo, lila, menta), barra inferior con un botón "+" central destacado, ilustraciones
suaves y "infladas" (sol con nube, corazones).

Agregamos el mundo de la biblioteca: libros con volumen, papel, estantes, pétalos y música suave.

### 1.2 Paleta (tokens)

| Token | Claro (día) | Nocturno (cielo estrellado) | Uso |
|---|---|---|---|
| `--bg` | `#FDEFF2` | `#1E1A33` | fondo general |
| `--surface` | `#FFFFFF` | `#2C2648` | tarjetas |
| `--surface-glass` | `rgba(255,255,255,.72)` | `rgba(44,38,72,.66)` | paneles sobre fondo animado |
| `--surface-2` | `#FFF7F9` | `#352E57` | tarjetas secundarias |
| `--primary` | `#F27A9B` | `#FF9DBB` | botones, activo, "+" |
| `--primary-strong` | `#E5587F` | `#FFB8CD` | hover, texto sobre rosa claro |
| `--primary-soft` | `#FBD3DE` | `#4A3A66` | tarjetas destacadas |
| `--text` | `#2B2B2B` | `#F4EEFF` | texto principal |
| `--muted` | `#8A8A8A` | `#B3A9CF` | texto secundario |
| `--yellow` | `#FCEFC7` | `#5A4E2E` | acento / categoría |
| `--lilac` | `#E9E3FB` | `#433A6B` | acento / categoría |
| `--mint` | `#DDF3E4` | `#2F4A42` | acento / categoría |
| `--sky` | `#DDEFFB` | `#2E4058` | acento / categoría |
| `--sand` | `#EAD9B8` | `#EAD9B8` | libreta (igual en ambos modos) |
| `--success` | `#4CB782` | `#7EE0AE` | stock ok, venta hecha |
| `--warning` | `#F2B24C` | `#FFD08A` | stock bajo |

Cada **estante** y cada **categoría** recibe un color de acento. Así el color se vuelve una pista visual
consistente: el estante lila del mapa es el mismo lila de la etiqueta del libro.

### 1.3 Forma, sombra y tipografía
- **Radios:** 12 px (chips), 20 px (tarjetas), 28 px (paneles), píldora (botones).
- **Sombras:** suaves y teñidas de rosa: `0 8px 24px rgba(242,122,155,.15)`.
- **Tipografía:**
  - **Nunito** (400/600/800): redondeada y amable, para toda la interfaz.
  - **Caveat** (manuscrita): solo en la libreta y en detalles "escritos a mano".
  - Ambas van empaquetadas en la app, para que funcione sin internet.
- **Iconos:** de línea redondeada (Lucide), en 1.75 px.

### 1.4 Movimiento
- **Todo tiene resorte**: las cosas aparecen con un pequeño rebote, no de forma lineal. Usamos `spring` de Svelte.
- **Duraciones:** 150 ms para micro-interacciones, 300–500 ms para paneles y 700–900 ms para el libro 3D.
- **Calma:** nada parpadea ni compite por atención; las animaciones de fondo son lentas.
- **Accesibilidad:**
  - se respeta `prefers-reduced-motion`,
  - en "Ajustes de calma" se pueden apagar las animaciones, los pétalos y los sonidos,
  - existe un "modo rendimiento" para PCs modestos.

---

## 2. Distribución de pantallas

### 2.1 Escritorio (PC de la tienda, principal)
```
  ┌───────────┬──────────────────────────────┬────────────────┐
  │ 📻 Radio  │  🔍 Buscar libro, autor...   │                │
  │  ♪ ♫  🌸→ │                              │   📖 Libro 3D  │
  ├───────────┤  Resultados (tarjetas)       │  (aparece con  │
▐ │ 🏠 Inicio │  ┌────┐ ┌────┐ ┌────┐        │    rebote)     │
▐ │ 🔍 Buscar │  │    │ │    │ │    │        │                │
▐ │ ＋ Vender │  └────┘ └────┘ └────┘        │ 📍 ESTANTE B   │
L │ 📦 Encarg.│                              │    REPISA 3    │
i │ 📊 Report.│                              │  [tienda 3D]   │
b │ ✨ Asist. │                              │                │
r │ ⚙ Ajustes │                              │ [Vender][Enc.] │
e ├───────────┤                              │                │
t │ 👤 Rosa   │                              │                │
a └───────────┴──────────────────────────────┴────────────────┘
  ▐ = pestaña de la libreta (borde izquierdo)
```
- **Columna izquierda:** la radio arriba, la navegación al medio y el usuario abajo.
- **Centro:** el contenido de la sección.
- **Panel derecho** (en Buscar): el libro protagonista, con su ubicación y acciones rápidas.

### 2.2 Celular (Android)
Igual que la referencia:
- **Barra inferior:** Inicio · Buscar · **＋ Venta** · Encargos · Perfil.
- **Encabezado:** mini radio y botón de escáner 📷.
- La **ficha del libro** se abre como hoja a pantalla completa, con el libro 3D, la ubicación y el mapa.
- **Sin libreta.**
- El fondo animado viene en "Fondo quieto" por defecto, para cuidar la batería.

### 2.3 Lista de pantallas
| Pantalla | PC | Celular | Notas |
|---|:-:|:-:|---|
| Desbloqueo (contraseña maestra) | ✅ | — | solo en el PC, al abrir la base de datos |
| Inicio de sesión (usuario + PIN) | ✅ | ✅ | avatares grandes, teclado PIN redondeado |
| Inicio | ✅ | ✅ | saludo según la hora, ventas de hoy, encargos, stock bajo |
| Buscar | ✅ | ✅ | resultados + libro 3D + ubicación |
| Ficha de libro / edición | ✅ | ✅ | |
| Escaneo continuo | — | ✅ | carga inicial del inventario |
| Nueva venta | ✅ | ✅ | tipo de cliente, descuentos, pago, vuelto |
| Encargos | ✅ | ✅ | tablero por estado |
| Clientes | ✅ | ✅ | |
| Reportes | ✅ | ✅ (solo Dueña) | |
| Asistente IA | ✅ | ✅ | chat |
| Ajustes | ✅ | parcial | usuarios, mapa, tipos de cliente, IA, respaldos, calma, fondo |
| Mi tienda (editor en bloques) | ✅ | — | ver C |
| Vincular celular (QR) | ✅ | ✅ | |

---

## 3. Momentos especiales

### A. "Libro encontrado": libro 3D con aparición saltarina
**Idea:** darle protagonismo al libro encontrado. Recrear el momento en que lo sacas del estante y
lo miras, apreciando su diseño.

- **Dónde:** panel derecho en el PC; ficha del libro en el celular.
- **Modelo:** procedural con Three.js, sin archivos 3D. Lleva tapas con un leve bisel, lomo y bloque de páginas
  con textura de hojas. Las proporciones varían según el tipo de libro (un diccionario es grueso,
  un cuento infantil es ancho y delgado).
- **Portada:**
  1. La imagen de Open Library o Google Books, descargada al dar de alta el libro y guardada como
     miniatura WebP en la carpeta `portadas/` junto a la base de datos.
  2. Si no hay imagen, se puede tomar una foto con el celular.
  3. Si tampoco hay foto, una **portada generada** con el color de la categoría, un patrón suave y el título en
     tipografía bonita.
- **Lomo:** título y autor generados en un canvas.
- **Animación de aparición** (≈900 ms):
  1. El libro cae desde arriba, girando un poco.
  2. "Aterriza" con un ligero aplastamiento (squash & stretch) y rebota dos veces con un resorte amortiguado.
  3. Aparecen destellos ✨ alrededor.
  4. Queda flotando suavemente y girando despacio de un lado a otro.
- **Interacción:**
  - arrastrar para girarlo,
  - clic para **abrir la tapa** (bisagra animada) y ver la sinopsis en la primera página,
  - otro clic para cerrarla.
- **Rendimiento:**
  - renderiza solo mientras está visible,
  - `devicePixelRatio` limitado a 1.5,
  - sin WebGL, se usa una portada 2D con la misma animación hecha en CSS.

### B. Radio con pétalos
- **Dónde:** arriba a la izquierda en el PC; mini radio en el encabezado del celular.
- **Widget:** radio retro pastel ilustrada con:
  - play/pausa, siguiente y volumen,
  - el título de la canción en marquesina,
  - una antena que se balancea al ritmo.
- **Música:**
  - 10–15 pistas relajantes **libres de derechos** (CC0 o licencia libre, en Opus) empaquetadas en la app. Funcionan
    sin internet y sin problemas de derechos de autor en el local.
  - Estaciones online opcionales (lofi, piano, naturaleza), configurables en Ajustes.
- La música **sigue sonando** al navegar entre pantallas (estado global).
- **Pétalos:**
  - nacen del widget y viajan hacia la derecha con el viento: deriva, balanceo senoidal y un giro tipo
    moneda que hace que el pétalo "brille" al voltearse;
  - se desvanecen al llegar a los bordes;
  - hay un máximo de unos 30 y solo salen mientras suena la música;
  - con las pistas locales, la cantidad de pétalos **sigue la intensidad de la música** (Web Audio
    `AnalyserNode`). Las estaciones online no lo permiten por CORS, así que ahí la cantidad es fija.
- Los pétalos se dibujan en la misma capa del fondo animado (ver E).

### C. Ubicación física: texto grande + tienda 3D en bloques
El croquis (`.referencia/screenshot-2026-10-13_12-10-15.png`) muestra un local de un solo piso:
- la fachada está abierta a la calle;
- hay estantes de madera en U, cajas abiertas con libros, mesitas y el mostrador;
- hay **escaleras que suben** a la parte alta;
- tiene **4 hojas de puerta** que se abren hacia la vereda y llevan **ligas transparentes** donde se exhiben los libros llamativos o más pedidos.

Un plano 2D no alcanza, así que **la tienda se modela con bloques, como en Minecraft**.

**Modelo**
- Cuadrícula de celdas de 0,5 m. Las medidas son configurables: ancho, largo interior, vereda y alto.
- **Escala de referencia**: una persona mide aproximadamente **1 tramo de ancho × 3 repisas de alto**. Una repisa es 1 bloque (50 cm), un tramo son 2 bloques (1 m) y la bibliotecaria mide 3 bloques (≈ 1,5 m). Los estantes de pared de la tienda tienen 5 repisas (≈ 2,5 m), así que las escaleras sirven para alcanzar las altas.
- **Catálogo por categorías**:
  - **Construcción**: plataforma, pared, escalera, baranda y alfombra.
  - **Muebles para libros**: estantería, caja, mesita y puerta con ligas.
  - **Atención**: mostrador, caja registradora y banquito.
  - **Decoración**: gatito, flores de pared, lámparas de pie y colgante, planta, globo terráqueo, reloj, guirnalda, pizarrita «Recomendado», cuadro y letrero.
  - Los objetos de pared se cuelgan de la cara apuntada.
- Los muebles para libros pertenecen a un **estante** (id fijo + letra visible, nombre, tema y color).
- **Tramos y repisas de tamaño libre**: cada estante guarda dónde empieza cada tramo (`inicioTramo`) y dónde hay tablas (`tablas`). Un tramo puede medir 2 bloques y una repisa 1, o lo que se quiera.
- **Divisiones por defecto**:
  - estanterías: tramos de 2 bloques y repisas de 1;
  - puertas: columnas y ligas de 1;
  - cajas y mesitas: sin dividir.
- Un libro guarda `estante + tramo + repisa`. Cada tipo nombra la posición a su manera:
  - «Tramo · Repisa»;
  - «Columna · Liga»;
  - «Dentro de la caja»;
  - «Sobre la mesita».
- Si el compartimento deja de existir, la ficha avisa «ubicación por revisar».

**Tarjeta de ubicación**
- **ESTANTE A** en grande, con «Tramo 1 · Repisa 3» y el mini indicador de repisas.
- **Tienda 3D** en solo lectura:
  - la cámara vuela al compartimento y este late entero;
  - un pin flota delante;
  - los demás estantes se atenúan;
  - unas huellitas marcan el camino desde la vereda.
- Sin WebGL o en modo rendimiento se muestra un **plano cenital SVG** con lo mismo.

**Editor «Mi tienda»** (PC; en la app, solo la Dueña)
- **Inventario** (`E`): ventana por categorías con buscador. Los **íconos son el propio objeto renderizado en 3D**. Un clic lleva el objeto al **hotbar**, que empieza vacío porque cada usuaria arma su paleta (`1–9`; clic derecho vacía una ranura).
- **Herramientas** al costado del hotbar:
  - 🧽 **Borrador** (`X`) e interruptor; combinado con el relleno vacía zonas.
  - 👆 **Seleccionar** (`V`): abre una tarjeta del estante con letra (si ya existe, se intercambian), nombre, tema y color, más *Unir con…*, *Separar desde aquí* y *Borrar*.
  - 🗂️ **Organizar** (`O`, o el botón de la tarjeta del estante): un dibujo **de frente** del estante, con cada compartimento numerado (T2·R3). Un clic en la línea entre dos columnas separa o une tramos, y entre dos filas, repisas. Hay atajos (tramos de 1–4 bloques, repisas de 1–3, todo junto) y se puede numerar desde la izquierda o la derecha y desde arriba o abajo. Al pasar el mouse por un cuadro se resalta ese compartimento en la tienda 3D, y mientras está abierto aparecen sus números flotando sobre el estante.
  - ▦ **Relleno** (`F`): clic en una punta y clic en la otra. La segunda punta se toma **apuntando a una pared o a la cara de un bloque**, así que el relleno también sube o baja. Un relleno de muebles crea un **estante conectado**.
- **Selección como Minecraft**: un contorno enmarca el bloque bajo el cursor (o el cuadro del piso o de la pared). Clic pone en la cara apuntada y clic derecho quita.
- **Estantes con bordes**: el marco se dibuja solo donde termina el estante, según sus vecinos, con la franja del color fuerte del estante, y cada estante lleva su **cartel** con la letra. Dentro se ven los divisores de tramo y las tablas de repisa.
- **Panel derecho**:
  - pestaña **Estantes**: la lista;
  - pestaña **Tienda**:
    - medidas;
    - **Nueva tienda vacía**, para borrar todo y construir desde la base;
    - **plantillas con nombre**: guardar la actual, cargar, ★ por defecto (la que se carga al empezar y con «Restaurar») y borrar;
    - «SIGLO XXI (croquis)» viene incluida.
- **Moverse por la maqueta**: clic derecho gira, **Espacio + clic derecho desplaza** (como en Blender), clic central también desplaza, rueda hace zoom, **Shift + rueda** sube o baja la vista y las flechas recorren el piso.
- **Borrar sin rastro**: si un estante se queda sin bloques desaparece del todo (lista, cartel, color y divisiones); los libros que apuntaban ahí quedan como «ubicación por revisar».
- **Caminar** (`G`): la bibliotecaria aparece en la vereda y recorre la maqueta. Mide 3 bloques, camina con **WASD** o flechas, salta con **Espacio** (≈ 1,25 bloques), va despacio con **Shift**, mira arrastrando el mouse y hace zoom con la rueda. **C** alterna tercera y primera persona. No atraviesa estantes, mostradores ni paredes; las **escaleras (de madera y de pared) se suben solas** y las plataformas se pueden pisar. Al acercarse a un estante aparece «📍 Estante A · Obras literarias». `Esc` vuelve al editor.
  - **Nunca queda atrapada**: si hay un bloque donde debía aparecer, nace en el lugar libre más cercano; si cae un bloque sobre ella, se reubica sola; y **R** (o el botón «↩ Volver a la entrada») la devuelve a la entrada, por ejemplo si cae a un hueco cerrado. Si no hay ningún espacio libre, avisa y no entra al modo.
- **Modo enfoque** (`Tab`): oculta el menú, la radio, la libreta y el panel, y la tienda ocupa toda la pantalla con un chip «Rosa diseñando ✨». El panel se abre como cajón (`P`) y el fondo animado se pausa.
- Deshacer y rehacer (`Ctrl+Z` / `Ctrl+Y`), guardado automático, altura visible y vista de planta.
- **Rendimiento**: un `InstancedMesh` por tipo y por pieza de marco, texturas procedurales y **dibujado bajo demanda**.

### D. Libreta color arena (solo PC)
- **Pestaña:** un marcapáginas de tela rosa asoma en el borde izquierdo. También se abre con `Ctrl+L`.
- **Apertura:** se desliza desde la izquierda con un resorte y la interfaz de atrás se oscurece apenas.
- **Diseño:**
  - papel arena (`--sand`) con textura sutil de grano,
  - renglones finos y margen rojo,
  - costura en el lomo y esquinas algo gastadas,
  - letra **Caveat**,
  - fecha en la cabecera de cada hoja.
- **Hojas:** varias, con animación de pasar página (la esquina se curva) y botón "nueva hoja".
- **Guardado:** automático mientras se escribe (debounce de 600 ms), en la base de datos cifrada, por usuario.
  El indicador muestra "guardado ✓" escrito a mano.

### E. Fondos animados e interactivos
- **Elección:** en Ajustes o con el selector rápido junto al avatar; se guarda por usuario. Opciones:
  - cada fondo por separado,
  - **"Según la hora"**: pétalos de día (06–17 h), estanque al atardecer (17–19 h), estrellas de noche;
  - **"Fondo quieto"**: imagen estática, para PCs lentos.
- Los paneles grandes usan `--surface-glass` con `backdrop-filter: blur(14px)` para que el fondo se vea.
- El fondo solo recibe clics en zonas vacías; los elementos de la interfaz nunca se bloquean.

| Fondo | Ambiente | Al interactuar |
|---|---|---|
| 🌸 **Lluvia de pétalos** | Pétalos rosados cayendo en diagonal con brisa; fondo rosa claro con ramas de cerezo difuminadas en las esquinas | **Clic** → ráfaga de viento circular que dispersa los pétalos cercanos en espiral. **Mover el mouse** → brisa suave que los empuja. A veces cruza una **mariposa**; si la tocas, revolotea y se va. |
| 🪷 **Estanque de nenúfares** | Agua verde-menta con reflejos ondulantes, nenúfares flotando, flores de loto rosadas, cáusticas de luz | **Clic** → onda concéntrica que se expande y **mece los nenúfares** que alcanza. **Clic en una flor** → se abre o cierra lentamente. De vez en cuando pasa un **pez koi**; si haces clic cerca, se asusta y huye. |
| 🌌 **Cielo estrellado** | Degradado nocturno lila/azul con nebulosa rosada, estrellas que titilan en capas (parallax con el mouse) y una luna | **Clic** → **estrella fugaz** que nace en ese punto. **Arrastrar** → dibuja una **constelación** que une las estrellas cercanas con líneas brillantes, que luego se desvanecen. Activa la **paleta nocturna**. |

- **Integración con la radio:** los pétalos de la radio se suman al fondo activo.
  - Pétalos: aumenta la densidad.
  - Estanque: los pétalos caen al agua y generan pequeñas ondas.
  - Cielo: se convierten en chispitas.
- **Técnica:**
  - Componente `FondoAnimado` con una interfaz común de **escena**:
    ```ts
    interface Escena {
      iniciar(ctx: ContextoEscena): void;
      cuadro(dt: number): void;          // avanzar y dibujar
      puntero(x: number, y: number): void;
      clic(x: number, y: number): void;
      arrastre?(x: number, y: number): void;
      emitirPetalos?(x: number, y: number, n: number): void; // desde la radio
      redimensionar(w: number, h: number): void;
      destruir(): void;
    }
    ```
  - Un solo bucle `requestAnimationFrame` para todo.
  - Pétalos y cielo en Canvas 2D con sprites prerenderizados.
  - El estanque usa Canvas 2D con ondas analíticas (se puede pasar a WebGL si hace falta).
  - El bucle **se pausa** con la ventana oculta o minimizada (`visibilitychange`) y baja a 30 fps en modo rendimiento.
  - Para agregar un fondo nuevo (lluvia en la ventana, otoño, chimenea…) basta escribir otra escena.

### F. Detalles que mantienen la coherencia
- **Saludo según la hora**, como en la referencia: "Buenos días, Rosa" con un sol y una nube; "Buenas noches" con una luna.
- **Venta completada:** una lluvia breve de corazones o pétalos y un "ding" suave (opcional).
- **"No lo encontré":** ilustración de un libro buscando con una lupa, con el botón **"¿Lo encargamos?"** que
  precarga el encargo con lo que se buscó. Es la pieza clave para no perder clientes.
- **Encargo que llegó:** el aviso tiene forma de carta con sello de cera.
- **Estados vacíos** ilustrados y con un tono cálido ("Todavía no hay ventas hoy… ¡ya llegarán! ☕").

---

## 4. Arquitectura técnica

```
biblioteca/
├── crates/
│   ├── core/      # dominio, base de datos (SQLCipher), búsqueda, reglas de negocio
│   ├── server/    # API LAN (axum) para el celular
│   └── ai/        # adaptador de IA (Gemini + Groq)
├── app/           # Tauri 2 (escritorio + Android)
│   └── src-tauri/
├── ui/            # frontend Svelte 5 + Vite + TS (sale del prototipo)
├── prototipo/     # prototipo visual (fase de diseño)
└── docs/
```

### 4.1 Backend (Rust)
- **Base de datos:**
  - `rusqlite` con la feature `bundled-sqlcipher-vendored-openssl`, para compilar en Windows sin dependencias externas;
  - migraciones versionadas;
  - llave derivada de la contraseña maestra (SQLCipher usa PBKDF2 internamente).
- **Búsqueda:**
  - FTS5 con `remove_diacritics` y prefijos, para que "corazon" encuentre "corazón";
  - la tolerancia a errores de tipeo se logra con trigramas, más un ranking por similitud (Jaro-Winkler) sobre los
    mejores candidatos.
- **Servidor LAN:**
  - `axum` embebido en el proceso de Tauri del PC, en HTTPS con certificado autofirmado;
  - el celular recibe el fingerprint en el QR de vinculación (certificate pinning) y un token por dispositivo.
- **IA:**
  - trait `ProveedorIA` con dos implementaciones: `Gemini` (Flash-Lite, plan gratuito) y `Groq`
    (respaldo automático ante error o límite);
  - *function calling* con `buscar_libros`, `ver_libro`, `resumen_ventas` (solo Dueña) y `encargos_pendientes`;
  - un filtro de salida garantiza que nunca se envíen datos personales de clientes;
  - límite diario configurable.
- **Comandos Tauri:** el frontend del PC llama al `core` directamente con `invoke`; el del celular usa la API LAN.
  Ambos pasan por una misma interfaz `Api` en TypeScript, con dos implementaciones.

### 4.2 Modelo de datos (resumen)
| Tabla | Campos clave |
|---|---|
| `libros` | id, isbn?, codigo_interno?, titulo, autor, editorial, anio, sinopsis, portada_archivo, categoria_id, precio_cent, costo_cent, stock, stock_minimo, estante_id, tramo, repisa, creado, actualizado |
| `categorias` | id, nombre, color |
| `etiquetas`, `libro_etiqueta` | etiquetas libres |
| `tienda` | ancho, fondo, alto, fachada (una sola fila) |
| `bloques` | x, y, z (únicos), tipo, rot, estante_id? |
| `estantes` | id, letra, titulo, tema, color, fuerte, inicio_tramo (json), tablas (json) |
| `plantillas_tienda` | id, nombre, datos_json, por_defecto |
| `movimientos_stock` | id, libro_id, delta, motivo (alta/venta/anulación/ajuste), usuario_id, fecha |
| `tipos_cliente` | id, nombre (Público/Profesor/Mayorista), descuento_pct |
| `clientes` | id, nombre, telefono, correo, tipo_cliente_id, notas |
| `ventas` | id, fecha, usuario_id, cliente_id?, tipo_cliente_id, subtotal_cent, descuento_cent, total_cent, anulada |
| `venta_items` | id, venta_id, libro_id, cantidad, precio_unit_cent, descuento_cent |
| `pagos` | id, venta_id, metodo, monto_cent, recibido_cent?, vuelto_cent? |
| `encargos` | id, cliente_id, libro_id?, titulo_pedido, autor_pedido, estado, fecha, notas |
| `usuarios` | id, nombre, rol, pin_hash (Argon2), avatar, preferencias (json: fondo, calma, hotbar) |
| `dispositivos` | id, nombre, token_hash, creado, ultimo_uso, revocado |
| `notas_libreta` | id, usuario_id, orden, contenido, actualizado |
| `config` | clave, valor (API keys cifradas, datos de la tienda, etc.) |

Montos en **céntimos** (`i64`). Todas las fechas en UTC y se muestran en la hora de Lima.

### 4.3 Compilación y entrega
- **Windows:** GitHub Actions (`windows-latest`) → instalador NSIS (incluye el bootstrapper de WebView2).
- **Android:** APK firmado (en CI o en local con el Android SDK).
- **Desarrollo:** Linux (`cargo tauri dev`).

---

## 5. Prototipo interactivo

En `prototipo/` (Svelte + Vite + Three.js), sin backend y con libros de ejemplo tomados del folleto.
Sirve para **sentir** el diseño y ajustar colores, velocidades y tamaños antes de implementar. Su código
visual se reutiliza en `ui/`.

Incluye:
1. Escritorio – Buscar: resultados → libro 3D (6 entradas: caída, estante, pluma, trompo, pop, volteo) →
   ubicación con la tienda 3D, pin y camino.
2. Radio con pétalos.
3. Libreta desplegable (`Ctrl+L`).
4. Inicio con saludo según la hora.
5. Los 3 fondos animados con sus interacciones y el selector.
6. Vista celular (ventana angosta).
7. **Mi tienda**: editor en bloques (inventario, hotbar, relleno 3D, seleccionar, dividir, plantillas, enfoque).
8. Perfil editable (nombre) en Ajustes.

Para correrlo: `cd prototipo && npm install && npm run dev` (ver `prototipo/README.md`).

En el prototipo, la música se **genera en vivo** con Web Audio (pads, caja de música y lluvia), sin archivos y
sin derechos de autor. Si a la librería le gusta, puede quedarse como una "estación" más de la radio final.
