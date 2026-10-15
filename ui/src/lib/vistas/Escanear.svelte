<script lang="ts">
  // Guardar libros desde el celular, de tres formas:
  //  · ISBN: escaneo continuo del código de barras → si ya está, sumar stock; si es nuevo, completar y guardar.
  //  · Título: foto con la cámara de la app → se marca el título con el dedo → se lee (en el teléfono) → búsqueda en
  //    internet → completar y guardar.
  //  · A mano: se escribe el título → búsqueda en internet (o sin buscar) → completar y guardar.
  // La portada sale de internet. La ubicación elegida se recuerda para el siguiente: lo normal es recorrer un estante.
  import { onDestroy, onMount } from 'svelte';
  import { normalizarIsbn } from '../api/demo';
  import { api, type ResultadoLinea, type Sugerencia, type UbicacionApi } from '../api';
  import { soles, type Libro } from '../datos';
  import { app, avisar } from '../estado.svelte';
  import { revisarLlegada } from '../encargos.svelte';
  import { aCentimos, inventario, inventarioCambio, vista } from '../inventario.svelte';
  import { avisarLectura, cancelarLectura, hayCamara, hayLectorTexto, leer, permisoCamara } from '../escaner';
  import { alAtras } from '../atras.svelte';
  import { miniatura } from '../portada';
  import { registro, type ModoRegistro } from '../registro.svelte';
  import { esDuena } from '../sesion.svelte';
  import BuscadorLinea from '../componentes/BuscadorLinea.svelte';
  import LectorTitulo from '../componentes/LectorTitulo.svelte';
  import NuevaCategoria from '../componentes/NuevaCategoria.svelte';
  import SelectorUbicacion from '../componentes/SelectorUbicacion.svelte';

  type Fase = 'apuntando' | 'buscando' | 'titulo' | 'mano' | 'existente' | 'nuevo';
  const MODOS: { id: ModoRegistro; nombre: string; emoji: string }[] = [
    { id: 'isbn', nombre: 'ISBN', emoji: '📷' },
    { id: 'titulo', nombre: 'Título', emoji: '🔤' },
    { id: 'mano', nombre: 'A mano', emoji: '✍️' },
  ];
  const modos = MODOS.filter((m) => m.id !== 'titulo' || hayLectorTexto());

  let fase = $state<Fase>('apuntando');
  let mensaje = $state('');
  let activo = true;
  let manual = $state('');

  // lo guardado en esta tanda
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

  // lectura del título con la cámara de la app
  let lector = $state(false);
  let leido = $state(false);
  /** Lo que se busca en internet; cambiarlo vuelve a crear el buscador con esos datos. */
  let consulta = $state({ titulo: '', autor: '', vez: 0 });

  // la ubicación se recuerda entre libros (y entre tandas)
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

  onMount(() => empezar());
  onDestroy(() => {
    activo = false;
    document.documentElement.classList.remove('camara');
    void cancelarLectura();
  });

  // el fondo se vuelve transparente solo mientras la cámara busca el código de barras
  $effect(() => {
    document.documentElement.classList.toggle('camara', hayCamara && fase === 'apuntando');
  });

  // «atrás» con un libro a la vista vuelve al inicio del modo (sin salir)
  $effect(() => {
    if (fase === 'existente' || fase === 'nuevo') return alAtras(siguiente);
  });

  /** Arranca el modo elegido desde cero. */
  function empezar() {
    existente = null;
    sug = null;
    mensaje = '';
    leido = false;
    if (registro.modo === 'isbn') {
      fase = 'apuntando';
      void ciclo();
    } else if (registro.modo === 'titulo') {
      fase = 'titulo';
      consulta = { titulo: '', autor: '', vez: consulta.vez + 1 };
      void abrirLector();
    } else {
      fase = 'mano';
      consulta = { titulo: '', autor: '', vez: consulta.vez + 1 };
    }
  }

  async function cambiarModo(m: ModoRegistro) {
    if (m === registro.modo && (fase === 'apuntando' || fase === registro.modo)) return;
    registro.modo = m;
    await cancelarLectura();
    empezar();
  }

  const siguiente = empezar;

  // ── ISBN ──
  let vuelta = 0;
  /** Escucha la cámara hasta que lee un código; lo procesa y espera a que se pida el siguiente. */
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

  const plano = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  /** Sin ISBN: ¿ya hay un libro con el mismo título (y autor, si se sabe)? */
  async function existentePorTitulo(t: string, a: string): Promise<Libro | null> {
    if (!t.trim()) return null;
    const lista = await api.buscarLibros(t, { limite: 10 });
    const l = lista.find((x) => plano(x.titulo) === plano(t) && (!a || !x.autor || plano(x.autor) === plano(a)));
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

  function llenarNuevo(n: string, s: Sugerencia | null, t = '', a = '') {
    isbn = n;
    sug = s;
    titulo = s?.titulo ?? t;
    autor = s?.autor ?? a;
    editorial = s?.editorial ?? '';
    precio = costo = '';
    stock = '1';
    fase = 'nuevo';
  }

  // ── título leído con la cámara de la app ──
  async function abrirLector() {
    await cancelarLectura(); // la cámara no puede estar con el escáner de ISBN y con el lector a la vez
    lector = true;
  }

  function alLeer(r: { titulo: string; autor: string }) {
    lector = false;
    leido = true;
    consulta = { titulo: r.titulo, autor: r.autor, vez: consulta.vez + 1 };
  }

  async function elegirEnLinea(r: ResultadoLinea) {
    const n = r.isbn ? normalizarIsbn(r.isbn) : null;
    const ya = await (n ? existentePorIsbn(n) : existentePorTitulo(r.titulo, r.autor)).catch(() => null);
    if (ya) return mostrarExistente(ya);
    llenarNuevo(n ?? '', { isbn: n ?? '', titulo: r.titulo, autor: r.autor, editorial: r.editorial, anio: r.anio, sinopsis: '', portadaUrl: r.portadaUrl, fuente: r.fuente });
  }

  // ── libro que ya estaba ──
  async function sumar(n: number) {
    if (!existente || !Number.isInteger(n) || n < 1) return void avisar('Escribe cuántos ejemplares llegaron (1 o más)');
    try {
      const l = await api.ajustarStock(existente.id, n, 'ingreso', 'Registrado con el celular');
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

  // ── libro nuevo ──
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
      if (sug?.portadaUrl) {
        try {
          l = await api.portadaDesdeUrl(l.id, sug.portadaUrl);
        } catch (x) {
          avisar(`El libro se guardó, pero la portada no: ${(x as Error).message}`);
        }
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
    app.vista = 'nuevo';
  }
</script>

{#if lector}
  <LectorTitulo onListo={alLeer} onCerrar={() => (lector = false)} />
{/if}

<div class="escaner" class:con-camara={hayCamara && fase === 'apuntando'} data-vacio>
  <header>
    <strong>Guardar libros</strong>
    <span class="cuenta" data-testid="cuenta-escaneo">{titulos.size} {titulos.size === 1 ? 'título' : 'títulos'} · {ejemplares} {ejemplares === 1 ? 'ejemplar' : 'ejemplares'}</span>
    <button class="cerrar" onclick={cerrar} aria-label="Cerrar el escáner">✕</button>
  </header>

  {#if fase !== 'existente' && fase !== 'nuevo'}
    <div class="modos" role="tablist" aria-label="Cómo registrar">
      {#each modos as m (m.id)}
        <button role="tab" aria-selected={registro.modo === m.id} class:activo={registro.modo === m.id} onclick={() => cambiarModo(m.id)}>{m.emoji} {m.nombre}</button>
      {/each}
    </div>
  {/if}

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
      <span class="lugar" data-testid="lugar-escaneo">📍 {ubicacion ? 'Ubicación elegida para los nuevos' : 'Nuevos sin ubicación'}</span>
    {:else if fase === 'titulo' || fase === 'mano'}
      <div class="por-titulo" data-testid="registro-{fase}">
        {#if fase === 'titulo'}
          <button class="btn btn-primario grande" onclick={abrirLector} data-testid="leer-titulo">
            {leido ? '🔤 Leer otra portada' : '🔤 Leer el título de la portada'}
          </button>
          {#if !leido}
            <p class="atenuado ayuda">Toma una foto de la portada y marca con el dedo el título: solo eso se lee, en el mismo teléfono, y se busca en internet con su portada.</p>
          {/if}
        {:else}
          <p class="guia">Escribe el título (y el autor si lo sabes) y búscalo en internet: trae los datos y la portada.</p>
        {/if}
        {#if fase === 'mano' || leido}
          {#key consulta.vez}
            <BuscadorLinea onElegir={elegirEnLinea} tituloInicial={consulta.titulo} autorInicial={consulta.autor} buscarAlAbrir={!!consulta.titulo} columna />
          {/key}
        {/if}
        <button type="button" class="enlace" onclick={() => llenarNuevo('', null, consulta.titulo, consulta.autor)} data-testid="llenar-a-mano">No lo encuentro: llenar los datos a mano</button>
        <span class="lugar">📍 {ubicacion ? 'Ubicación elegida para los nuevos' : 'Nuevos sin ubicación'}</span>
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
      <button class="btn btn-blanco" onclick={() => (moviendo = !moviendo)} data-testid="mover-libro">📍 {moviendo ? 'Listo' : existente.ubicacion ? 'Cambiar ubicación' : 'Ponerle ubicación'}</button>
      <div class="acciones"><button class="btn btn-primario grande" onclick={siguiente}>Siguiente libro</button></div>
    {:else if fase === 'nuevo'}
      <form class="nuevo" onsubmit={guardar} data-testid="escaneo-nuevo">
        <div class="cab">
          {#if sug?.portadaUrl}<img src={sug.portadaUrl} alt="" />{/if}
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
        <div class="campo">
          <span class="con-accion">Categoría <NuevaCategoria onCreada={(k) => (categoria = k)} /></span>
          <select bind:value={categoria} aria-label="Categoría">{#each inventario.categorias as c (c.clave)}<option value={c.clave}>{c.nombre}</option>{/each}</select>
        </div>
        <div class="campo">
          <span>Ubicación <small class="atenuado">(se recuerda para el siguiente)</small></span>
          <SelectorUbicacion valor={ubicacion} onCambio={fijarUbicacion} mapa={false} />
        </div>
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
  .lugar {
    font-size: 12px;
    font-weight: 700;
    color: var(--muted);
  }
  .con-accion {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .campo {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    font-weight: 800;
  }
  .modos {
    display: flex;
    gap: 6px;
    padding: 8px 14px;
    background: var(--surface);
  }
  .modos button {
    flex: 1;
    height: 40px;
    border-radius: 12px;
    background: var(--surface-2);
    font-weight: 800;
    font-size: 14px;
    color: var(--muted);
  }
  .modos button.activo {
    background: var(--primary);
    color: var(--on-primary);
  }
  .por-titulo {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .ayuda {
    margin: 0;
    font-size: 13px;
    text-align: center;
  }
  .enlace {
    align-self: center;
    font-weight: 700;
    font-size: 13px;
    color: var(--primary-strong);
    text-decoration: underline;
  }
  .grande {
    height: 50px;
    font-size: 16px;
    flex: 1;
  }
</style>
