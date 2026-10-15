<script lang="ts">
  // Escaneo continuo de ISBN con la cámara del celular: escanear → si ya está, sumar stock; si es nuevo, completar los
  // datos y guardarlo → siguiente. Pensado para cargar el inventario recorriendo los estantes.
  import { onDestroy, onMount } from 'svelte';
  import { normalizarIsbn } from '../api/demo';
  import { api, type Sugerencia } from '../api';
  import { soles, type Libro } from '../datos';
  import { app, avisar } from '../estado.svelte';
  import { revisarLlegada } from '../encargos.svelte';
  import { aCentimos, inventario, inventarioCambio, vista } from '../inventario.svelte';
  import { cancelarLectura, hayCamara, leer, permisoCamara } from '../escaner';
  import { miniatura } from '../portada';
  import { esDuena } from '../sesion.svelte';

  type Fase = 'apuntando' | 'buscando' | 'existente' | 'nuevo';
  let fase = $state<Fase>('apuntando');
  let mensaje = $state('');
  let activo = true;
  let manual = $state('');

  // lo escaneado en esta tanda
  let titulos = $state(new Set<number>());
  let ejemplares = $state(0);

  // libro que ya estaba
  let existente = $state<Libro | null>(null);
  let cuantos = $state('1');

  // libro nuevo
  let sug = $state<Sugerencia | null>(null);
  let isbn = $state('');
  let titulo = $state('');
  let autor = $state('');
  let editorial = $state('');
  let precio = $state('');
  let costo = $state('');
  let stock = $state('1');
  let categoria = $state('literarias');
  let guardando = $state(false);

  onMount(() => {
    if (hayCamara) document.documentElement.classList.add('camara');
    void ciclo();
  });
  onDestroy(() => {
    activo = false;
    document.documentElement.classList.remove('camara');
    void cancelarLectura();
  });

  /** Escucha la cámara hasta que lee un código; lo procesa y espera a que se pida el siguiente. */
  async function ciclo() {
    if (!hayCamara) return;
    if (!(await permisoCamara())) {
      mensaje = 'Sin permiso de la cámara no se puede escanear. Puedes escribir el ISBN a mano.';
      return;
    }
    while (activo && fase === 'apuntando') {
      try {
        const codigo = await leer('ean13', true);
        if (!activo) return;
        if (codigo) await procesar(codigo);
        else return;
      } catch (e) {
        mensaje = (e as Error).message;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }

  async function procesar(codigo: string) {
    const n = normalizarIsbn(codigo.replace(/\D/g, ''));
    if (!n) {
      mensaje = `«${codigo}» no es el ISBN de un libro. Apunta al código de barras de la contratapa.`;
      return;
    }
    mensaje = '';
    fase = 'buscando';
    try {
      const lista = await api.buscarLibros(n, { limite: 5 });
      const l = lista.find((x) => x.isbn === n);
      if (l) {
        existente = vista(l);
        cuantos = '1';
        fase = 'existente';
        return;
      }
      isbn = n;
      sug = await api.consultarIsbn(n).catch(() => null);
      titulo = sug?.titulo ?? '';
      autor = sug?.autor ?? '';
      editorial = sug?.editorial ?? '';
      precio = costo = '';
      stock = '1';
      fase = 'nuevo';
    } catch (e) {
      mensaje = (e as Error).message;
      fase = 'apuntando';
    }
  }

  function siguiente() {
    existente = null;
    sug = null;
    mensaje = '';
    fase = 'apuntando';
    void ciclo();
  }

  async function sumar(n: number) {
    if (!existente || !Number.isInteger(n) || n < 1) return void avisar('Escribe cuántos ejemplares llegaron (1 o más)');
    try {
      const l = await api.ajustarStock(existente.id, n, 'ingreso', 'Escaneado con el celular');
      existente = vista(l);
      titulos.add(l.id);
      titulos = new Set(titulos);
      ejemplares += n;
      inventarioCambio();
      avisar(`+${n} · ahora ${l.stock} ✓`);
      void revisarLlegada({ id: l.id, titulo: l.titulo, stock: l.stock }, false);
    } catch (e) {
      avisar((e as Error).message);
    }
  }

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    const p = aCentimos(precio);
    const c = costo.trim() ? aCentimos(costo) : 0;
    const n = Number(stock);
    if (!titulo.trim()) return void avisar('Escribe el título del libro');
    if (!p) return void avisar('Escribe el precio (por ejemplo 35.50)');
    if (c === null || !Number.isInteger(n) || n < 0) return void avisar('Revisa el costo y el stock');
    guardando = true;
    try {
      let l = await api.guardarLibro({ isbn, titulo, autor, editorial, anio: sug?.anio ?? null, sinopsis: sug?.sinopsis ?? '', categoria, precioCent: p, costoCent: esDuena() ? c : null, stock: n });
      if (sug?.portadaUrl) l = await api.portadaDesdeUrl(l.id, sug.portadaUrl).catch(() => l);
      titulos.add(l.id);
      titulos = new Set(titulos);
      ejemplares += n;
      inventarioCambio();
      avisar(`«${l.titulo}» agregado 📚`);
      void revisarLlegada({ id: l.id, titulo: l.titulo, stock: l.stock }, true);
      siguiente();
    } catch (x) {
      avisar((x as Error).message);
    } finally {
      guardando = false;
    }
  }

  function cerrar() {
    app.vista = 'inicio';
  }
</script>

<div class="escaner" class:con-camara={hayCamara} data-vacio>
  <header>
    <strong>📷 Escanear libros</strong>
    <span class="cuenta" data-testid="cuenta-escaneo">{titulos.size} {titulos.size === 1 ? 'título' : 'títulos'} · {ejemplares} {ejemplares === 1 ? 'ejemplar' : 'ejemplares'}</span>
    <button class="cerrar" onclick={cerrar} aria-label="Cerrar el escáner">✕</button>
  </header>

  {#if hayCamara && fase === 'apuntando'}
    <div class="visor" aria-hidden="true"><span class="marco"></span></div>
  {/if}

  <section class="hoja">
    {#if fase === 'apuntando' || fase === 'buscando'}
      <p class="guia">{fase === 'buscando' ? 'Buscando el libro…' : hayCamara ? 'Apunta al código de barras de la contratapa' : 'La cámara solo está en la app del celular. Escribe el ISBN:'}</p>
      {#if mensaje}<p class="aviso" role="alert">{mensaje}</p>{/if}
      <form class="manual" onsubmit={(e) => (e.preventDefault(), manual.trim() && procesar(manual).then(() => (manual = '')))}>
        <input bind:value={manual} inputmode="numeric" placeholder="ISBN (978…)" aria-label="ISBN a mano" disabled={fase === 'buscando'} />
        <button class="btn btn-suave" disabled={fase === 'buscando' || !manual.trim()}>Buscar</button>
      </form>
    {:else if fase === 'existente' && existente}
      <div class="libro" data-testid="escaneo-existente">
        <img src={existente.portada ?? miniatura(existente)} alt="" />
        <div class="datos">
          <span class="etiqueta ya">Ya lo tienes</span>
          <strong>{existente.titulo}</strong>
          <small>{existente.autor} · {soles(existente.precio)}</small>
          <span class="stock" class:cero={existente.stock === 0}>{existente.stock === 0 ? 'Agotado' : `Stock: ${existente.stock}`}</span>
        </div>
      </div>
      <div class="sumar">
        <button class="btn btn-primario" onclick={() => sumar(1)}>+1</button>
        <button class="btn btn-suave" onclick={() => sumar(5)}>+5</button>
        <input bind:value={cuantos} inputmode="numeric" aria-label="Cantidad a sumar" />
        <button class="btn btn-suave" onclick={() => sumar(Number(cuantos))}>Sumar</button>
      </div>
      <div class="acciones"><button class="btn btn-primario grande" onclick={siguiente}>Siguiente libro 📷</button></div>
    {:else if fase === 'nuevo'}
      <form class="nuevo" onsubmit={guardar} data-testid="escaneo-nuevo">
        <div class="cab">
          {#if sug?.portadaUrl}<img src={sug.portadaUrl} alt="" />{/if}
          <div>
            <span class="etiqueta nuevo">Libro nuevo · {isbn}</span>
            {#if !sug}<small class="atenuado">No encontré datos en internet: escríbelos a mano.</small>{/if}
          </div>
        </div>
        <label>Título<input bind:value={titulo} aria-label="Título" /></label>
        <label>Autor<input bind:value={autor} aria-label="Autor" /></label>
        <div class="tres">
          <label>Precio (S/)<input bind:value={precio} inputmode="decimal" placeholder="35.00" aria-label="Precio" /></label>
          {#if esDuena()}<label>Costo (S/)<input bind:value={costo} inputmode="decimal" placeholder="20.00" aria-label="Costo" /></label>{/if}
          <label>Stock<input bind:value={stock} inputmode="numeric" aria-label="Stock" /></label>
        </div>
        <label>
          Categoría
          <select bind:value={categoria} aria-label="Categoría">{#each inventario.categorias as c (c.clave)}<option value={c.clave}>{c.nombre}</option>{/each}</select>
        </label>
        <div class="acciones">
          <button type="button" class="btn btn-blanco" onclick={siguiente}>Omitir</button>
          <button class="btn btn-primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar y siguiente'}</button>
        </div>
      </form>
    {/if}
  </section>
</div>

<style>
  :global(html.camara),
  :global(html.camara body),
  :global(html.camara #app) {
    background: transparent !important;
  }
  :global(html.camara .fondo-animado),
  :global(html.camara canvas.fondo) {
    display: none !important;
  }
  .escaner {
    position: fixed;
    inset: 0;
    z-index: 55;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }
  .escaner.con-camara {
    background: transparent;
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: var(--surface);
    box-shadow: var(--sombra-suave);
  }
  header strong {
    flex: 1;
  }
  .cuenta {
    font-size: 12px;
    font-weight: 800;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--primary-soft);
    color: var(--primary-strong);
  }
  .cerrar {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--surface-2);
    font-weight: 800;
  }
  .visor {
    flex: 1;
    display: grid;
    place-items: center;
    min-height: 140px;
  }
  .marco {
    width: min(78%, 320px);
    height: 120px;
    border-radius: 18px;
    border: 3px solid #fff;
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.35);
    animation: latido 1.6s ease-in-out infinite;
  }
  @keyframes latido {
    50% {
      border-color: var(--primary);
    }
  }
  .hoja {
    margin-top: auto;
    padding: 16px 16px calc(18px + env(safe-area-inset-bottom));
    background: var(--surface);
    border-radius: 24px 24px 0 0;
    box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 72vh;
    overflow: auto;
  }
  .escaner:not(.con-camara) .hoja {
    margin-top: 0;
    flex: 1;
    max-height: none;
    border-radius: 0;
  }
  .guia {
    margin: 0;
    font-weight: 700;
    text-align: center;
  }
  .aviso {
    margin: 0;
    padding: 8px 12px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--yellow) 60%, var(--surface));
    font-weight: 700;
    font-size: 13px;
  }
  .manual,
  .sumar,
  .acciones {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .acciones {
    justify-content: flex-end;
  }
  input,
  select {
    height: 42px;
    min-width: 0;
    box-sizing: border-box;
    border-radius: 12px;
    border: 1.5px solid var(--linea);
    background: var(--surface);
    padding: 0 12px;
    font: inherit;
    font-weight: 600;
    color: var(--text);
  }
  .manual input {
    flex: 1;
  }
  .sumar input {
    width: 64px;
    text-align: center;
  }
  .libro,
  .cab {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .libro img,
  .cab img {
    width: 54px;
    height: 80px;
    object-fit: cover;
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }
  .datos {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .datos small {
    color: var(--muted);
  }
  .etiqueta {
    align-self: flex-start;
    font-size: 11px;
    font-weight: 800;
    padding: 2px 10px;
    border-radius: 999px;
  }
  .etiqueta.ya {
    background: color-mix(in srgb, #5dbb8a 30%, var(--surface));
  }
  .etiqueta.nuevo {
    background: color-mix(in srgb, #9b87e0 25%, var(--surface));
  }
  .stock {
    font-weight: 800;
    color: #2f8a5c;
  }
  .stock.cero {
    color: #b0243f;
  }
  .nuevo {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .nuevo label {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 12px;
    font-weight: 800;
  }
  .tres {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
    gap: 8px;
  }
  .grande {
    height: 50px;
    font-size: 16px;
    flex: 1;
  }
</style>
