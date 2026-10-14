<script lang="ts">
  import { CATEGORIAS, soles, type Libro } from '../datos';
  import { app, avisar } from '../estado.svelte';
  import { inventario } from '../inventario.svelte';
  import { esDuena } from '../sesion.svelte';
  import { agregar } from '../ventas/carrito.svelte';

  const puedeEditar = $derived(esDuena() || inventario.vendedoresEditan);
  const PRONTO = 'Los encargos llegan en la próxima etapa del programa 🌱';
  import Icono from './Icono.svelte';
  import Libro3D from './Libro3D.svelte';
  import Ubicacion from './Ubicacion.svelte';

  let { libro }: { libro: Libro | null } = $props();

  const stock = $derived.by(() => {
    if (!libro) return null;
    if (libro.stock === 0) return { texto: 'Agotado', clase: 'agotado' };
    if (libro.stock === 1) return { texto: '¡Último ejemplar!', clase: 'ultimo' };
    return { texto: `${libro.stock} en stock`, clase: 'hay' };
  });
</script>

{#if libro}
  <div class="panel-libro">
    <div class="escenario">
      <Libro3D {libro} />
    </div>

    {#key libro.id}
      <div class="datos">
        <h2>{libro.titulo}</h2>
        <p class="autor">{libro.autor}</p>
        <div class="chips">
          <span class="chip" style:background={CATEGORIAS[libro.categoria].color}>{CATEGORIAS[libro.categoria].nombre}</span>
          {#if libro.editorial || libro.anio}
            <span class="chip neutro">{[libro.editorial, libro.anio].filter(Boolean).join(' · ')}</span>
          {/if}
        </div>
        <div class="precio-fila">
          <span class="precio">{soles(libro.precio)}</span>
          <span class="stock {stock?.clase}">{stock?.texto}</span>
        </div>
      </div>

      {#if libro.stock > 0}
        <Ubicacion {libro} />
      {/if}

      <div class="acciones">
        {#if libro.stock > 0}
          <button
            class="btn btn-primario"
            onclick={() => {
              const aviso = agregar(libro);
              if (aviso) return avisar(aviso);
              app.fichaMovil = false;
              app.vista = 'vender';
            }}
          >
            <Icono nombre="carrito" tam={18} /> Vender
          </button>
        {:else}
          <div class="aviso-agotado">
            Este libro está agotado. ¿El cliente lo quiere igual? Haz un encargo y te avisamos cuando llegue.
          </div>
          <button class="btn btn-primario" onclick={() => avisar(PRONTO)}>
            <Icono nombre="encargos" tam={18} /> ¿Lo encargamos?
          </button>
        {/if}
        {#if puedeEditar}
          <button
            class="btn btn-suave"
            onclick={() => {
              app.editar = libro.id;
              app.vista = 'libros';
            }}><Icono nombre="nota" tam={18} /> Editar</button
          >
        {/if}
      </div>
    {/key}
  </div>
{:else}
  <div class="vacio">
    <svg width="150" height="120" viewBox="0 0 150 120" aria-hidden="true">
      <ellipse cx="75" cy="108" rx="52" ry="7" fill="var(--primary-soft)" />
      <rect x="28" y="62" width="94" height="18" rx="5" fill="#E9E3FB" />
      <rect x="34" y="44" width="82" height="18" rx="5" fill="#FCEFC7" />
      <rect x="24" y="80" width="102" height="22" rx="6" fill="#FBD3DE" />
      <rect x="40" y="86" width="40" height="4" rx="2" fill="#fff" opacity="0.8" />
      <g class="flotar">
        <rect x="56" y="6" width="38" height="30" rx="5" fill="#F27A9B" transform="rotate(-10 75 21)" />
        <path d="M70 18l3 3 6-7" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round" transform="rotate(-10 75 21)" />
      </g>
      <text x="118" y="30" font-size="16">✨</text>
    </svg>
    <h3>Busca un libro</h3>
    <p>Cuando lo encuentres, aparecerá aquí para que lo mires de cerca y sepas exactamente dónde está.</p>
  </div>
{/if}

<style>
  .panel-libro {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .escenario {
    height: 300px;
    margin: -6px -6px 0;
    border-radius: 22px;
    background:
      radial-gradient(circle at 50% 85%, color-mix(in srgb, var(--primary-soft) 80%, transparent), transparent 60%),
      radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--surface) 60%, transparent), transparent 70%);
  }
  .datos {
    display: flex;
    flex-direction: column;
    gap: 6px;
    animation: subir 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
    animation-delay: 0.25s;
  }
  @keyframes subir {
    from {
      transform: translateY(12px);
      opacity: 0;
    }
  }
  h2 {
    margin: 0;
    font-size: 22px;
    font-weight: 800;
    line-height: 1.15;
  }
  .autor {
    margin: 0;
    color: var(--muted);
    font-weight: 600;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip.neutro {
    background: var(--surface-2);
  }
  :global([data-tema='noche']) .chip {
    color: #2b2b2b;
  }
  :global([data-tema='noche']) .chip.neutro {
    color: var(--text);
  }
  .precio-fila {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 4px;
  }
  .precio {
    font-size: 26px;
    font-weight: 800;
    color: var(--primary-strong);
  }
  .stock {
    font-size: 13px;
    font-weight: 800;
    padding: 5px 12px;
    border-radius: 999px;
  }
  .stock.hay {
    background: color-mix(in srgb, var(--success) 18%, transparent);
    color: var(--success);
  }
  .stock.ultimo {
    background: color-mix(in srgb, var(--warning) 22%, transparent);
    color: color-mix(in srgb, var(--warning) 70%, #7a4a00);
  }
  .stock.agotado {
    background: color-mix(in srgb, var(--primary) 18%, transparent);
    color: var(--primary-strong);
  }
  .acciones {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .acciones .btn {
    flex: 1;
  }
  .aviso-agotado {
    width: 100%;
    font-size: 14px;
    padding: 12px 14px;
    border-radius: 16px;
    background: var(--yellow);
  }
  .vacio {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 20px;
    color: var(--muted);
  }
  .vacio h3 {
    color: var(--text);
    margin: 12px 0 4px;
    font-weight: 800;
  }
  .vacio p {
    margin: 0;
    max-width: 260px;
    font-size: 14px;
  }
  .flotar {
    animation: flotar 3s ease-in-out infinite;
  }
  @keyframes flotar {
    50% {
      transform: translateY(-6px);
    }
  }
</style>
