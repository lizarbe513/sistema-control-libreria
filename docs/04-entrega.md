# Fase 4 — Entrega (hito 9)

## Cómo se publica una versión (para quien mantiene el proyecto)

El código vive en un repositorio **privado** de GitHub (`lizarbe513/libreria-siglo-xxi`). Los instaladores se publican
en uno **público solo de versiones** (`lizarbe513/libreria-siglo-xxi-versiones`), sin código: de ahí los descarga la
tienda y la propia app para actualizarse.

1. Subir `version` en `app/src-tauri/tauri.conf.json` (por ejemplo, `1.0.1`) y hacer commit.
2. `git tag v1.0.1 && git push && git push --tags`. GitHub Actions (`windows.yml`) hace en un Windows de verdad:
   pruebas del núcleo y de la app, el instalador firmado y una **prueba de humo** (lo instala, abre la app y comprueba
   que sigue viva).
3. Cuando termine en verde: `scripts/publicar.sh 1.0.1 "qué cambió"`. Crea el Release en el repo público con el
   instalador, su firma y `latest.json`.
4. Las apps instaladas lo detectan al abrirse y avisan «Hay una versión nueva».

**Llave del actualizador:** la firma de las actualizaciones usa una llave que vive **fuera del repositorio**
(`~/.tauri/siglo-xxi-updater.key` y su `.pass`) y, copiada, en los *secrets* del repo privado. La pública está en
`tauri.conf.json`. **Si se pierde la llave no se pueden firmar más actualizaciones** (habría que reinstalar a mano):
guardar una copia. Igual con la del APK (`~/.android/siglo-xxi-release.jks`).

**El APK** se compila aparte con `scripts/apk.sh` (el celular no se actualiza solo: se pasa el APK nuevo, se instala
encima).

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
