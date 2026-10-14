<script lang="ts">
  // Cajón para agregar o editar un libro: ISBN con datos desde internet, portada, precios, stock y
  // la ubicación elegida tocando la tienda 3D.
  import { onDestroy, untrack } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { api, type Formato, type LibroApi, type ResultadoLinea, type Sugerencia, type UbicacionApi } from '../api';
  import { CATEGORIAS, soles, type Libro } from '../datos';
  import { avisar } from '../estado.svelte';
  import { revisarLlegada } from '../encargos.svelte';
  import { aCentimos, aSoles, borrador, inventario, inventarioCambio, vista, type BorradorLibro } from '../inventario.svelte';
  import { esDuena } from '../sesion.svelte';
  import { compartimentos, infoTipo, resolver, textoPosicion, tipoDeEstante } from '../tienda/modelo';
  import { tienda } from '../tienda/tienda.svelte';
  import BuscadorLinea from './BuscadorLinea.svelte';
  import Icono from './Icono.svelte';
  import Tienda3D from './Tienda3D.svelte';

  let { libro, onCerrar, onGuardado }: { libro: Libro | null; onCerrar: () => void; onGuardado?: (l: Libro) => void } = $props();

  const nuevo = $derived(!libro);
  const duena = $derived(esDuena());

  // campos (texto, tal como se escriben). El cajón se crea de nuevo para cada libro: se toma su valor inicial.
  const ini = untrack(() => libro);
  // un libro nuevo recupera lo que se estaba escribiendo si se salió del cajón sin guardar
  const rec = untrack(() => (libro ? null : borrador.datos));
  let restaurado = $state(!!rec);
  let isbn = $state(rec?.isbn ?? ini?.isbn ?? '');
  let titulo = $state(rec?.titulo ?? ini?.titulo ?? '');
  let autor = $state(rec?.autor ?? ini?.autor ?? '');
  let editorial = $state(rec?.editorial ?? ini?.editorial ?? '');
  let anio = $state(rec?.anio ?? (ini?.anio ? String(ini.anio) : ''));
  let sinopsis = $state(rec?.sinopsis ?? ini?.sinopsis ?? '');
  let categoria = $state<string>(rec?.categoria ?? ini?.categoria ?? 'literarias');
  let formato = $state<Formato>(rec?.formato ?? ini?.formato ?? 'normal');
  let precio = $state(rec?.precio ?? (ini ? aSoles(ini.precio) : ''));
  let costo = $state(rec?.costo ?? (ini?.costo != null ? aSoles(ini.costo) : ''));
  let stock = $state(rec?.stock ?? '1');
  let stockMinimo = $state(rec?.stockMinimo ?? String(ini?.stockMinimo ?? 1));
  let etiquetas = $state(rec?.etiquetas ?? ini?.etiquetas.join(', ') ?? '');
  let ubicacion = $state<UbicacionApi | null>(rec ? (rec.ubicacion ? { ...rec.ubicacion } : null) : ini?.ubicacion ? { ...ini.ubicacion } : null);

  // portada: la actual, o una pendiente (de internet o de un archivo) que se guarda junto con el libro
  let portadaPendiente = $state<{ tipo: 'url' | 'archivo'; valor: string } | null>(rec?.portadaPendiente ?? null);
  let quitarPortada = $state(rec?.quitarPortada ?? false);
  const vistaPortada = $derived(portadaPendiente?.valor ?? (quitarPortada ? null : ini?.portada) ?? null);

  // cómo se empieza un libro nuevo: por título/autor en internet (lo habitual), por ISBN, o a mano
  type Modo = 'linea' | 'isbn' | 'manual';
  let modo = $state<Modo>(rec?.modo ?? 'linea');
  let elegido = $state<ResultadoLinea | null>(rec?.elegido ?? null);

  /** Un resultado de la búsqueda en línea: llena el formulario y deja su portada pendiente. */
  function elegirResultado(r: ResultadoLinea) {
    elegido = r;
    titulo = r.titulo;
    autor = r.autor;
    editorial = r.editorial;
    anio = r.anio ? String(r.anio) : '';
    isbn = r.isbn ?? '';
    portadaPendiente = r.portadaUrl ? { tipo: 'url', valor: r.portadaUrl } : null;
    quitarPortada = false;
    // con ISBN, Open Library suele tener también la sinopsis: se completa sin molestar
    if (r.isbn && !sinopsis.trim()) {
      const esteIsbn = r.isbn;
      api
        .consultarIsbn(esteIsbn)
        .then((s) => {
          if (elegido === r && !sinopsis.trim()) sinopsis = s.sinopsis;
        })
        .catch(() => {});
    }
  }

  let enfoque = $state(0); // sube cada vez que se elige con las listas: la cámara vuela al estante
  let buscandoIsbn = $state(false);
  let sugerencia = $state<Sugerencia | null>(null);
  let guardando = $state(false);
  let error = $state('');

  // ajuste de stock (solo al editar)
  let delta = $state('');
  let motivo = $state<'ingreso' | 'ajuste'>('ingreso');
  let nota = $state('');

  const resuelta = $derived(ubicacion ? resolver(tienda.datos, ubicacion) : null);
  const muebles = $derived(tienda.datos.estantes.filter((e) => {
    const t = tipoDeEstante(tienda.datos, e.id);
    return t && infoTipo(t).guardaLibros;
  }));
  const tramosDe = $derived(ubicacion ? compartimentos(tienda.datos, ubicacion.estante) : []);

  // ── borrador: si se sale sin guardar, lo escrito se conserva para la próxima vez ──
  let guardadoOk = false;

  const hayContenido = () =>
    !!(titulo.trim() || autor.trim() || editorial.trim() || isbn.trim() || sinopsis.trim() || precio.trim() || costo.trim() || etiquetas.trim() || anio.trim()) ||
    !!ubicacion ||
    !!portadaPendiente;

  onDestroy(() => {
    if (libro || guardadoOk || !hayContenido()) return;
    const d: BorradorLibro = $state.snapshot({
      modo, elegido, isbn, titulo, autor, editorial, anio, sinopsis, categoria, formato, precio, costo, stock, stockMinimo, etiquetas, ubicacion, portadaPendiente, quitarPortada,
    });
    borrador.datos = d;
  });

  /** «Empezar de cero»: vacía el formulario y olvida el borrador. */
  function empezarDeCero() {
    borrador.datos = null;
    restaurado = false;
    modo = 'linea';
    elegido = null;
    sugerencia = null;
    isbn = titulo = autor = editorial = anio = sinopsis = precio = costo = etiquetas = '';
    categoria = 'literarias';
    formato = 'normal';
    stock = '1';
    stockMinimo = '1';
    ubicacion = null;
    portadaPendiente = null;
    quitarPortada = false;
    error = '';
  }

  async function buscarDatos() {
    error = '';
    buscandoIsbn = true;
    try {
      const s = await api.consultarIsbn(isbn);
      sugerencia = s;
      isbn = s.isbn;
      // completa lo vacío; el título se respeta si ya se escribió
      if (!titulo.trim()) titulo = s.titulo;
      if (!autor.trim()) autor = s.autor;
      if (!editorial.trim()) editorial = s.editorial;
      if (!anio.trim() && s.anio) anio = String(s.anio);
      if (!sinopsis.trim()) sinopsis = s.sinopsis;
      if (s.portadaUrl && !libro?.portada) portadaPendiente = { tipo: 'url', valor: s.portadaUrl };
      avisar(`Datos de ${s.fuente} ✨ Revísalos antes de guardar`);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      buscandoIsbn = false;
    }
  }

  async function elegirArchivo() {
    const origen = await api.elegirImagen();
    if (origen) {
      portadaPendiente = { tipo: 'archivo', valor: origen };
      quitarPortada = false;
    }
  }

  function enteroODefecto(t: string, defecto: number) {
    const n = Number(t);
    return t.trim() === '' ? defecto : Number.isInteger(n) ? n : NaN;
  }

  async function guardar(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    const precioCent = aCentimos(precio);
    const costoCent = aCentimos(costo);
    if (precioCent === null) return void (error = 'Escribe el precio con números (por ejemplo 35.50)');
    if (duena && costoCent === null) return void (error = 'Escribe el costo con números (por ejemplo 20.00)');
    const nStock = enteroODefecto(stock, 0);
    const nMinimo = enteroODefecto(stockMinimo, 1);
    const nAnio = anio.trim() ? Number(anio) : null;
    if (Number.isNaN(nStock) || Number.isNaN(nMinimo)) return void (error = 'El stock debe ser un número entero');
    if (nAnio !== null && !Number.isInteger(nAnio)) return void (error = 'Revisa el año de publicación');
    guardando = true;
    try {
      let l: LibroApi = await api.guardarLibro({
        id: libro?.id ?? null,
        isbn: isbn.trim() || null,
        titulo,
        autor,
        editorial,
        anio: nAnio,
        sinopsis,
        categoria,
        formato,
        precioCent,
        costoCent: duena ? costoCent : null,
        stock: nuevo ? nStock : undefined,
        stockMinimo: nMinimo,
        ubicacion: $state.snapshot(ubicacion),
        etiquetas: etiquetas.split(',').map((x) => x.trim()).filter(Boolean),
        colorTapa: null,
      });
      // la portada se guarda después: si falla, el libro igual queda guardado
      try {
        if (portadaPendiente?.tipo === 'url') l = await api.portadaDesdeUrl(l.id, portadaPendiente.valor);
        else if (portadaPendiente?.tipo === 'archivo') l = await api.portadaDesdeArchivo(l.id, portadaPendiente.valor);
        else if (quitarPortada && libro?.portada) l = await api.quitarPortada(l.id);
      } catch (x) {
        avisar(`El libro se guardó, pero la portada no: ${(x as Error).message}`);
      }
      guardadoOk = true;
      borrador.datos = null;
      inventarioCambio();
      avisar(nuevo ? `«${l.titulo}» agregado 📚` : 'Cambios guardados');
      onGuardado?.(vista(l));
      onCerrar();
      // ¿algún cliente encargó este libro? (alta nueva: también por título parecido)
      if (nuevo) void revisarLlegada({ id: l.id, titulo: l.titulo, stock: l.stock }, true);
    } catch (x) {
      error = (x as Error).message;
    } finally {
      guardando = false;
    }
  }

  async function ajustar() {
    if (!libro) return;
    const d = Number(delta);
    if (!Number.isInteger(d) || d === 0) return void avisar('Escribe cuántos sumar (5) o restar (-2)');
    try {
      const l = await api.ajustarStock(libro.id, d, motivo, nota);
      inventarioCambio();
      avisar(`Stock: ${l.stock}`);
      if (d > 0) void revisarLlegada({ id: l.id, titulo: l.titulo, stock: l.stock }, false);
      onGuardado?.(vista(l));
      delta = '';
      nota = '';
    } catch (x) {
      avisar((x as Error).message);
    }
  }

  async function darDeBaja() {
    if (!libro || !confirm(`¿Dar de baja «${libro.titulo}»? Deja de aparecer en el inventario (el historial se conserva).`)) return;
    try {
      await api.desactivarLibro(libro.id);
      inventarioCambio();
      avisar('Libro dado de baja');
      onCerrar();
    } catch (x) {
      avisar((x as Error).message);
    }
  }

  function tecla(e: KeyboardEvent) {
    if (e.key === 'Escape') onCerrar();
  }
</script>

<svelte:window onkeydown={tecla} />

<div class="velo" transition:fade={{ duration: 150 }} onclick={onCerrar} role="presentation"></div>
<aside class="cajon" transition:fly={{ x: 60, duration: 280 }} aria-label={nuevo ? 'Nuevo libro' : 'Editar libro'}>
  <header>
    <h2>{nuevo ? '📚 Nuevo libro' : '✏️ Editar libro'}</h2>
    {#if libro}<code>{libro.codigo}</code>{/if}
    <button class="cerrar" onclick={onCerrar} aria-label="Cerrar"><Icono nombre="cerrar" tam={18} /></button>
  </header>

  <form onsubmit={guardar}>
    {#if nuevo && restaurado}
      <div class="borrador">
        <span>📝 Recuperé lo que estabas escribiendo{titulo ? `: «${titulo}»` : ''}.</span>
        <button type="button" class="mini" onclick={empezarDeCero}>Empezar de cero</button>
      </div>
    {/if}

    {#if nuevo}
      <div class="modos" role="tablist" aria-label="Cómo empezar">
        <button type="button" role="tab" aria-selected={modo === 'linea'} class:activo={modo === 'linea'} onclick={() => (modo = 'linea')}>🔎 Buscar por título o autor</button>
        <button type="button" role="tab" aria-selected={modo === 'isbn'} class:activo={modo === 'isbn'} onclick={() => (modo = 'isbn')}>ISBN</button>
        <button type="button" role="tab" aria-selected={modo === 'manual'} class:activo={modo === 'manual'} onclick={() => (modo = 'manual')}>A mano</button>
      </div>

      {#if modo === 'linea'}
        {#if elegido}
          <div class="elegido">
            <span>✅ <b>{elegido.titulo}</b>{elegido.autor ? ` · ${elegido.autor}` : ''}<small> · datos de {elegido.fuente}</small></span>
            <button type="button" class="mini" onclick={() => (elegido = null)}>Elegir otro</button>
          </div>
        {/if}
        <div hidden={!!elegido}><BuscadorLinea onElegir={elegirResultado} /></div>
      {:else if modo === 'isbn'}
        <section class="isbn">
          <label class="campo">
            ISBN
            <div class="fila">
              <input bind:value={isbn} placeholder="978…" inputmode="numeric" autocomplete="off" />
              <button type="button" class="btn btn-suave" onclick={buscarDatos} disabled={!isbn.trim() || buscandoIsbn}>
                {buscandoIsbn ? 'Buscando…' : '🔎 Buscar datos'}
              </button>
            </div>
          </label>
          {#if sugerencia}<p class="nota">Datos de <b>{sugerencia.fuente}</b>. Puedes corregir cualquier campo.</p>{/if}
          <p class="nota">¿Tu libro no tiene ISBN? Usa «Buscar por título o autor» o llena los datos a mano.</p>
        </section>
      {/if}
    {/if}

    <div class="dos">
      <div class="portada">
        {#if vistaPortada}
          <img src={vistaPortada} alt="Portada" />
        {:else}
          <div class="sin-portada" style:--c={CATEGORIAS[categoria as keyof typeof CATEGORIAS]?.color ?? '#F1ECEE'}>
            <span>{titulo || 'Portada'}</span>
          </div>
        {/if}
        <div class="botones-portada">
          <button type="button" class="mini" onclick={elegirArchivo}>Elegir imagen…</button>
          {#if vistaPortada}
            <button
              type="button"
              class="mini"
              onclick={() => {
                portadaPendiente = null;
                quitarPortada = true;
              }}>Quitar</button
            >
          {/if}
        </div>
      </div>
      <div class="datos">
        <label class="campo">Título <input bind:value={titulo} required maxlength="300" /></label>
        <label class="campo">Autor <input bind:value={autor} maxlength="200" /></label>
        {#if modo !== 'isbn' || !nuevo}
          <label class="campo">ISBN <small>(opcional: muchos libros no lo tienen; se les da un código interno)</small>
            <input bind:value={isbn} inputmode="numeric" autocomplete="off" placeholder="978…" />
          </label>
        {/if}
        <div class="fila">
          <label class="campo crece">Editorial <input bind:value={editorial} maxlength="120" /></label>
          <label class="campo">Año <input bind:value={anio} inputmode="numeric" maxlength="4" class="corto" /></label>
        </div>
        <div class="fila">
          <label class="campo crece">
            Categoría
            <select bind:value={categoria}>
              {#each inventario.categorias as c (c.clave)}<option value={c.clave}>{c.nombre}</option>{/each}
            </select>
          </label>
          <label class="campo">
            Formato
            <select bind:value={formato}>
              <option value="normal">Normal</option>
              <option value="grueso">Grueso</option>
              <option value="delgado">Delgado</option>
              <option value="infantil">Infantil (ancho)</option>
            </select>
          </label>
        </div>
      </div>
    </div>

    <label class="campo">Sinopsis <textarea bind:value={sinopsis} rows="3" maxlength="4000"></textarea></label>
    <label class="campo">Etiquetas <small>(separadas por comas: «clásico, regalo»)</small> <input bind:value={etiquetas} /></label>

    <div class="fila numeros">
      <label class="campo">Precio (S/) <input bind:value={precio} inputmode="decimal" placeholder="35.00" required /></label>
      {#if duena}
        <label class="campo">Costo (S/) <input bind:value={costo} inputmode="decimal" placeholder="20.00" /></label>
      {/if}
      {#if nuevo}
        <label class="campo">Stock <input bind:value={stock} inputmode="numeric" class="corto" /></label>
      {/if}
      <label class="campo">Avisar con <input bind:value={stockMinimo} inputmode="numeric" class="corto" title="Avisa cuando queden esta cantidad o menos" /></label>
    </div>

    <section class="ubicacion">
      <div class="titulo-ubic">
        <strong>📍 ¿Dónde va?</strong>
        {#if resuelta}
          <span class="elegida" style:--f={resuelta.info.fuerte}>{resuelta.info.titulo} · {textoPosicion(resuelta)}</span>
          <button type="button" class="mini" onclick={() => (ubicacion = null)}>Quitar</button>
        {:else if ubicacion}
          <span class="atenuado">La ubicación guardada ya no existe en la tienda: elige otra.</span>
        {:else}
          <span class="atenuado">Toca el estante en la tienda (o elígelo en la lista).</span>
        {/if}
      </div>
      <Tienda3D ubicacion={resuelta} alto={260} enfocar={enfoque} onElegir={(u) => (ubicacion = { estante: u.estante, tramo: u.tramo, repisa: u.repisa })} />
      <div class="fila manual">
        <select
          aria-label="Estante"
          value={ubicacion?.estante ?? ''}
          onchange={(e) => {
            const id = e.currentTarget.value;
            ubicacion = id ? { estante: id, tramo: 1, repisa: 1 } : null;
            if (id) enfoque++;
          }}
        >
          <option value="">Sin ubicación</option>
          {#each muebles as m (m.id)}<option value={m.id}>{m.titulo}{m.tema ? ` · ${m.tema}` : ''}</option>{/each}
        </select>
        {#if ubicacion && tramosDe.length > 1}
          <select
            aria-label="Tramo"
            value={ubicacion.tramo}
            onchange={(e) => {
              if (!ubicacion) return;
              const n = Number(e.currentTarget.value);
              const repisas = tramosDe[n - 1]?.repisas.length ?? 1;
              ubicacion = { ...ubicacion, tramo: n, repisa: Math.min(ubicacion.repisa, repisas) };
              enfoque++;
            }}
          >
            {#each tramosDe as _, i}<option value={i + 1}>Tramo {i + 1}</option>{/each}
          </select>
        {/if}
        {#if ubicacion && (tramosDe[ubicacion.tramo - 1]?.repisas.length ?? 0) > 1}
          <select
            aria-label="Repisa"
            value={ubicacion.repisa}
            onchange={(e) => {
              if (!ubicacion) return;
              ubicacion = { ...ubicacion, repisa: Number(e.currentTarget.value) };
              enfoque++;
            }}
          >
            {#each tramosDe[ubicacion.tramo - 1].repisas as _, i}<option value={i + 1}>Repisa {i + 1}</option>{/each}
          </select>
        {/if}
      </div>
    </section>

    {#if error}<p class="error" role="alert">{error}</p>{/if}

    <div class="acciones">
      <button type="button" class="btn btn-blanco" onclick={onCerrar}>Cancelar</button>
      <button class="btn btn-primario" disabled={guardando || !titulo.trim()}>{guardando ? 'Guardando…' : nuevo ? 'Agregar libro' : 'Guardar cambios'}</button>
    </div>
  </form>

  {#if libro}
    <section class="stock">
      <strong>📦 Stock: {libro.stock}</strong>
      <div class="fila">
        <input bind:value={delta} inputmode="numeric" placeholder="+5 o -2" aria-label="Cantidad" class="corto" />
        <select bind:value={motivo} aria-label="Motivo">
          <option value="ingreso">Llegaron libros</option>
          <option value="ajuste">Ajuste (conteo, daño…)</option>
        </select>
        <input bind:value={nota} placeholder="Nota (opcional)" aria-label="Nota" class="crece" />
        <button type="button" class="btn btn-suave" onclick={ajustar}>Aplicar</button>
      </div>
      <small class="atenuado">Precio actual {soles(libro.precio)}. Las ventas descontarán el stock solas.</small>
    </section>
    {#if duena}
      <button type="button" class="baja" onclick={darDeBaja}>Dar de baja este libro</button>
    {/if}
  {/if}
</aside>

<style>
  .velo {
    position: fixed;
    inset: 0;
    background: rgba(60, 30, 45, 0.2);
    z-index: 40;
  }
  .cajon {
    position: fixed;
    top: 12px;
    right: 12px;
    bottom: 12px;
    width: min(620px, calc(100vw - 24px));
    z-index: 41;
    overflow-y: auto;
    padding: 20px 22px 24px;
    border-radius: var(--r-panel);
    background: var(--surface);
    box-shadow: var(--sombra);
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  h2 {
    margin: 0;
    font-size: 21px;
    font-weight: 800;
  }
  header code {
    font-size: 12px;
    color: var(--muted);
  }
  .cerrar {
    margin-left: auto;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--surface-2);
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .campo {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-weight: 700;
    font-size: 13px;
  }
  .campo small {
    font-weight: 600;
    color: var(--muted);
  }
  input,
  select,
  textarea {
    font: inherit;
    font-weight: 600;
    font-size: 14px;
    padding: 9px 12px;
    border-radius: 12px;
    border: 2px solid var(--linea);
    background: var(--surface);
    color: var(--text);
    min-width: 0;
  }
  textarea {
    resize: vertical;
  }
  input:focus,
  select:focus,
  textarea:focus {
    outline: none;
    border-color: var(--primary);
  }
  .fila {
    display: flex;
    gap: 8px;
    align-items: flex-end;
    flex-wrap: wrap;
  }
  .fila > input:first-child {
    flex: 1;
  }
  .crece {
    flex: 1;
  }
  .corto {
    width: 90px;
  }
  .modos {
    display: flex;
    gap: 6px;
    padding: 4px;
    border-radius: 999px;
    background: var(--surface-2);
  }
  .modos button {
    flex: 1;
    padding: 8px 10px;
    border-radius: 999px;
    font-weight: 800;
    font-size: 13px;
  }
  .modos button.activo {
    background: var(--surface);
    color: var(--primary-strong);
    box-shadow: var(--sombra-suave);
  }
  .borrador {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 14px;
    background: color-mix(in srgb, var(--yellow) 60%, var(--surface));
    font-size: 13px;
    font-weight: 700;
  }
  .elegido {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 14px;
    background: color-mix(in srgb, #5dbb8a 16%, var(--surface));
    font-size: 14px;
  }
  .elegido small {
    color: var(--muted);
  }
  [hidden] {
    display: none !important;
  }
  .nota {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--muted);
  }
  .dos {
    display: grid;
    grid-template-columns: 130px 1fr;
    gap: 14px;
  }
  .portada {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: center;
  }
  .portada img,
  .sin-portada {
    width: 130px;
    height: 195px;
    border-radius: 8px;
    object-fit: cover;
    box-shadow: var(--sombra-suave);
  }
  .sin-portada {
    display: grid;
    place-items: center;
    padding: 10px;
    text-align: center;
    font-weight: 800;
    font-size: 13px;
    background: var(--c);
    color: color-mix(in srgb, var(--text) 70%, transparent);
  }
  .botones-portada {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .mini {
    font-size: 12px;
    font-weight: 800;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--surface-2);
    color: var(--primary-strong);
  }
  .datos {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .numeros .campo {
    flex: 1;
  }
  .ubicacion,
  .stock {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border-radius: 16px;
    background: var(--surface-2);
  }
  .titulo-ubic {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 14px;
  }
  .elegida {
    font-weight: 800;
    padding: 3px 10px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--f) 25%, var(--surface));
    color: color-mix(in srgb, var(--f) 70%, #3d2a33);
  }
  .manual select {
    flex: 1;
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
  .acciones {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .baja {
    align-self: flex-start;
    color: #c0392b;
    font-weight: 700;
    font-size: 13px;
    text-decoration: underline;
  }
</style>
