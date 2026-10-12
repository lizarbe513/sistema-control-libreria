<script lang="ts" module>
  import type { FondoOpcion } from '../estado.svelte';

  export const OPCIONES_FONDO: { id: FondoOpcion; nombre: string; emoji: string; muestra: string; detalle: string }[] = [
    {
      id: 'petalos',
      nombre: 'Lluvia de pétalos',
      emoji: '🌸',
      muestra: 'linear-gradient(135deg,#FDF3F6,#FBD3DE)',
      detalle: 'Clic: ráfaga de viento · mueve el mouse: brisa',
    },
    {
      id: 'estanque',
      nombre: 'Estanque de nenúfares',
      emoji: '🪷',
      muestra: 'linear-gradient(135deg,#CDEFE4,#8CCFBF)',
      detalle: 'Clic: ondas · toca una flor para abrirla',
    },
    {
      id: 'cielo',
      nombre: 'Cielo estrellado',
      emoji: '🌌',
      muestra: 'linear-gradient(135deg,#120E2E,#5B3A6E)',
      detalle: 'Clic: estrella fugaz · arrastra: constelación',
    },
    {
      id: 'hora',
      nombre: 'Según la hora',
      emoji: '🕰️',
      muestra: 'linear-gradient(90deg,#FBD3DE 33%,#A9DFD0 33% 66%,#2A1F55 66%)',
      detalle: 'Pétalos de día, estanque al atardecer, estrellas de noche',
    },
    {
      id: 'quieto',
      nombre: 'Fondo quieto',
      emoji: '🍃',
      muestra: 'linear-gradient(135deg,#FDF3F6,#E9E3FB)',
      detalle: 'Sin animación, ideal para PCs lentos',
    },
  ];
</script>

<script lang="ts">
  import { app, guardar } from '../estado.svelte';
  import Icono from './Icono.svelte';

  let { grande = false }: { grande?: boolean } = $props();
  let abierto = $state(false);

  function elegir(id: FondoOpcion) {
    app.fondo = id;
    guardar('fondo', id);
    abierto = false;
  }
</script>

{#if grande}
  <div class="rejilla">
    {#each OPCIONES_FONDO as o}
      <button class="opcion-grande tarjeta" class:elegido={app.fondo === o.id} onclick={() => elegir(o.id)}>
        <span class="muestra-grande" style:background={o.muestra}>{o.emoji}</span>
        <strong>{o.nombre}</strong>
        <span class="detalle">{o.detalle}</span>
      </button>
    {/each}
  </div>
{:else}
  <div class="selector">
    <button class="disparador" onclick={() => (abierto = !abierto)} aria-expanded={abierto} aria-label="Elegir fondo" title="Elegir fondo">
      <Icono nombre="paleta" tam={20} />
    </button>
    {#if abierto}
      <div class="menu tarjeta" role="menu">
        <span class="menu-titulo">Fondo</span>
        {#each OPCIONES_FONDO as o}
          <button class="opcion" class:elegido={app.fondo === o.id} onclick={() => elegir(o.id)} role="menuitemradio" aria-checked={app.fondo === o.id}>
            <span class="muestra" style:background={o.muestra}>{o.emoji}</span>
            <span>{o.nombre}</span>
            {#if app.fondo === o.id}<span class="check"><Icono nombre="check" tam={16} /></span>{/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .selector {
    position: relative;
  }
  .disparador {
    width: 40px;
    height: 40px;
    border-radius: 14px;
    display: grid;
    place-items: center;
    color: var(--primary-strong);
    background: var(--primary-soft);
    transition: transform 0.15s;
  }
  .disparador:hover {
    transform: rotate(-12deg);
  }
  .menu {
    position: absolute;
    bottom: 50px;
    left: -10px;
    width: 250px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    z-index: 30;
    animation: aparecer 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
    transform-origin: bottom left;
  }
  @keyframes aparecer {
    from {
      transform: scale(0.85);
      opacity: 0;
    }
  }
  .menu-titulo {
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
    padding: 4px 8px;
  }
  .opcion {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    border-radius: 12px;
    font-weight: 700;
    font-size: 14px;
    text-align: left;
  }
  .opcion:hover,
  .opcion.elegido {
    background: var(--surface-2);
  }
  .muestra {
    width: 30px;
    height: 30px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    font-size: 15px;
    flex: none;
  }
  .check {
    margin-left: auto;
    color: var(--primary);
  }
  .rejilla {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 12px;
  }
  .opcion-grande {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 10px 14px;
    text-align: left;
    border: 2px solid transparent;
    transition: transform 0.2s, border-color 0.2s;
  }
  .opcion-grande:hover {
    transform: translateY(-3px);
  }
  .opcion-grande.elegido {
    border-color: var(--primary);
  }
  .muestra-grande {
    height: 80px;
    border-radius: 14px;
    display: grid;
    place-items: center;
    font-size: 30px;
  }
  .detalle {
    font-size: 12px;
    color: var(--muted);
  }
</style>
