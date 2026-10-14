<script lang="ts">
  import Icono from '../componentes/Icono.svelte';
  import { api, type ResumenInventario } from '../api';
  import type { Libro } from '../datos';
  import { app, avisar, saludo } from '../estado.svelte';
  import { inventario, vista } from '../inventario.svelte';

  let { movil = false }: { movil?: boolean } = $props();

  const deNoche = $derived(app.hora >= 19 || app.hora < 5);
  let resumen = $state<ResumenInventario | null>(null);
  const stockBajo = $derived<Libro[]>((resumen?.stockBajo ?? []).slice(0, 4).map(vista));
  const k = $derived(resumen?.contadores);

  $effect(() => {
    void inventario.version;
    api.resumenInventario().then((r) => (resumen = r)).catch((e: Error) => avisar(e.message));
  });

  function abrirLibro(l: Libro) {
    app.seleccionado = l;
    if (movil) app.fichaMovil = true;
    else app.vista = 'buscar';
  }
</script>

<div class="inicio" class:movil data-vacio>
  <header class="saludo" data-vacio>
    <div>
      <h1>{saludo()},<br /><span>{app.usuario}!</span></h1>
      <p>Que tengas un lindo día entre libros ✨</p>
    </div>
    {#if deNoche}
      <svg class="ilus" width="130" height="100" viewBox="0 0 130 100" aria-hidden="true">
        <circle cx="70" cy="44" r="30" fill="#FFF4E0" />
        <circle cx="84" cy="34" r="27" fill="var(--bg)" />
        <text x="22" y="30" font-size="14">✦</text>
        <text x="108" y="72" font-size="11">✦</text>
        <text x="30" y="80" font-size="9">✦</text>
      </svg>
    {:else}
      <svg class="ilus" width="140" height="100" viewBox="0 0 140 100" aria-hidden="true">
        <defs>
          <radialGradient id="sol" cx="0.4" cy="0.35">
            <stop offset="0" stop-color="#FFE9A8" />
            <stop offset="1" stop-color="#F7C548" />
          </radialGradient>
          <linearGradient id="nube" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#FFE3EA" />
            <stop offset="1" stop-color="#F7B3C6" />
          </linearGradient>
        </defs>
        <g class="rayos">
          {#each Array.from({ length: 8 }, (_, i) => i) as i}
            <rect x="57" y="4" width="4" height="10" rx="2" fill="#F7C548" transform="rotate({i * 45} 59 36)" />
          {/each}
        </g>
        <circle cx="59" cy="36" r="20" fill="url(#sol)" />
        <g class="nube">
          <circle cx="62" cy="70" r="20" fill="url(#nube)" />
          <circle cx="86" cy="62" r="24" fill="url(#nube)" />
          <circle cx="110" cy="72" r="17" fill="url(#nube)" />
          <rect x="44" y="70" width="84" height="22" rx="11" fill="url(#nube)" />
        </g>
      </svg>
    {/if}
  </header>

  <div class="rejilla" data-vacio>
    <section class="resumen">
      <span class="sobre">Tu inventario</span>
      <div class="cuerpo">
        <svg class="pila" width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
          <rect x="14" y="60" width="70" height="16" rx="5" fill="#fff" opacity="0.95" />
          <rect x="20" y="44" width="60" height="16" rx="5" fill="#FCEFC7" />
          <rect x="10" y="28" width="66" height="16" rx="5" fill="#E9E3FB" />
          <rect x="24" y="12" width="52" height="16" rx="5" fill="#fff" opacity="0.85" />
          <circle cx="78" cy="18" r="9" fill="#F27A9B" />
          <path d="M74 18l3 3 5-6" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" />
        </svg>
        <div>
          <strong class="monto">{k ? k.libros : '…'} <small>{k?.libros === 1 ? 'libro' : 'libros'}</small></strong>
          <p>
            {#if k && k.libros}
              {k.unidades} ejemplares en la tienda{#if k.sinUbicacion} · {k.sinUbicacion} sin ubicación{/if}.<br />Las ventas del día aparecerán aquí 💕
            {:else}
              Aún no hay libros cargados.<br />¡Empecemos por el primero! 💕
            {/if}
          </p>
        </div>
      </div>
      <button class="btn btn-blanco" onclick={() => (app.vista = 'libros')}>
        {k?.libros ? 'Ver libros' : 'Agregar libros'} <Icono nombre="flecha" tam={18} />
      </button>
    </section>

    <section class="bloque">
      <div class="titulo-fila">
        <h2 class="titulo-seccion">Encargos pendientes</h2>
        <button class="enlace" onclick={() => (app.vista = 'encargos')}>Ver todos</button>
      </div>
      <div class="vacio-bloque">
        <Icono nombre="encargos" tam={26} />
        <p>Aún no hay encargos. Cuando un libro no esté, usa <b>«¿Lo encargamos?»</b> en la búsqueda.</p>
      </div>
    </section>

    <section class="bloque">
      <div class="titulo-fila">
        <h2 class="titulo-seccion">Quedan pocos</h2>
        <span class="atenuado pequeño">{k ? `${k.sinStock} agotados · ${k.stockBajo} por agotarse` : ''}</span>
      </div>
      {#if resumen && !stockBajo.length}
        <div class="vacio-bloque">
          <span class="emoji">🌸</span>
          <p>Todo bien abastecido por ahora.</p>
        </div>
      {/if}
      {#each stockBajo as l (l.id)}
        <button class="fila libro-fila tarjeta" onclick={() => abrirLibro(l)}>
          <span class="lomo" style:background={l.tapa}></span>
          <div class="fila-texto">
            <strong>{l.titulo}</strong>
            <span>{l.autor}</span>
          </div>
          <span class="cuantos" class:cero={l.stock === 0}>{l.stock === 0 ? 'Agotado' : l.stock === 1 ? 'Queda 1' : `Quedan ${l.stock}`}</span>
        </button>
      {/each}
    </section>

    <section class="consejo">
      <span class="corazon"><Icono nombre="corazon" tam={30} /></span>
      <div>
        <strong>Consejo del día</strong>
        <p>Cuando un libro no esté, usa <b>“¿Lo encargamos?”</b>: ¡así ningún cliente se va con las manos vacías! 🌷</p>
      </div>
      <button class="btn btn-suave" onclick={() => avisar('¡Gracias! 💗')}>Entendido</button>
    </section>
  </div>
</div>

<style>
  .vacio-bloque {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px;
    border-radius: 16px;
    background: var(--surface-2);
    color: var(--muted);
  }
  .vacio-bloque p {
    margin: 0;
    font-size: 14px;
  }
  .vacio-bloque .emoji {
    font-size: 24px;
  }
  .monto small {
    font-size: 18px;
  }
  .inicio {
    display: flex;
    flex-direction: column;
    gap: 18px;
    padding: 8px 6px 24px;
    max-width: 1100px;
  }
  .saludo {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 8px 0;
  }
  h1 {
    margin: 0;
    font-size: 34px;
    font-weight: 800;
    line-height: 1.15;
  }
  h1 span {
    color: var(--primary);
  }
  .saludo p {
    margin: 8px 0 0;
    color: var(--muted);
  }
  .ilus {
    flex: none;
    filter: drop-shadow(0 10px 14px rgba(242, 122, 155, 0.25));
  }
  .rayos {
    transform-origin: 59px 36px;
    animation: girar 24s linear infinite;
  }
  .nube {
    animation: nube 5s ease-in-out infinite;
  }
  @keyframes girar {
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes nube {
    50% {
      transform: translateX(-5px);
    }
  }
  .rejilla {
    display: grid;
    grid-template-columns: 1.1fr 1fr;
    gap: 18px;
    align-items: start;
  }
  .resumen {
    grid-row: span 2;
    background: linear-gradient(140deg, #f7a1b7, #f27a9b 70%);
    color: #fff;
    border-radius: var(--r-panel);
    padding: 20px 22px 22px;
    box-shadow: 0 16px 34px rgba(242, 122, 155, 0.35);
    display: flex;
    flex-direction: column;
    gap: 14px;
    position: relative;
    overflow: hidden;
  }
  .resumen::after {
    content: '';
    position: absolute;
    width: 240px;
    height: 240px;
    right: -80px;
    top: -90px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.14);
  }
  .sobre {
    font-size: 13px;
    font-weight: 700;
    opacity: 0.9;
  }
  .cuerpo {
    display: flex;
    gap: 14px;
    align-items: center;
  }
  .pila {
    flex: none;
    filter: drop-shadow(0 8px 10px rgba(150, 40, 80, 0.25));
  }
  .monto {
    font-size: 34px;
    font-weight: 800;
  }
  .cuerpo p {
    margin: 4px 0 0;
    font-size: 14px;
    opacity: 0.95;
  }
  .resumen .btn {
    align-self: flex-end;
    z-index: 1;
  }
  .bloque {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px;
    border-radius: var(--r-panel);
    background: var(--surface-glass);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--borde);
    box-shadow: var(--sombra-suave);
  }
  .titulo-fila {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 0 4px;
  }
  .enlace {
    color: var(--primary);
    font-weight: 700;
    font-size: 14px;
  }
  .pequeño {
    font-size: 12px;
  }
  .fila {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 16px;
    text-align: left;
    width: 100%;
  }
  :global([data-tema='noche']) .fila:not(.tarjeta) {
    color: #2b2b2b;
  }
  .fila-texto {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }
  .fila-texto strong {
    font-size: 14px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .fila-texto span {
    font-size: 12px;
    opacity: 0.7;
  }
  .libro-fila {
    transition: transform 0.15s;
  }
  .libro-fila:hover {
    transform: translateX(3px);
  }
  .lomo {
    width: 10px;
    height: 38px;
    border-radius: 3px;
    flex: none;
  }
  .cuantos {
    font-size: 12px;
    font-weight: 800;
    color: color-mix(in srgb, var(--warning) 70%, #7a4a00);
  }
  :global([data-tema='noche']) .cuantos {
    color: var(--warning);
  }
  .cuantos.cero {
    color: var(--primary-strong);
  }
  .consejo {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px 20px;
    border-radius: var(--r-panel);
    background: color-mix(in srgb, var(--primary-soft) 85%, transparent);
    backdrop-filter: blur(10px);
  }
  .corazon {
    color: var(--primary);
    animation: latido 1.8s ease-in-out infinite;
  }
  @keyframes latido {
    0%,
    100% {
      transform: scale(1);
    }
    15% {
      transform: scale(1.15);
    }
    30% {
      transform: scale(1);
    }
    45% {
      transform: scale(1.1);
    }
  }
  .consejo div {
    flex: 1;
  }
  .consejo p {
    margin: 2px 0 0;
    font-size: 14px;
  }

  /* --- celular --- */
  .movil h1 {
    font-size: 26px;
  }
  .movil .ilus {
    width: 100px;
  }
  .movil .rejilla {
    grid-template-columns: 1fr;
  }
  .movil .resumen {
    grid-row: auto;
  }
  .movil .consejo {
    flex-wrap: wrap;
  }
</style>
