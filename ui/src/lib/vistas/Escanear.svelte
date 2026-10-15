<script lang="ts">
  // Escaneo continuo de ISBN con la cámara del celular: escanear → si ya está, sumar stock; si es nuevo, completar los
  // datos y guardarlo → siguiente. Pensado para cargar el inventario recorriendo los estantes: la ubicación elegida se
  // recuerda para el siguiente libro. Los libros sin código de barras se registran con una foto de la portada.
  import { onDestroy, onMount } from 'svelte';
  import { normalizarIsbn } from '../api/demo';
  import { api, type ResultadoLinea, type Sugerencia, type UbicacionApi } from '../api';
  import { soles, type Libro } from '../datos';
  import { app, avisar } from '../estado.svelte';
  import { revisarLlegada } from '../encargos.svelte';
  import { aCentimos, inventario, inventarioCambio, vista } from '../inventario.svelte';
  import { avisarLectura, cancelarLectura, hayCamara, leer, permisoCamara } from '../escaner';
  import { tomarFoto } from '../foto';
  import { alAtras } from '../atras.svelte';
  import { miniatura } from '../portada';
  import { esDuena } from '../sesion.svelte';
  import BuscadorLinea from '../componentes/BuscadorLinea.svelte';
  import SelectorUbicacion from '../componentes/SelectorUbicacion.svelte';

  type Fase = 'apuntando' | 'buscando' | 'existente' | 'nuevo' | 'sinCodigo';
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
  let moviendo = $state(false);

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
  /** Foto tomada con el celular (data-URL): sirve de portada si internet no trae una. */
  let foto = $state<string | null>(null);

  // la ubicación se recuerda entre libros (y entre tandas): lo normal es escanear un estante entero
  const CLAVE_UBICACION = 'escaneo-ubicacion';
  let ubicacion = $state<UbicacionApi | null>(leerUbicacion());
  function leerUbicacion(): UbicacionApi | null {
    try {
      return JSON.parse(localStorage.getItem(CLAVE_UBICACION) ?? 'null');
    } catch {
      return null;
    }
  }
  function fijarUbicacion(u: UbicacionApi | null) {
    ubicacion = u;
    try {
      localStorage.setItem(CLAVE_UBICACION, JSON.stringify(u));
    } catch {
      /* sin almacenamiento */
    }
  }

  onMount(() => void ciclo());
  onDestroy(() => {
    activo = false;
    document.documentElement.classList.remove('camara');
    void cancelarLectura();
  });

  // el fondo se vuelve transparente solo mientras la cámara mira
  $effect(() => {
    document.documentElement.classList.toggle('camara', hayCamara && fase === 'apuntando');
  });

  // «atrás» con un libro a la vista vuelve a apuntar (sin salir del escáner)
  $effect(() => {
    if (fase === 'existente' || fase === 'nuevo' || fase === 'sinCodigo') return alAtras(siguiente);
  });

  /** Escucha la cámara hasta que lee un código; lo procesa y espera a que se pida el siguiente. */
  let vuelta = 0;
  async function ciclo() {
    if (!hayCamara) return;
    const mia = ++vuelta; // un ciclo viejo (cancelado) no debe seguir leyendo junto al nuevo
    const sigue = () => activo && mia === vuelta && fase === 'apuntando';
    if (!(await permisoCamara())) {
      mensaje = 'Sin permiso de la cámara no se puede escanear. Puedes escribir el ISBN a mano.';
      return;
    }
    while (sigue()) {
      try {
        const codigo = await leer('ean13', true);
        if (!sigue()) return;
        if (codigo) await procesar(codigo, true);
        else return;
      } catch (e) {
        if (!sigue()) return;
        mensaje = (e as Error).message;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }

  async function existentePorIsbn(n: string): Promise<Libro | null> {
    const lista = await api.buscarLibros(n, { limite: 5 });
    const l = lista.find((x) => x.isbn === n);
    return l ? vista(l) : null;
  }

  function mostrarExistente(l: Libro) {
    existente = l;
    cuantos = '1';
    moviendo = false;
    fase = 'existente';
  }

  async function procesar(codigo: string, conCamara = false) {
    const n = normalizarIsbn(codigo.replace(/\D/g, ''));
    if (!n) {
      if (conCamara) avisarLectura(false);
      mensaje = `«${codigo}» no es el ISBN de un libro. Apunta al código de barras de la contratapa.`;
      return;
    }
    if (conCamara) avisarLectura();
    mensaje = '';
    fase = 'buscando';
    try {
      const l = await existentePorIsbn(n);
      if (l) return mostrarExistente(l);
      llenarNuevo(n, await api.consultarIsbn(n).catch(() => null));
    } catch (e) {
      mensaje = (e as Error).message;
      fase = 'apuntando';
    }
  }

  function llenarNuevo(n: string, s: Sugerencia | null) {
    isbn = n;
    sug = s;
    titulo = s?.titulo ?? '';
    autor = s?.autor ?? '';
    editorial = s?.editorial ?? '';
    precio = costo = '';
    stock = '1';
    fase = 'nuevo';
  }

  function siguiente() {
    existente = null;
    sug = null;
    foto = null;
    mensaje = '';
    fase = 'apuntando';
    void ciclo();
  }

  // ── libros sin código de barras: foto de la portada → búsqueda por título ──
  async function sinCodigo() {
    fase = 'sinCodigo';
    sug = null;
    await cancelarLectura();
    await fotografiar();
  }

  async function fotografiar() {
    try {
      const f = await tomarFoto();
      if (f) foto = f;
    } catch (e) {
      avisar((e as Error).message);
    }
  }

  async function elegirEnLinea(r: ResultadoLinea) {
    const n = r.isbn ? normalizarIsbn(r.isbn) : null;
    if (n) {
      const l = await existentePorIsbn(n).catch(() => null);
      if (l) return mostrarExistente(l);
    }
    llenarNuevo(n ?? '', { isbn: n ?? '', titulo: r.titulo, autor: r.autor, editorial: r.editorial, anio: r.anio, sinopsis: '', portadaUrl: r.portadaUrl, fuente: r.fuente });
  }

  /** La portada que se verá: la de internet o, si no hay, la foto. */
  const portadaNueva = $derived(sug?.portadaUrl ?? foto);

  async function sumar(n: number) {
    if (!existente || !Number.isInteger(n) || n < 1) return void avisar('Escribe cuántos ejemplares llegaron (1 o más)');
    try {
      const l = await api.ajustarStock(existente.id, n, 'ingreso', 'Escaneado con el celular');
      existente = vista(l);
      contar(l.id, n);
      avisar(`+${n} · ahora ${l.stock} ✓`);
      void revisarLlegada({ id: l.id, titulo: l.titulo, stock: l.stock }, false);
    } catch (e) {
      avisar((e as Error).message);
    }
  }

  function contar(id: number, n: number) {
    titulos.add(id);
    titulos = new Set(titulos);
    ejemplares += n;
    inventarioCambio();
  }

  /** Cambia la ubicación de un libro que ya estaba (se guarda la ficha completa; el costo lo cuida el PC). */
  async function mover(u: UbicacionApi | null) {
    const l = existente;
    if (!l) return;
    try {
      const g = await api.guardarLibro({
        id: l.id,
        isbn: l.isbn,
        titulo: l.titulo,
        autor: l.autor,
        editorial: l.editorial,
        anio: l.anio,
        sinopsis: l.sinopsis,
        categoria: l.categoria,
        formato: l.formato,
        precioCent: l.precio,
        costoCent: null,
        stockMinimo: l.stockMinimo,
        ubicacion: u,
        etiquetas: l.etiquetas,
        colorTapa: l.tapa,
      });
      existente = vista(g);
      if (u) fijarUbicacion(u);
      inventarioCambio();
      avisar(u ? 'Ubicación cambiada 📍' : 'Ubicación quitada');
    } catch (e) {
      avisar((e as Error).message);
    }
  }

  async function fotoComoPortada() {
    const l = existente;
    if (!l) return;
    const f = await tomarFoto().catch(() => null);
    if (!f) return;
    try {
      existente = vista(await api.portadaDesdeArchivo(l.id, f));
      inventarioCambio();
      avisar('Portada cambiada 📸');
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
      let l = await api.guardarLibro({
        isbn: isbn || null,
        titulo,
        autor,
        editorial,
        anio: sug?.anio ?? null,
        sinopsis: sug?.sinopsis ?? '',
        categoria,
        precioCent: p,
        costoCent: esDuena() ? c : null,
        stock: n,
        ubicacion: $state.snapshot(ubicacion),
      });
      // la portada va aparte: si falla, el libro igual queda guardado
      try {
        if (sug?.portadaUrl) l = await api.portadaDesdeUrl(l.id, sug.portadaUrl);
        else if (foto) l = await api.portadaDesdeArchivo(l.id, foto);
      } catch (x) {
        avisar(`El libro se guardó, pero la portada no: ${(x as Error).message}`);
      }
      contar(l.id, n);
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

<div class="escaner" class:con-camara={hayCamara && fase === 'apuntando'} data-vacio>
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
      <div class="pie">
        <button class="btn btn-blanco" onclick={sinCodigo} disabled={fase === 'buscando'} data-testid="sin-codigo">📸 Sin código de barras</button>
        <span class="lugar" data-testid="lugar-escaneo">📍 {ubicacion ? 'Ubicación elegida para los nuevos' : 'Nuevos sin ubicación'}</span>
      </div>
    {:else if fase === 'existente' && existente}
      <div class="libro" data-testid="escaneo-existente">
        <img src={existente.portada ?? miniatura(existente)} alt="" />
        <div class="datos">
          <span class="etiqueta ya">Ya lo tienes</span>
          <strong>{existente.titulo}</strong>
          <small>{[existente.autor, soles(existente.precio)].filter(Boolean).join(' · ')}</small>
          <span class="stock" class:cero={existente.stock === 0}>{existente.stock === 0 ? 'Agotado' : `Stock: ${existente.stock}`}</span>
        </div>
      </div>
      <div class="sumar">
        <button class="btn btn-primario" onclick={() => sumar(1)}>+1</button>
        <button class="btn btn-suave" onclick={() => sumar(5)}>+5</button>
        <input bind:value={cuantos} inputmode="numeric" aria-label="Cantidad a sumar" />
        <button class="btn btn-suave" onclick={() => sumar(Number(cuantos))}>Sumar</button>
      </div>
      {#if moviendo}
        <SelectorUbicacion valor={existente.ubicacion} onCambio={mover} />
      {/if}
      <div class="extras">
        <button class="btn btn-blanco" onclick={() => (moviendo = !moviendo)} data-testid="mover-libro">📍 {moviendo ? 'Listo' : existente.ubicacion ? 'Cambiar ubicación' : 'Ponerle ubicación'}</button>
        <button class="btn btn-blanco" onclick={fotoComoPortada}>📸 Foto como portada</button>
      </div>
      <div class="acciones"><button class="btn btn-primario grande" onclick={siguiente}>Siguiente libro 📷</button></div>
    {:else if fase === 'sinCodigo'}
      <div class="sin-codigo" data-testid="escaneo-sin-codigo">
        <div class="cab">
          {#if foto}<img src={foto} alt="Foto de la portada" data-testid="foto-portada" />{:else}<span class="hueco">📸</span>{/if}
          <div class="datos">
            <span class="etiqueta nuevo">Sin código de barras</span>
            <small class="atenuado">Escribe el título que ves en la portada y búscalo en internet. La foto queda como portada si internet no trae una.</small>
          </div>
        </div>
        <div class="extras">
          <button class="btn btn-blanco" onclick={fotografiar}>{foto ? '📸 Otra foto' : '📸 Tomar la foto'}</button>
          <button class="btn btn-blanco" disabled title="Llega con el asistente (Hito 8)">✨ Leer la portada (IA)</button>
        </div>
        <small class="atenuado nota">«Leer la portada» llega con el asistente (Hito 8).</small>
        <BuscadorLinea onElegir={elegirEnLinea} />
        <div class="acciones">
          <button type="button" class="btn btn-blanco" onclick={siguiente}>Volver</button>
          <button type="button" class="btn btn-suave" onclick={() => llenarNuevo('', null)}>Llenar a mano</button>
        </div>
      </div>
    {:else if fase === 'nuevo'}
      <form class="nuevo" onsubmit={guardar} data-testid="escaneo-nuevo">
        <div class="cab">
          {#if portadaNueva}<img src={portadaNueva} alt="" />{/if}
          <div>
            <span class="etiqueta nuevo">Libro nuevo · {isbn || 'sin ISBN'}</span>
            {#if !sug}<small class="atenuado">{isbn ? 'No encontré datos en internet: escríbelos a mano.' : 'Escribe los datos a mano.'}</small>{/if}
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
        <div class="campo">
          <span>Ubicación <small class="atenuado">(se recuerda para el siguiente)</small></span>
          <SelectorUbicacion valor={ubicacion} onCambio={fijarUbicacion} mapa={false} />
        </div>
        {#if !sug?.portadaUrl}
          <button type="button" class="btn btn-blanco" onclick={fotografiar}>{foto ? '📸 Otra foto de portada' : '📸 Foto como portada'}</button>
        {/if}
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
  .pie,
  .extras {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
  }
  .pie {
    justify-content: space-between;
  }
  .lugar {
    font-size: 12px;
    font-weight: 700;
    color: var(--muted);
  }
  .extras .btn {
    flex: 1;
  }
  .extras .btn:disabled {
    opacity: 0.45;
    filter: grayscale(0.6);
  }
  .sin-codigo {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .sin-codigo :global(form) {
    grid-template-columns: 1fr;
  }
  .hueco {
    width: 54px;
    height: 80px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    background: var(--surface-2);
    font-size: 22px;
    flex-shrink: 0;
  }
  .nota {
    margin-top: -4px;
    font-size: 11px;
  }
  .campo {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    font-weight: 800;
  }
  .grande {
    height: 50px;
    font-size: 16px;
    flex: 1;
  }
</style>
