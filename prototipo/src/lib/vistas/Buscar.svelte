<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fly } from 'svelte/transition';
  import Icono from '../componentes/Icono.svelte';
  import { buscar } from '../busqueda';
  import { CATEGORIAS, LIBROS, estantePorId, soles, type CategoriaId, type Libro } from '../datos';
  import { app, avisar } from '../estado.svelte';
  import { miniatura } from '../portada';

  let { movil = false }: { movil?: boolean } = $props();
  let categoria = $state<CategoriaId | null>(null);
  let entrada: HTMLInputElement;

  const SUGERENCIAS = ['principito', 'lumbreras', 'biblia', 'arguedas', 'cuentos', 'kiyosaki'];

  const resultados = $derived.by(() => {
    const base = app.consulta.trim() ? buscar(LIBROS, app.consulta) : LIBROS;
    return categoria ? base.filter((l) => l.categoria === categoria) : base;
  });
  const buscando = $derived(app.consulta.trim().length > 0 || categoria !== null);

  function elegir(l: Libro) {
    app.seleccionado = l;
    if (movil) app.fichaMovil = true;
  }

  function tecla(e: KeyboardEvent) {
    if (e.key === 'Enter' && resultados.length) elegir(resultados[0]);
    if (e.key === 'Escape') app.consulta = '';
  }

  $effect(() => {
    if (!movil) entrada?.focus();
  });
</script>

<div class="buscar" class:movil data-vacio>
  <div class="barra">
    <Icono nombre="buscar" tam={22} />
    <input
      bind:this={entrada}
      bind:value={app.consulta}
      onkeydown={tecla}
      placeholder="Título, autor, editorial o tema…"
      aria-label="Buscar libro"
    />
    {#if app.consulta}
      <button class="limpiar" onclick={() => (app.consulta = '')} aria-label="Borrar búsqueda"><Icono nombre="cerrar" tam={18} /></button>
    {/if}
  </div>

  <div class="chips-fila" data-vacio>
    <button class="filtro" class:activo={categoria === null} onclick={() => (categoria = null)}>Todas</button>
    {#each Object.values(CATEGORIAS) as c}
      <button
        class="filtro"
        class:activo={categoria === c.id}
        style:--c={c.color}
        onclick={() => (categoria = categoria === c.id ? null : c.id)}>{c.nombre}</button
      >
    {/each}
  </div>

  {#if !buscando}
    <div class="sugerencias" data-vacio>
      <span class="atenuado">Prueba con:</span>
      {#each SUGERENCIAS as s}
        <button class="sugerencia" onclick={() => (app.consulta = s)}>{s}</button>
      {/each}
    </div>
  {/if}

  <div class="encabezado" data-vacio>
    <h2 class="titulo-seccion">{buscando ? `${resultados.length} ${resultados.length === 1 ? 'resultado' : 'resultados'}` : `Todo el catálogo (${LIBROS.length})`}</h2>
    {#if buscando && resultados.length}<span class="atenuado pista">Enter abre el primero</span>{/if}
  </div>

  {#if resultados.length}
    <div class="resultados" data-vacio>
      {#each resultados as l (l.id)}
        {@const e = estantePorId(l.estante)}
        <button class="libro tarjeta" class:elegido={app.seleccionado?.id === l.id} onclick={() => elegir(l)} animate:flip={{ duration: 300 }}>
          <img src={miniatura(l)} alt="" />
          <div class="info">
            <strong>{l.titulo}</strong>
            <span class="autor">{l.autor}</span>
            <div class="abajo">
              <span class="precio">{soles(l.precio)}</span>
              {#if l.stock > 0}
                <span class="estante" style:background={e.color} style:color={e.fuerte}>Est. {l.estante}·{l.repisa}</span>
              {:else}
                <span class="agotado">Agotado</span>
              {/if}
            </div>
          </div>
        </button>
      {/each}
    </div>
  {:else}
    <div class="no-encontrado" in:fly={{ y: 16, duration: 400 }}>
      <svg width="120" height="110" viewBox="0 0 120 110" aria-hidden="true">
        <ellipse cx="60" cy="100" rx="40" ry="6" fill="var(--primary-soft)" />
        <rect x="30" y="34" width="50" height="62" rx="6" fill="#FBD3DE" />
        <rect x="36" y="34" width="44" height="62" rx="4" fill="#fff" />
        <circle cx="50" cy="58" r="3" fill="#2b2b2b" />
        <circle cx="66" cy="58" r="3" fill="#2b2b2b" />
        <path d="M52 72q6 -5 12 0" stroke="#2b2b2b" stroke-width="2" fill="none" stroke-linecap="round" />
        <g class="lupa">
          <circle cx="88" cy="36" r="14" fill="rgba(221,239,251,0.7)" stroke="#F27A9B" stroke-width="4" />
          <line x1="98" y1="46" x2="110" y2="58" stroke="#F27A9B" stroke-width="5" stroke-linecap="round" />
        </g>
      </svg>
      <h3>No encontré “{app.consulta}”</h3>
      <p>Puede que no lo tengamos todavía. ¡No dejes ir al cliente!</p>
      <button class="btn btn-primario" onclick={() => avisar(`Encargo precargado: “${app.consulta}” 📦`)}>
        <Icono nombre="encargos" tam={18} /> ¿Lo encargamos?
      </button>
    </div>
  {/if}
</div>

<style>
  .buscar {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 4px 4px 24px;
  }
  .barra {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 58px;
    padding: 0 18px;
    border-radius: 999px;
    background: var(--surface);
    box-shadow: var(--sombra);
    color: var(--primary);
    border: 2px solid transparent;
    transition: border-color 0.2s;
  }
  .barra:focus-within {
    border-color: var(--primary-soft);
  }
  .barra input {
    flex: 1;
    border: none;
    outline: none;
    background: none;
    font-size: 18px;
    font-weight: 600;
    color: var(--text);
    min-width: 0;
  }
  .barra input::placeholder {
    color: var(--muted);
    font-weight: 400;
  }
  .limpiar {
    color: var(--muted);
    display: grid;
    place-items: center;
  }
  .chips-fila {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 4px;
    scrollbar-width: none;
  }
  .filtro {
    flex: none;
    padding: 8px 14px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 700;
    background: var(--surface-glass);
    border: 1px solid var(--borde);
    backdrop-filter: blur(8px);
    transition: background 0.2s, transform 0.15s;
  }
  .filtro:hover {
    transform: translateY(-1px);
  }
  .filtro.activo {
    background: var(--c, var(--primary));
    color: var(--c, #fff);
  }
  .filtro.activo:not([style]) {
    color: var(--on-primary);
  }
  .filtro.activo[style] {
    color: #2b2b2b;
    box-shadow: inset 0 0 0 2px color-mix(in srgb, #000 8%, transparent);
  }
  .sugerencias {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  }
  .sugerencia {
    padding: 4px 12px;
    border-radius: 999px;
    background: var(--primary-soft);
    color: var(--primary-strong);
    font-weight: 700;
    font-size: 13px;
  }
  .encabezado {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 4px 6px 0;
  }
  .pista {
    font-size: 12px;
  }
  .resultados {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 12px;
  }
  .libro {
    display: flex;
    gap: 12px;
    padding: 10px;
    text-align: left;
    border: 2px solid transparent;
    transition:
      transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1),
      border-color 0.2s,
      box-shadow 0.2s;
  }
  .libro:hover {
    transform: translateY(-3px);
    box-shadow: var(--sombra);
  }
  .libro.elegido {
    border-color: var(--primary);
  }
  .libro img {
    width: 58px;
    height: 87px;
    border-radius: 3px 8px 8px 3px;
    object-fit: cover;
    box-shadow: 2px 4px 10px rgba(0, 0, 0, 0.15);
    flex: none;
  }
  .info {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }
  .info strong {
    font-size: 15px;
    line-height: 1.2;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .autor {
    font-size: 13px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .abajo {
    margin-top: auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .precio {
    font-weight: 800;
    color: var(--primary-strong);
  }
  .estante {
    font-size: 12px;
    font-weight: 800;
    padding: 3px 9px;
    border-radius: 10px;
    filter: saturate(1.2);
  }
  :global([data-tema='noche']) .estante {
    color: #2b2b2b !important;
  }
  .agotado {
    font-size: 12px;
    font-weight: 800;
    color: var(--primary-strong);
  }
  .no-encontrado {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 30px 20px;
    gap: 6px;
    background: var(--surface-glass);
    backdrop-filter: blur(12px);
    border-radius: var(--r-panel);
    border: 1px solid var(--borde);
  }
  .no-encontrado h3 {
    margin: 8px 0 0;
    font-weight: 800;
  }
  .no-encontrado p {
    margin: 0 0 10px;
    color: var(--muted);
  }
  .lupa {
    transform-origin: 88px 36px;
    animation: buscarLupa 2.2s ease-in-out infinite;
  }
  @keyframes buscarLupa {
    50% {
      transform: translate(-8px, 4px) rotate(-10deg);
    }
  }
  .movil .resultados {
    grid-template-columns: 1fr;
  }
  .movil .barra {
    height: 52px;
  }
</style>
