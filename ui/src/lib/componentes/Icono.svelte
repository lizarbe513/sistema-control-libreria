<script lang="ts" module>
  // Iconos de línea redondeada (estilo Lucide).
  const RUTAS = {
    inicio: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    buscar: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14z M20 20l-4.2-4.2',
    mas: 'M12 5v14M5 12h14',
    encargos: 'M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z M3 7.5 12 12l9-4.5 M12 12v9',
    reportes: 'M3 20h18 M6 16v-5 M11 16V7 M16 16v-8 M21 16v-3',
    asistente:
      'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
    ajustes:
      'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z M12 2.5v3 M12 18.5v3 M2.5 12h3 M18.5 12h3 M5.3 5.3l2.1 2.1 M16.6 16.6l2.1 2.1 M5.3 18.7l2.1-2.1 M16.6 7.4l2.1-2.1',
    play: 'M8 5.5v13l10.5-6.5z',
    pausa: 'M8 5h3v14H8z M13 5h3v14h-3z',
    siguiente: 'M6 5.5v13l9-6.5z M17 5v14',
    volumen: 'M4 9.5v5h4l5 4v-13l-5 4z M16.5 9a4 4 0 0 1 0 6',
    pin: 'M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z M12 7a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z',
    cerrar: 'M6 6l12 12M18 6 6 18',
    salir: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3 M10 17l-5-5 5-5 M5 12h11',
    candado: 'M6 11h12v10H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3',
    camara: 'M4 8h3l2-3h6l2 3h3v11H4z M12 10a3.5 3.5 0 1 0 0 7a3.5 3.5 0 1 0 0-7z',
    usuario: 'M12 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8z M4 21a8 8 0 0 1 16 0',
    corazon: 'M12 20s-7.5-4.6-9-9.3C2 7.3 4.3 4.5 7.3 4.5c2 0 3.6 1.1 4.7 2.8 1.1-1.7 2.7-2.8 4.7-2.8 3 0 5.3 2.8 4.3 6.2C19.5 15.4 12 20 12 20z',
    paleta:
      'M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.9 1.4-1.9-.4-1.2.4-2.1 1.6-2.1H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10z M7.5 11.5h.01 M10 7.5h.01 M14.5 7.5h.01',
    flecha: 'M5 12h14 M13 6l6 6-6 6',
    izquierda: 'M15 6l-6 6 6 6',
    derecha: 'M9 6l6 6-6 6',
    estante: 'M4 3h16v18H4z M4 9h16 M4 15h16 M7 5.5v2 M10 5.5v2 M8 11v2.5 M14 17v2',
    libro: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z M4 21.5V5.5 M8 7h8',
    carrito: 'M3 4h2.5l2.2 11h10.6L21 7.5H6.4 M9 20h.01 M18 20h.01',
    menu: 'M4 6h16 M4 12h16 M4 18h16',
    nota: 'M5 3h11l3 3v15H5z M8 9h8 M8 13h8 M8 17h5',
    luna: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
    sol: 'M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10z M12 1.5v2 M12 20.5v2 M1.5 12h2 M20.5 12h2 M4.6 4.6 6 6 M18 18l1.4 1.4 M4.6 19.4 6 18 M18 6l1.4-1.4',
    hoja: 'M12 5v14 M5 12h14',
    check: 'M5 12.5l4.5 4.5L19 7.5',
  } as const;
  export type NombreIcono = keyof typeof RUTAS;
</script>

<script lang="ts">
  let {
    nombre,
    tam = 22,
    relleno = false,
    grosor = 1.9,
  }: { nombre: NombreIcono; tam?: number; relleno?: boolean; grosor?: number } = $props();
</script>

<svg
  width={tam}
  height={tam}
  viewBox="0 0 24 24"
  fill={relleno ? 'currentColor' : 'none'}
  stroke="currentColor"
  stroke-width={grosor}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d={RUTAS[nombre]} />
</svg>
