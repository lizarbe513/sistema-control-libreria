<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { normalizar } from '../../busqueda';
  import { icono } from '../../tienda/iconos';
  import { CATALOGO, CATEGORIAS_BLOQUE, type Categoria, type TipoBloque } from '../../tienda/modelo';

  let { onElegir, onCerrar }: { onElegir: (t: TipoBloque) => void; onCerrar: () => void } = $props();

  let categoria = $state<Categoria | 'todo'>('todo');
  let consulta = $state('');

  const lista = $derived(
    CATALOGO.filter((i) => (categoria === 'todo' || i.categoria === categoria) && normalizar(i.nombre).includes(normalizar(consulta))),
  );
</script>

<div class="fondo" transition:fade={{ duration: 150 }} onclick={onCerrar} role="presentation"></div>
<div class="inventario vidrio" transition:scale={{ start: 0.94, duration: 200 }} role="dialog" aria-label="Inventario de bloques">
  <header>
    <h2>🎒 Inventario</h2>
    <input placeholder="Buscar…" bind:value={consulta} aria-label="Buscar bloque" />
    <button class="cerrar" onclick={onCerrar} aria-label="Cerrar">✕</button>
  </header>
  <nav>
    <button class:activa={categoria === 'todo'} onclick={() => (categoria = 'todo')}>✨ Todo</button>
    {#each CATEGORIAS_BLOQUE as c}
      <button class:activa={categoria === c.id} onclick={() => (categoria = c.id)}>{c.emoji} {c.nombre}</button>
    {/each}
  </nav>
  <p class="atenuado">Haz clic en un objeto para llevarlo a tu barra. Clic derecho en una ranura la vacía.</p>
  <div class="rejilla">
    {#each lista as item (item.id)}
      {@const url = icono(item.id)}
      <button class="objeto" onclick={() => onElegir(item.id)} title={item.nombre}>
        {#if url}<img src={url} alt="" />{:else}<span class="emoji">{item.emoji}</span>{/if}
        <span class="nombre">{item.nombre}</span>
        {#if item.guardaLibros}<span class="marca" title="Guarda libros">📖</span>{/if}
      </button>
    {:else}
      <p class="atenuado">Nada con ese nombre.</p>
    {/each}
  </div>
</div>

<style>
  .fondo {
    position: absolute;
    inset: 0;
    background: rgba(60, 30, 45, 0.18);
    z-index: 20;
  }
  .inventario {
    position: absolute;
    left: 50%;
    top: 50%;
    translate: -50% -50%;
    width: min(760px, calc(100% - 32px));
    max-height: calc(100% - 140px);
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 18px;
    z-index: 21;
    background: var(--surface);
  }
  header {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 800;
  }
  header input {
    flex: 1;
    font: inherit;
    padding: 8px 14px;
    border-radius: 999px;
    border: 2px solid var(--linea);
    background: var(--surface-2);
    color: var(--text);
  }
  header input:focus {
    outline: none;
    border-color: var(--primary);
  }
  .cerrar {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--surface-2);
    font-weight: 800;
  }
  nav {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  nav button {
    padding: 6px 12px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 700;
    background: var(--surface-2);
    border: 2px solid transparent;
  }
  nav button.activa {
    border-color: var(--primary);
    background: var(--primary-soft);
    color: var(--primary-strong);
  }
  p {
    margin: 0;
    font-size: 12px;
  }
  .rejilla {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
    gap: 8px;
    overflow-y: auto;
    padding: 2px;
  }
  .objeto {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px 4px;
    border-radius: 16px;
    background: var(--surface-2);
    border: 2px solid transparent;
    transition:
      transform 0.15s,
      border-color 0.2s;
  }
  .objeto:hover {
    transform: translateY(-3px);
    border-color: var(--primary);
  }
  .objeto:active {
    transform: scale(0.94);
  }
  img {
    width: 72px;
    height: 72px;
  }
  .emoji {
    font-size: 40px;
    height: 72px;
    display: grid;
    place-items: center;
  }
  .nombre {
    font-size: 12px;
    font-weight: 700;
    text-align: center;
    line-height: 1.15;
  }
  .marca {
    position: absolute;
    top: 6px;
    right: 8px;
    font-size: 13px;
  }
</style>
