# Fase 4 — Entrega (hito 9)

## Cómo se publica una versión (para quien mantiene el proyecto)

El código vive en un repositorio **privado** de GitHub (`lizarbe513/libreria-siglo-xxi`). Los instaladores se publican
en uno **público solo de versiones** (`lizarbe513/libreria-siglo-xxi-versiones`), sin código: de ahí los descarga la
tienda y las propias apps para actualizarse.

1. Subir `version` en `app/src-tauri/tauri.conf.json` (por ejemplo, `1.0.1`) y hacer commit.
2. `git push && git tag -a v1.0.1 -m "Qué cambió en esta versión" && git push --tags`. El texto de la etiqueta son las
   **notas** que verá la tienda.
3. GitHub Actions (`.github/workflows/version.yml`) hace todo solo:
   - **Windows:** pruebas del núcleo y de la app, el instalador firmado y una prueba de humo (lo instala y abre);
   - **Celular:** compila y firma el APK con la llave de Android;
   - **Publicar:** crea el Release en el repo público con el instalador, el APK y sus `latest.json` /
     `latest-android.json`. (Si falta el secreto `VERSIONES_TOKEN`, avisa y no publica: `scripts/publicar.sh 1.0.1`
     lo hace a mano.)
4. Las apps lo detectan al abrirse:
   - **PC:** «Hay una versión nueva» → Actualizar (hace un respaldo, instala y reinicia).
   - **Celular:** «Hay una versión nueva» → Actualizar → Android pide tocar «Instalar». La primera vez pide permitir
     «instalar apps de esta fuente». Si el PC es más nuevo que el celular, el celular avisa.

**Secretos del repo privado** (Settings → Secrets → Actions):
- `TAURI_SIGNING_PRIVATE_KEY` y `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: llave que firma las actualizaciones del PC.
- `ANDROID_KEYSTORE_BASE64` y `ANDROID_KEYSTORE_PASSWORD`: llave que firma el APK (Android solo acepta actualizar con la
  misma llave).
- `VERSIONES_TOKEN`: token de GitHub con permiso **solo** de escribir en el repo público de versiones (Contents:
  Read and write). Se crea en GitHub → Settings → Developer settings → Fine-grained tokens → Repository access:
  *Only select repositories* → `libreria-siglo-xxi-versiones`.

**Llaves:** las originales viven **fuera del repositorio** (`~/.tauri/siglo-xxi-updater.key` y `~/.android/siglo-xxi-release.jks`,
con sus `.pass`). **Si se pierden no se pueden firmar más actualizaciones** (habría que reinstalar a mano): guardar una
copia. La pública del actualizador está en `tauri.conf.json`.

**Compilar el APK a mano** (por ejemplo, para probar sin publicar): `scripts/apk.sh`.

## Instalar en el PC de la tienda (Windows)

1. Descargar `Libreria-SIGLO-XXI-<versión>-setup.exe` desde
   <https://github.com/lizarbe513/libreria-siglo-xxi-versiones/releases/latest>.
2. Abrirlo. **Windows mostrará «Windows protegió su PC»** (SmartScreen), porque el instalador no tiene la firma de pago
   de una empresa: tocar **«Más información» → «Ejecutar de todas formas»**. Es normal.
3. Sigue el instalador (en español, no pide contraseña de administrador). Crea el acceso directo en el escritorio y en
   el menú Inicio.

## Primera vez (se empieza de cero)

1. Abrir la app → **Empezar**. Elegir la carpeta de datos (por defecto, Documentos → *Librería SIGLO XXI*).
2. Escribir la **contraseña maestra** y **anotarla en papel** y guardarla bien: sin ella no se pueden recuperar los
   datos si se cambia de PC o se pierde el acceso.
3. Crear la Dueña y su PIN. Luego, en Ajustes: vendedoras, categorías, tipos de cliente, métodos de pago (con el QR de
   Yape) y, en «Mi tienda», el plano.
4. **Respaldos** (Ajustes → Respaldos): elegir una **carpeta externa** (pendrive, OneDrive o Google Drive). El respaldo
   diario es automático.
5. **Asistente IA** (Ajustes → Asistente IA, solo la Dueña): pegar las claves gratis de Gemini y Groq (los pasos están
   ahí).

## Conectar los celulares

1. Instalar el APK en el celular (si ya estaba instalado, queda encima).
2. **Firewall:** la primera vez que se enciende «Conectar celulares», Windows pregunta si la app puede comunicarse en la
   red: marcar **«Redes privadas»** y permitir.
3. En el PC: Ajustes → Celulares → «Vincular un celular nuevo». En el celular: «Vincular con otro PC» (si ya estaba
   vinculado al PC viejo) y escanear el QR. El celular y el PC deben estar en el **mismo WiFi**.

## Actualizaciones

Al abrir la app, si hay una versión nueva aparece **«Hay una versión nueva»**. «Actualizar» guarda antes un respaldo de
los datos, descarga, instala y reinicia la app. También se puede buscar a mano en Ajustes → Versión y actualizaciones.
Los datos no se tocan.

## Lista de comprobación en la tienda

Marcar lo que funciona y avisar lo que no:

- [ ] Instala y abre sin errores; la contraseña maestra y el PIN funcionan.
- [ ] Cerrar la app y volver a abrirla: entra con el PIN (el llavero de Windows desbloquea solo).
- [ ] Agregar un libro por ISBN y otro a mano (con portada de internet).
- [ ] Una venta con comprobante (efectivo, y otra con Yape); el vuelto sale bien.
- [ ] Un encargo con aviso por WhatsApp.
- [ ] Reportes del día y exportar a Excel (CSV).
- [ ] Crear un respaldo, y probar «Restaurar» en una carpeta de prueba.
- [ ] Vincular el celular; escanear un ISBN y vender desde el celular.
- [ ] El asistente responde (y, para la Dueña, también de ventas).
- [ ] Buscar actualizaciones en Ajustes dice «Ya tienes la última versión».
- [ ] Apagar el WiFi: la app del PC sigue funcionando (el asistente y la búsqueda en internet quedan inactivos).
