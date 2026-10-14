# Prototipo visual — Librería SIGLO XXI

Prototipo de la fase de **Diseño** para sentir la interfaz antes de implementar. No tiene backend: los libros
son datos de ejemplo tomados del folleto de la librería.

```bash
npm install
npm run dev      # abre http://localhost:5173
```

## Qué probar
| Dónde | Qué hacer |
|---|---|
| **Buscar** | Escribe "principito", "biblia", "vallejo"… El libro cae en 3D con rebote: arrástralo para girarlo y haz clic para abrirlo. Abajo está su estante en la tienda 3D, con un pin y el camino desde la vereda. |
| **Buscar** algo que no existe | Aparece "¿Lo encargamos?" |
| **Radio** (arriba a la izquierda) | ▶ para escuchar música; mientras suena, caen pétalos. |
| **Libreta** | Marcapáginas rosa en el borde izquierdo, o `Ctrl+L`. Guarda sola. |
| **Fondo** (🎨 junto al avatar, o Ajustes) | 🌸 clic = ráfaga, mueve el mouse = brisa, a veces pasa una mariposa · 🪷 clic = ondas, toca una flor de loto, a veces pasa un koi · 🌌 clic = estrella fugaz, arrastra = constelación |
| **Mi tienda** | Editor en bloques tipo Minecraft: 1–9 eligen bloque, clic pone, clic derecho quita, arrastrar con clic derecho gira, R rota, Shift+arrastrar hace una fila, Ctrl+Z deshace. |
| **Ajustes** | Tu nombre y cómo aparece el libro (6 animaciones o «Sorpresa»). |
| Ventana angosta (< 760 px) | Vista de celular con barra inferior y ficha del libro. |

## Notas
- La música del prototipo **se genera en vivo** con Web Audio (sin archivos ni derechos de autor). La app final
  incluirá pistas libres de derechos + estaciones online.
- Las portadas son **generadas** (color y patrón según categoría). En la app real vendrán de Open Library /
  Google Books y quedará la generada solo si no hay imagen.
- Código: `src/lib/fondo/` (motor y escenas), `src/lib/componentes/` (libro 3D, radio, libreta, mapa…),
  `src/lib/vistas/` (pantallas).
