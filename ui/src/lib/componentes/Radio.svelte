<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../estado.svelte';
  import { motor, anclaRadio } from '../fondo/motor';
  import { musica, PISTAS } from '../musica';
  import Icono from './Icono.svelte';

  let { compacta = false }: { compacta?: boolean } = $props();
  let el: HTMLElement = $state()!;

  onMount(() => {
    anclaRadio.el = el;
    return () => {
      if (anclaRadio.el === el) anclaRadio.el = null;
    };
  });

  const pista = $derived(PISTAS[app.radio.pista]);
  // la marquesina solo se mueve si el título no cabe
  let anchoCaja = $state(0);
  let anchoTexto = $state(0);
  const desplazar = $derived(Math.max(0, anchoTexto - anchoCaja));

  async function alternar() {
    if (app.radio.sonando) {
      musica.pausar();
      app.radio.sonando = false;
    } else {
      await musica.reproducir(app.radio.pista);
      app.radio.sonando = true;
      motor()?.despertar();
    }
  }

  function siguiente() {
    app.radio.pista = (app.radio.pista + 1) % PISTAS.length;
    musica.cambiar(app.radio.pista);
  }

  $effect(() => musica.fijarVolumen(app.radio.volumen));
</script>

{#snippet ilustracion(tam: number)}
  <svg class="ilus" class:sonando={app.radio.sonando} width={tam} height={tam * 0.9} viewBox="0 0 80 72" aria-hidden="true">
    <g class="antena">
      <line x1="52" y1="20" x2="66" y2="3" stroke="#C9A3B3" stroke-width="2.5" stroke-linecap="round" />
      <circle cx="66" cy="3" r="3" fill="#F27A9B" />
    </g>
    <rect x="4" y="18" width="72" height="50" rx="16" fill="#FBD3DE" />
    <rect x="4" y="18" width="72" height="50" rx="16" fill="url(#brilloRadio)" />
    <circle cx="26" cy="44" r="14" fill="#fff" opacity="0.9" />
    {#each [[-6, -6], [0, -7], [6, -6], [-7, 0], [0, 0], [7, 0], [-6, 6], [0, 7], [6, 6]] as [dx, dy]}
      <circle cx={26 + dx} cy={44 + dy} r="1.6" fill="#F7A1B7" />
    {/each}
    <rect x="46" y="30" width="22" height="12" rx="4" fill="#FFF7F9" />
    <line class="aguja" x1="52" y1="31.5" x2="52" y2="40.5" stroke="#E5587F" stroke-width="1.6" stroke-linecap="round" />
    <circle cx="50" cy="54" r="4.5" fill="#F27A9B" />
    <circle cx="63" cy="54" r="4.5" fill="#FCEFC7" />
    <defs>
      <linearGradient id="brilloRadio" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.55" />
        <stop offset="0.5" stop-color="#fff" stop-opacity="0" />
      </linearGradient>
    </defs>
  </svg>
{/snippet}

{#if compacta}
  <div class="compacta" bind:this={el}>
    <button class="boton-radio" onclick={alternar} aria-label={app.radio.sonando ? 'Pausar música' : 'Reproducir música'}>
      {@render ilustracion(34)}
    </button>
    {#if app.radio.sonando}
      <button class="mini-sig" onclick={siguiente} aria-label="Siguiente canción"><Icono nombre="siguiente" tam={16} relleno /></button>
    {/if}
  </div>
{:else}
  <section class="radio vidrio" bind:this={el} aria-label="Radio">
    <div class="arriba">
      <button class="ilus-boton" onclick={alternar} aria-label="Encender o apagar la radio">
        {@render ilustracion(64)}
        {#if app.radio.sonando}
          <span class="nota n1">♪</span><span class="nota n2">♫</span>
        {/if}
      </button>
      <div class="info">
        <span class="etiqueta">{app.radio.sonando ? 'Sonando' : 'Radio'}</span>
        <div class="marquesina" class:recorte={desplazar > 0} bind:clientWidth={anchoCaja}>
          <span class:mover={app.radio.sonando && desplazar > 0} style:--d="{desplazar}px" bind:offsetWidth={anchoTexto}>{pista.nombre}</span>
        </div>
        <span class="ambiente">{pista.ambiente}</span>
      </div>
    </div>
    <div class="controles">
      <button class="play" onclick={alternar} aria-label={app.radio.sonando ? 'Pausar' : 'Reproducir'}>
        <Icono nombre={app.radio.sonando ? 'pausa' : 'play'} tam={18} relleno grosor={0} />
      </button>
      <button class="sig" onclick={siguiente} aria-label="Siguiente canción">
        <Icono nombre="siguiente" tam={16} relleno grosor={1.6} />
      </button>
      <Icono nombre="volumen" tam={16} />
      <input type="range" min="0" max="1" step="0.01" bind:value={app.radio.volumen} aria-label="Volumen" />
    </div>
  </section>
{/if}

<style>
  .radio {
    padding: 14px 14px 12px;
    border-radius: 24px;
  }
  .arriba {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .ilus-boton {
    position: relative;
    flex: none;
  }
  .ilus :global(.antena) {
    transform-origin: 52px 20px;
  }
  .ilus.sonando :global(.antena) {
    animation: antena 1.4s ease-in-out infinite;
  }
  .ilus.sonando :global(.aguja) {
    animation: aguja 6s ease-in-out infinite;
  }
  @keyframes antena {
    50% {
      transform: rotate(-8deg);
    }
  }
  @keyframes aguja {
    50% {
      transform: translateX(10px);
    }
  }
  .nota {
    position: absolute;
    color: var(--primary);
    font-weight: 800;
    pointer-events: none;
    animation: nota 2.4s ease-out infinite;
    opacity: 0;
  }
  .n1 {
    left: 6px;
    top: 0;
  }
  .n2 {
    left: 26px;
    top: -4px;
    animation-delay: 1.2s;
  }
  @keyframes nota {
    0% {
      transform: translateY(6px) scale(0.8);
      opacity: 0;
    }
    30% {
      opacity: 1;
    }
    100% {
      transform: translate(14px, -22px) rotate(15deg);
      opacity: 0;
    }
  }
  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .etiqueta {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--primary);
  }
  .marquesina {
    overflow: hidden;
    white-space: nowrap;
    font-weight: 800;
    font-size: 15px;
  }
  .marquesina.recorte {
    mask-image: linear-gradient(90deg, #000 88%, transparent);
  }
  .marquesina span {
    display: inline-block;
    padding-left: 4px;
  }
  .marquesina .mover {
    animation: marquesina 9s linear infinite;
  }
  @keyframes marquesina {
    0%,
    15% {
      transform: translateX(0);
    }
    85%,
    100% {
      transform: translateX(calc(-1 * var(--d)));
    }
  }
  .ambiente {
    font-size: 12px;
    color: var(--muted);
  }
  .controles {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
    color: var(--muted);
  }
  .play {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--primary);
    color: var(--on-primary);
    display: grid;
    place-items: center;
    box-shadow: 0 6px 14px color-mix(in srgb, var(--primary) 40%, transparent);
    transition: transform 0.15s;
  }
  .play:active,
  .sig:active {
    transform: scale(0.9);
  }
  .sig {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--primary-soft);
    color: var(--primary-strong);
    display: grid;
    place-items: center;
  }
  input[type='range'] {
    flex: 1;
    min-width: 0;
    accent-color: var(--primary);
    height: 4px;
  }
  .compacta {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .boton-radio {
    width: 46px;
    height: 46px;
    border-radius: 16px;
    background: var(--surface);
    display: grid;
    place-items: center;
    box-shadow: var(--sombra-suave);
  }
  .mini-sig {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--primary-soft);
    color: var(--primary-strong);
    display: grid;
    place-items: center;
  }
</style>
