<script lang="ts">
  // Busca un libro conocido en internet por título o autor y deja elegir el exacto (con su portada).
  import { api, type ResultadoLinea } from '../api';

  let { onElegir }: { onElegir: (r: ResultadoLinea) => void } = $props();

  let titulo = $state('');
  let autor = $state('');
  let buscando = $state(false);
  let resultados = $state<ResultadoLinea[] | null>(null);
  let error = $state('');
  /** Portadas que no cargaron: se muestra la tapa de relleno. */
  let rotas = $state(new Set<number>());

  async function buscar(e?: SubmitEvent) {
    e?.preventDefault();
    if (buscando || (titulo.trim().length < 2 && autor.trim().length < 2)) return;
    buscando = true;
    error = '';
    rotas = new Set();
    try {
      resultados = await api.buscarEnLinea(titulo, autor);
    } catch (x) {
      error = (x as Error).message;
      resultados = null;
    } finally {
      buscando = false;
    }
  }
</script>

<section class="buscador">
  <form onsubmit={buscar}>
    <label class="campo">Título <input bind:value={titulo} placeholder="Ej.: el principito" autocomplete="off" /></label>
    <label class="campo">Autor <input bind:value={autor} placeholder="Ej.: saint-exupéry (opcional)" autocomplete="off" /></label>
    <button class="btn btn-primario" disabled={buscando || (titulo.trim().length < 2 && autor.trim().length < 2)}>
      {buscando ? 'Buscando…' : '🔎 Buscar'}
    </button>
  </form>

  {#if error}<p class="error" role="alert">{error}</p>{/if}

  {#if resultados}
    {#if resultados.length}
      <p class="ayuda">Elige el libro. Se llenan los datos y su portada; puede no parecerse a tu ejemplar y la puedes cambiar después.</p>
      <ul class="rejilla">
        {#each resultados as r, i (i)}
          <li>
            <button type="button" class="resultado" onclick={() => onElegir(r)}>
              {#if r.portadaUrl && !rotas.has(i)}
                <img src={r.portadaUrl} alt="" loading="lazy" onerror={() => (rotas = new Set([...rotas, i]))} />
              {:else}
                <span class="tapa"><span>{r.titulo}</span></span>
              {/if}
              <strong>{r.titulo}</strong>
              <small>{r.autor || 'Autor desconocido'}</small>
              <small class="detalle">{[r.editorial, r.anio].filter(Boolean).join(' · ')}{r.espanol ? '' : ' · otro idioma'}</small>
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="vacio">No encontré ese libro. Prueba con menos palabras o solo con el autor; o llena los datos a mano abajo.</p>
    {/if}
  {/if}
</section>

<style>
  .buscador {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  form {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
    gap: 8px;
    align-items: end;
  }
  .campo {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-weight: 700;
    font-size: 13px;
  }
  input {
    font: inherit;
    font-weight: 600;
    font-size: 14px;
    padding: 9px 12px;
    border-radius: 12px;
    border: 2px solid var(--linea);
    background: var(--surface);
    color: var(--text);
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
  }
  input:focus {
    outline: none;
    border-color: var(--primary);
  }
  .ayuda,
  .vacio {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }
  .vacio {
    padding: 12px;
    border-radius: 12px;
    background: var(--surface-2);
    font-weight: 700;
  }
  .error {
    margin: 0;
    padding: 10px 14px;
    border-radius: 12px;
    background: color-mix(in srgb, #e0405f 14%, var(--surface));
    color: #b0243f;
    font-weight: 700;
    font-size: 14px;
  }
  .rejilla {
    list-style: none;
    margin: 0;
    padding: 2px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
    gap: 10px;
    max-height: 340px;
    overflow-y: auto;
  }
  .resultado {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 2px;
    text-align: left;
    padding: 8px;
    border-radius: 14px;
    background: var(--surface);
    border: 2px solid transparent;
    box-shadow: var(--sombra-suave);
    transition:
      transform 0.15s,
      border-color 0.2s;
  }
  .resultado:hover {
    transform: translateY(-3px);
    border-color: var(--primary);
  }
  img,
  .tapa {
    width: 100%;
    aspect-ratio: 2 / 3;
    border-radius: 6px;
    object-fit: cover;
    margin-bottom: 4px;
    background: var(--surface-2);
  }
  .tapa {
    display: grid;
    place-items: center;
    padding: 8px;
    text-align: center;
    font-weight: 800;
    font-size: 12px;
    background: var(--primary-soft);
    color: var(--primary-strong);
  }
  strong {
    font-size: 13px;
    line-height: 1.2;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  small {
    color: var(--muted);
    font-size: 11px;
    line-height: 1.25;
  }
  .detalle {
    font-weight: 700;
  }
</style>
