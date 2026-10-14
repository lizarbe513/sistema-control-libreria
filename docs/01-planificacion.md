# Fase 1 — Planificación

## 1. Contexto

**Librería SIGLO XXI** — Jr. 7 de Junio #336 (referencia: frente al grifo Jackelin) · Tel. 916 480 852.
Venta de libros al por mayor y menor, con precios especiales para profesores.

La colección es de 1.000 a 10.000 libros nuevos, en su mayoría con ISBN. Situación actual:

- Para atender a un cliente, la vendedora busca libro por libro en los estantes.
- Si no encuentra el libro, le da su tarjeta al cliente y espera que él la contacte.
- Anota las ventas a mano en un cuaderno.
- No existe ningún listado digital de los libros.

Esto le cuesta tiempo, ventas y clientes.

## 2. Objetivo

Un programa que permita:

1. Encontrar en segundos si un libro está disponible y **dónde está físicamente**.
2. Registrar las ventas y descontar el stock automáticamente.
3. Gestionar los encargos de los clientes en lugar de entregarles la tarjeta.
4. Apoyarse en un asistente de IA para recomendar libros del propio inventario.
5. Ofrecer una interfaz **hermosa y acogedora**, en la que dé gusto pasar el tiempo. Es un objetivo tan importante como la funcionalidad (ver `02-diseno.md`).

## 3. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Lenguaje | Rust |
| Framework | Tauri 2 (escritorio + Android con el mismo código) |
| Interfaz | Svelte + TypeScript, estilo rosado pastel según `.referencia/Untitled.jpg` |
| Base de datos | SQLite cifrado con SQLCipher, en un solo archivo portable |
| Sincronización | El PC es el servidor local; el celular se conecta por el WiFi de la tienda |
| IA | Gemini Flash-Lite (plan gratuito) como principal y Groq (gratuito) como respaldo, con un adaptador intercambiable |
| Usuarios | Varias cuentas con roles: Dueña (todo) y Vendedor (vender, buscar, encargos) |
| País / moneda | Perú, soles (PEN); los montos se guardan en céntimos (enteros) |
| Libros | Nuevos con ISBN, con datos autocompletados desde Open Library / Google Books; código interno para los que no tienen |
| Escaneo | Con la cámara del celular (no hay lector de código de barras) |
| Comprobante | No se entrega; la venta solo se registra |
| Plataformas | Windows 10/11 (PC de la tienda) y Android 8+ |

## 4. Alcance — Versión 1.0

### 4.1 Inventario
- **Carga continua con el celular**: escanear ISBN → confirmar los datos autocompletados → stock y ubicación → siguiente libro. Así se hace la carga inicial completa recorriendo los estantes.
- En el PC, alta escribiendo el ISBN o buscando por título.
- Alta manual con **código interno** para libros sin ISBN o sin datos en línea (p. ej. cuentos regionales).
- Edición de todos los campos: título, autor, editorial, año, sinopsis, portada, categoría, etiquetas.
- Precio de venta, costo (solo visible para la Dueña), stock, **estante y repisa** (se eligen tocando el mapa de la tienda).
- Categorías iniciales (las del folleto): Obras literarias, Diccionarios, Biblias, Autoayuda, Cuentos para niños, Cuentos regionales, Pre-universitarios, Universitarios, Otros.
- Alerta de stock bajo.
- Importación desde Excel/CSV (opcional, por si algún día hace falta).

### 4.2 Búsqueda
- Búsqueda instantánea por título, autor, ISBN, editorial, categoría o etiqueta, tolerante a errores de tipeo y a la falta de tildes.
- Filtros: categoría, rango de precio, solo con stock.
- La ubicación del libro encontrado se muestra en grande, con un **mini mapa de la tienda** donde se ilumina el estante.
- En el celular, escanear un libro con la cámara para ver su ficha.

### 4.3 Ventas
- Venta rápida con el botón "+": agregar libros (por escaneo o búsqueda), ajustar cantidades y aplicar descuentos por libro o al total (% o monto).
- **Tipo de cliente: Público / Profesor / Mayorista.** Cada tipo tiene un % de descuento configurable que se aplica automáticamente al elegirlo en la venta, aunque el cliente no esté registrado.
- Métodos de pago: efectivo (con cálculo de vuelto), tarjeta débito/crédito, Yape/Plin, transferencia.
- Cliente registrado opcional en la venta.
- **No se emite comprobante.**
- Anulación de una venta (solo la Dueña), con devolución del stock.

### 4.4 Encargos y clientes
- Ficha de cliente: nombre, teléfono/WhatsApp, correo, **tipo de cliente** e historial de compras.
- Encargo: libro pedido (aunque no esté en el inventario), cliente, fecha y estado (pendiente → pedido al proveedor → llegó → avisado → entregado/cancelado).
- Si una búsqueda no encuentra el libro, se ofrece **"¿Lo encargamos?"** con el encargo ya precargado.
- Al ingresar stock de un libro con encargos pendientes, el programa avisa.
- Botón para abrir WhatsApp con el mensaje de aviso ya redactado.

### 4.5 Reportes (Dueña)
- Ventas por día, semana, mes y año.
- Libros y categorías más vendidos.
- Totales por método de pago (cuadre de caja) y por tipo de cliente.
- Libros sin movimiento (para decidir liquidaciones).
- Exportación a CSV/Excel.

### 4.6 Asistente de IA
- Chat que solo recomienda libros **del inventario real**, con stock y ubicación. Ejemplo: *"algo de misterio para un chico de 15 que le gustó Harry Potter"*.
- Redacción de mensajes para clientes (aviso de encargo, novedades).
- Preguntas sobre el negocio, como *"¿qué se vendió más este mes?"* (solo para la Dueña).
- Sugerencias de reposición según las ventas y los encargos.
- **Privacidad**: nunca se envían datos personales de clientes (nombres, teléfonos) al proveedor de IA.
- Si no hay internet o se alcanza el límite gratuito, todo lo demás sigue funcionando y solo el asistente queda inactivo.

### 4.7 Experiencia (detalle en `02-diseno.md`)
- Libro 3D que aparece con un rebote al encontrarlo.
- Radio con música relajante y pétalos que caen.
- Libreta color arena desplegable (solo en el PC).
- Fondos animados e interactivos a elección: pétalos, estanque de nenúfares, cielo estrellado.

### 4.8 Seguridad y respaldo
- Base de datos cifrada (SQLCipher); la llave se deriva de una contraseña maestra.
- Inicio de sesión por usuario con PIN o contraseña (hash Argon2).
- Respaldo automático diario y respaldo manual a una carpeta, pendrive o la nube. Incluye la base de datos y la carpeta de portadas.
- Restauración desde un respaldo.
- El celular se vincula al PC escaneando un código QR que muestra el PC (token por dispositivo, revocable).
- Las API keys de la IA se guardan cifradas dentro de la base de datos.

## 5. Fuera de alcance (v1.0)
- Boleta/factura electrónica SUNAT y comprobantes en general.
- Tienda online / ventas por internet.
- Gestión de proveedores y órdenes de compra formales.
- Varias sucursales.
- App para iOS.

## 6. Requisitos no funcionales
- **Velocidad:** búsqueda en menos de 100 ms con 10.000 libros.
- **Facilidad:** quien atiende tiene que poder vender sin capacitación técnica; toda la interfaz está en español.
- **Portabilidad:** todo vive en una carpeta (base de datos + portadas); para mudarse a otro PC basta copiar y abrir.
- **Disponibilidad:** el PC funciona sin internet y sin el celular.
- **Rendimiento:** las animaciones tienen un "modo rendimiento" para PCs modestos y se pausan con la ventana minimizada.
- **Plataformas:** Windows 10/11 (escritorio) y Android 8+.

## 7. Roles

| Acción | Dueña | Vendedor |
|---|:-:|:-:|
| Buscar / consultar libros | ✅ | ✅ |
| Registrar ventas | ✅ | ✅ |
| Crear y gestionar encargos y clientes | ✅ | ✅ |
| Usar el asistente IA | ✅ | ✅ (sin datos financieros) |
| Agregar/editar libros y stock | ✅ | ⚙️ configurable |
| Ver costos y reportes | ✅ | ❌ |
| Anular ventas | ✅ | ❌ |
| Usuarios, respaldos, mapa de la tienda, configuración | ✅ | ❌ |

## 8. Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Se olvida la contraseña maestra → datos irrecuperables | Clave de recuperación impresa al instalar, guardada físicamente |
| El PC se daña o lo roban | Respaldos automáticos (cifrados) fuera del PC |
| La IA gratuita cambia sus límites o condiciones | Adaptador intercambiable con respaldo automático; el asistente es solo complementario |
| Carga inicial de miles de libros sin listado previo | Escaneo continuo con la cámara del celular + autocompletado por ISBN |
| Libros sin datos en Open Library (editoriales locales) | Segunda fuente (Google Books) + alta manual rápida con portada fotografiada |
| WiFi de la tienda inestable | El PC es autónomo; el celular muestra el estado de conexión |
| PC modesto y animaciones pesadas | Modo rendimiento, fondo quieto y pausa automática |

## 9. Fases del proyecto

1. **Planificación** ✅
2. **Diseño** ✅ (`02-diseno.md` + prototipo interactivo)
3. **Implementación** ← estamos aquí (`03-implementacion.md`), por hitos en este orden: base de datos y seguridad ✅ → inventario y búsqueda ✅ → ventas → encargos → reportes → respaldos → sincronización con el celular → IA → instalador.
4. **Pruebas:** unitarias (Rust), de integración (base de datos/API) y con usuario real (la vendedora).
5. **Entrega:** instalador de Windows + APK, manual de uso breve y capacitación.

## 10. Preguntas resueltas
- Lector de código de barras: no tiene → se usa la cámara del celular.
- Impresora de tickets: no tiene y no se entregan comprobantes.
- Sistema operativo del PC: Windows.
- Listado previo de libros: no existe → carga inicial por escaneo.
- Nombre: Librería SIGLO XXI.
