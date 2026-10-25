# Librería SIGLO XXI

Programa de gestión para una librería de Perú: inventario de libros, búsqueda instantánea con la **ubicación física**
de cada libro (incluida una tienda en 3D), ventas con descuento de stock, encargos de clientes, reportes y una
asistente de IA que recomienda libros del propio inventario. Funciona en el **PC de la tienda (Windows)** y en
**celulares Android** que se conectan al PC por el WiFi local.

**Descargar:** [última versión](https://github.com/lizarbe513/sistema-control-libreria/releases/latest) — instalador de
Windows (`*-setup.exe`) y APK de Android.

## Tecnología

| Parte | Elección |
|---|---|
| Núcleo y reglas de negocio | Rust (`crates/core`), sin dependencia de Tauri y con tests |
| App de escritorio y Android | Tauri 2 (`app/src-tauri`), el mismo código para las dos plataformas |
| Interfaz | Svelte 5 + TypeScript + Vite, con Three.js para el libro y la tienda en 3D |
| Datos | SQLite cifrado con SQLCipher; llave derivada con Argon2id y guardada en el llavero del sistema |
| Red local | El PC es servidor HTTPS con certificado propio; el celular lo fija por su huella (vinculado con un QR) |
| IA | Gemini (principal) y Groq (respaldo) con un cliente compatible con OpenAI y herramientas acotadas |
| Entrega | GitHub Actions: pruebas, instalador NSIS firmado, APK firmado y Release con actualización automática |

## Mapa del código

| Carpeta | Qué hace |
|---|---|
| `crates/core/` | Núcleo: base cifrada y migraciones, libros, búsqueda, ventas, encargos, clientes, reportes, respaldos, asistente |
| `app/src-tauri/src/` | App Tauri: comandos que llama la interfaz (con permisos por rol), llavero, servidor y cliente LAN, actualizaciones |
| `app/src-tauri/gen/android/` | Proyecto Android, con el plugin Kotlin que descarga e instala las actualizaciones del APK |
| `ui/src/lib/api/` | Contrato de la API con dos implementaciones: `ApiTauri` (Rust real) y `ApiDemo` (en memoria, para el navegador) |
| `ui/src/lib/vistas/` | Pantallas: Inicio, Buscar, Vender, Libros, Encargos, Reportes, Ajustes, Asistente… |
| `ui/src/lib/componentes/` | Piezas reutilizables de la interfaz |
| `ui/src/lib/tienda/`, `ui/src/lib/fondo/` | Tienda 3D en bloques y fondos animados |
| `prototipo/` | Prototipo de la fase de diseño (referencia) |
| `docs/` | Planificación, diseño, implementación y entrega, por fases |
| `scripts/` | Generación de `latest.json` / `latest-android.json` y compilación manual del APK |
| `.github/workflows/` | `pruebas.yml` (en cada push) y `version.yml` (compila y publica con cada etiqueta `v*`) |

## Flujo de datos

```
Interfaz (Svelte) ──invoke──▶ comandos Tauri (permisos) ──▶ libreria-core ──▶ SQLite cifrado
Celular ──HTTPS + token──▶ servidor del PC ──▶ las mismas funciones (rpc.rs)
App instalada ──▶ Releases de este repo (latest.json / latest-android.json) ──▶ actualización firmada
```

## Cómo correrlo

| Qué | Comando |
|---|---|
| Solo la interfaz, en el navegador (modo demostración) | `cd ui && npm install && npm run dev` → <http://localhost:5175> |
| App de escritorio | `cd app && cargo tauri dev` |
| Tests del núcleo | `cargo test -p libreria-core` |
| Revisión estática | `cargo clippy --workspace --all-targets -- -D warnings` y `cd ui && npm run check` |

En Linux hacen falta `webkit2gtk-4.1` y `libsoup3`. La primera compilación tarda unos 15–20 minutos (compila
SQLCipher con OpenSSL).

## Cómo cambiar…

- **Una regla de negocio** (precios, descuentos, stock): en `crates/core/src/` (por ejemplo `ventas.rs`), con su test.
- **Una pantalla**: en `ui/src/lib/vistas/`; si necesita datos nuevos, se agregan al contrato en `ui/src/lib/api/` y
  a sus dos implementaciones.
- **Publicar una versión**: subir `version` en `app/src-tauri/tauri.conf.json` y crear la etiqueta
  (`git tag -a v1.2.3 -m "notas"`). El detalle está en [`docs/04-entrega.md`](docs/04-entrega.md).

## Licencia

[MIT](LICENSE).
