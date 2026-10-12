<script lang="ts">
  import { onMount } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { Spring } from 'svelte/motion';
  import { app, guardar } from '../estado.svelte';
  import Icono from './Icono.svelte';

  interface Hoja {
    fecha: string;
    texto: string;
  }

  function cargar(): Hoja[] {
    try {
      const h = JSON.parse(localStorage.getItem('libreta') ?? 'null');
      if (Array.isArray(h) && h.length) return h;
    } catch {
      /* primera vez */
    }
    return [
      {
        fecha: new Date().toISOString(),
        texto: 'Pedir más "Paco Yunque" para el colegio 🌷\nAvisar a Diego: llegó su Aritmética.\n',
      },
    ];
  }

  let hojas = $state<Hoja[]>(cargar());
  let indice = $state(hojas.length - 1);
  let direccion = $state(1);
  let guardado = $state(true);
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  let area: HTMLTextAreaElement | undefined = $state();

  const pos = new Spring(0, { stiffness: 0.08, damping: 0.45 });
  $effect(() => {
    pos.target = app.libretaAbierta ? 1 : 0;
    if (app.libretaAbierta) setTimeout(() => area?.focus(), 250);
  });

  function escribir() {
    guardado = false;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      guardar('libreta', hojas);
      guardado = true;
    }, 600);
  }

  function ir(d: number) {
    const n = indice + d;
    if (n < 0 || n >= hojas.length) return;
    direccion = d;
    indice = n;
  }

  function nuevaHoja() {
    hojas.push({ fecha: new Date().toISOString(), texto: '' });
    direccion = 1;
    indice = hojas.length - 1;
    escribir();
  }

  function voltear(_: Element, { dir }: { dir: number }) {
    return {
      duration: 480,
      easing: cubicOut,
      css: (t: number) => `transform: perspective(1400px) rotateY(${(1 - t) * dir * -75}deg); opacity: ${0.3 + t * 0.7}`,
    };
  }

  const fecha = (iso: string) =>
    new Date(iso).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });

  onMount(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        app.libretaAbierta = !app.libretaAbierta;
      } else if (e.key === 'Escape' && app.libretaAbierta) app.libretaAbierta = false;
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  });
</script>

<div
  class="velo"
  style:opacity={pos.current * 0.9}
  style:pointer-events={app.libretaAbierta ? 'auto' : 'none'}
  onclick={() => (app.libretaAbierta = false)}
  aria-hidden="true"
></div>

<aside
  class="libreta"
  style:transform={`translateX(calc(${(1 - pos.current) * -100}% - ${(1 - pos.current) * 22}px)) rotate(${Math.sin(Math.max(0, Math.min(1, pos.current)) * Math.PI) * -3}deg)`}
  class:cerrada={pos.current < 0.01 && !app.libretaAbierta}
  aria-label="Libreta de notas"
>
  <button
    class="marcapaginas"
    onclick={() => (app.libretaAbierta = !app.libretaAbierta)}
    aria-label={app.libretaAbierta ? 'Cerrar libreta' : 'Abrir libreta (Ctrl+L)'}
    title="Libreta (Ctrl+L)"
  >
    <Icono nombre="nota" tam={18} />
  </button>

  <div class="tapa" inert={!app.libretaAbierta}>
    <div class="cinta"></div>
    {#key indice}
      <div class="hoja" in:voltear={{ dir: direccion }}>
        <header>
          <span class="titulo">Mi libreta</span>
          <span class="fecha">{fecha(hojas[indice].fecha)}</span>
        </header>
        <textarea
          bind:this={area}
          bind:value={hojas[indice].texto}
          oninput={escribir}
          placeholder="¿Qué estás pensando?…"
          spellcheck="false"
        ></textarea>
      </div>
    {/key}
    <footer>
      <button class="nav" onclick={() => ir(-1)} disabled={indice === 0} aria-label="Hoja anterior">
        <Icono nombre="izquierda" tam={18} />
      </button>
      <span class="num">hoja {indice + 1} de {hojas.length}</span>
      <button class="nav" onclick={() => ir(1)} disabled={indice === hojas.length - 1} aria-label="Hoja siguiente">
        <Icono nombre="derecha" tam={18} />
      </button>
      <button class="nueva" onclick={nuevaHoja}>+ nueva hoja</button>
      <span class="estado">{guardado ? 'guardado ✓' : 'escribiendo…'}</span>
    </footer>
  </div>
</aside>

<style>
  .velo {
    position: fixed;
    inset: 0;
    background: rgba(90, 50, 60, 0.18);
    z-index: 39;
  }
  .libreta {
    --papel: #ead9b8;
    --tinta: #5b4636;
    position: fixed;
    left: 22px;
    top: 6vh;
    height: 88vh;
    width: min(460px, 42vw);
    z-index: 40;
    will-change: transform;
  }
  /* cerrada: solo asoma el marcapáginas */
  .libreta.cerrada .tapa {
    visibility: hidden;
  }
  .marcapaginas {
    position: absolute;
    right: -30px;
    top: 38%;
    width: 30px;
    height: 92px;
    border-radius: 0 14px 14px 0;
    background: var(--primary);
    color: #fff;
    display: grid;
    place-items: center;
    box-shadow: 4px 6px 14px rgba(229, 88, 127, 0.3);
    transition: width 0.2s ease, right 0.2s ease;
  }
  .marcapaginas:hover {
    width: 38px;
    right: -38px;
  }
  .tapa {
    position: relative;
    height: 100%;
    border-radius: 8px 22px 22px 8px;
    padding: 26px 26px 16px 46px;
    display: flex;
    flex-direction: column;
    /* papel arena con grano sutil */
    background:
      url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.45  0 0 0 0 0.35  0 0 0 0 0.25  0 0 0 0.10 0'/></filter><rect width='100%' height='100%' filter='url(%23g)'/></svg>"),
      radial-gradient(circle at 100% 0, rgba(255, 255, 255, 0.35), transparent 40%),
      var(--papel);
    box-shadow:
      0 24px 50px rgba(110, 70, 40, 0.28),
      inset 0 0 40px rgba(150, 110, 70, 0.18);
    color: var(--tinta);
    overflow: hidden;
  }
  /* lomo cosido */
  .tapa::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 26px;
    background: linear-gradient(90deg, #cdb58c, #dcc7a0 70%, rgba(0, 0, 0, 0.08));
  }
  .tapa::after {
    content: '';
    position: absolute;
    left: 12px;
    top: 14px;
    bottom: 14px;
    border-left: 2px dashed rgba(229, 88, 127, 0.55);
  }
  .cinta {
    position: absolute;
    top: -6px;
    right: 60px;
    width: 90px;
    height: 30px;
    background: rgba(242, 122, 155, 0.45);
    transform: rotate(4deg);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06);
  }
  .hoja {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    transform-origin: left center;
  }
  header {
    display: flex;
    flex-direction: column;
    margin-bottom: 6px;
  }
  .titulo {
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    opacity: 0.6;
  }
  .fecha {
    font-family: 'Caveat', cursive;
    font-size: 30px;
    font-weight: 700;
    line-height: 1.1;
  }
  textarea {
    flex: 1;
    resize: none;
    border: none;
    outline: none;
    padding: 4px 4px 4px 22px;
    font-family: 'Caveat', cursive;
    font-size: 27px;
    line-height: 36px;
    color: var(--tinta);
    background:
      linear-gradient(90deg, transparent 12px, rgba(214, 90, 90, 0.45) 12px 14px, transparent 14px),
      repeating-linear-gradient(transparent 0 35px, rgba(150, 120, 90, 0.28) 35px 36px);
    background-attachment: local;
  }
  textarea::placeholder {
    color: rgba(91, 70, 54, 0.4);
  }
  footer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-top: 10px;
    font-family: 'Caveat', cursive;
    font-size: 20px;
  }
  .nav {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: var(--tinta);
    background: rgba(255, 255, 255, 0.35);
  }
  .nav:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .nueva {
    margin-left: auto;
    font-family: 'Caveat', cursive;
    font-size: 21px;
    font-weight: 700;
    color: #c2456a;
  }
  .estado {
    font-size: 18px;
    opacity: 0.65;
    min-width: 82px;
    text-align: right;
  }
</style>
