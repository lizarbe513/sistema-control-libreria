<script lang="ts">
  // Reportes (solo la Dueña): ventas por período, caja, más vendidos, categorías, tipos de cliente y libros sin movimiento.
  import { api, type Reporte, type TipoCsv } from '../api';
  import Esqueleto from '../componentes/Esqueleto.svelte';
  import GraficoBarras from '../componentes/GraficoBarras.svelte';
  import IconoMetodo from '../componentes/IconoMetodo.svelte';
  import { soles } from '../datos';
  import { avisar } from '../estado.svelte';
  import { aDia, consulta, diasDe, etiquetaLarga, PRESETS, type Preset } from '../reportes/rango';
  import { esDuena } from '../sesion.svelte';
  import { METODOS } from '../ventas/carrito.svelte';
  import { ventasCambio } from '../ventas/carrito.svelte';

  let { movil = false }: { movil?: boolean } = $props();

  let preset = $state<Preset>('mes');
  let [desde, hasta] = $state(diasDe('mes'));
  let diasSinMov = $state(90);
  let reporte = $state<Reporte | null>(null);
  let cargando = $state(true);
  let error = $state('');

  function elegir(p: Preset) {
    preset = p;
    if (p !== 'personalizado') [desde, hasta] = diasDe(p);
  }

  const c = $derived(consulta(desde, hasta, diasSinMov));
  const valido = $derived(!!desde && !!hasta && desde <= hasta);

  $effect(() => {
    if (!esDuena() || !valido) return;
    const q = c;
    void ventasCambio.version;
    let vigente = true;
    cargando = true;
    api
      .reporte(q)
      .then((r) => {
        if (vigente) [reporte, error] = [r, ''];
      })
      .catch((e: Error) => vigente && (error = e.message))
      .finally(() => vigente && (cargando = false));
    return () => (vigente = false);
  });

  const t = $derived(reporte?.totales);
  const maxCat = $derived(Math.max(1, ...(reporte?.categorias ?? []).map((x) => x.totalCent)));
  const totalCaja = $derived((reporte?.caja ?? []).reduce((s, x) => s + x.montoCent, 0));
  const margenPct = $derived(t && t.totalCent > 0 ? Math.round((t.gananciaCent / t.totalCent) * 100) : null);
  const titulo = $derived(desde === hasta ? etiquetaLarga(desde) : `${etiquetaLarga(desde)} — ${etiquetaLarga(hasta)}`);

  let exportando = $state(false);
  async function exportar(tipo: TipoCsv) {
    exportando = true;
    try {
      const nombre = `reporte-${tipo.replaceAll('_', '-')}-${desde}_${hasta}.csv`;
      const ruta = await api.exportarReporte(tipo, c, nombre);
      if (ruta) avisar(`Guardado: ${ruta} 📄`);
    } catch (e) {
      avisar((e as Error).message);
    } finally {
      exportando = false;
    }
  }

  const EXPORTES: { tipo: TipoCsv; nombre: string; ayuda: string }[] = [
    { tipo: 'ventas', nombre: 'Ventas (detalle)', ayuda: 'Una fila por libro vendido' },
    { tipo: 'mas_vendidos', nombre: 'Más vendidos', ayuda: 'Ranking del período' },
    { tipo: 'caja', nombre: 'Caja por método', ayuda: 'Efectivo, Yape, tarjeta…' },
    { tipo: 'sin_movimiento', nombre: 'Libros sin movimiento', ayuda: 'Para decidir liquidaciones' },
  ];
</script>

<div class="reportes" class:movil data-vacio>
  <header class="cabecera" data-vacio>
    <div>
      <h1>Reportes</h1>
      <span class="atenuado">{esDuena() ? titulo : ''}</span>
    </div>
    {#if esDuena()}
      <details class="exportar">
        <summary class="btn btn-suave">⬇ Exportar a Excel (CSV)</summary>
        <ul class="vidrio">
          {#each EXPORTES as e (e.tipo)}
            <li><button disabled={exportando || !valido} onclick={() => exportar(e.tipo)}><strong>{e.nombre}</strong><small>{e.ayuda}</small></button></li>
          {/each}
        </ul>
      </details>
    {/if}
  </header>

  {#if !esDuena()}
    <div class="vacio vidrio"><span>🔒</span><p>Los reportes los ve solo la Dueña.</p></div>
  {:else}
    <div class="periodo" role="radiogroup" aria-label="Período">
      {#each PRESETS as p (p.id)}
        <button role="radio" aria-checked={preset === p.id} class:activo={preset === p.id} onclick={() => elegir(p.id)}>{p.nombre}</button>
      {/each}
      {#if preset === 'personalizado'}
        <span class="fechas">
          <input type="date" bind:value={desde} max={hasta || aDia(new Date())} aria-label="Desde" />
          <span>a</span>
          <input type="date" bind:value={hasta} min={desde} aria-label="Hasta" />
        </span>
      {/if}
    </div>

    {#if error}
      <p class="error" role="alert">{error}</p>
    {:else if reporte && t}
      <section class="kpis" aria-busy={cargando}>
        <div class="kpi grande"><span class="et">Vendido</span><strong data-testid="rep-total">{soles(t.totalCent)}</strong><small>{t.ventas} {t.ventas === 1 ? 'venta' : 'ventas'} · {t.unidades} libros</small></div>
        <div class="kpi"><span class="et">Ganancia estimada</span><strong data-testid="rep-ganancia">{soles(t.gananciaCent)}</strong><small>{margenPct !== null ? `${margenPct} % de lo vendido` : '—'}</small></div>
        <div class="kpi"><span class="et">Ticket promedio</span><strong>{soles(t.ticketPromedioCent)}</strong><small>por venta</small></div>
        <div class="kpi"><span class="et">Descuentos dados</span><strong>{soles(t.descuentosCent + t.redondeoCent)}</strong><small>{t.redondeoCent ? `incluye ${soles(t.redondeoCent)} de redondeo` : 'a clientes'}</small></div>
        {#if t.anuladas}<div class="kpi anul"><span class="et">Anuladas</span><strong>{t.anuladas}</strong><small>no cuentan</small></div>{/if}
      </section>

      <section class="tarjeta panel">
        <h2>Ventas {c.agrupar === 'dia' ? 'por día' : 'por mes'}</h2>
        {#if reporte.serie.length}<GraficoBarras puntos={reporte.serie} />{/if}
      </section>

      <div class="dos">
        <section class="tarjeta panel" data-testid="rep-caja">
          <h2>Caja: lo cobrado</h2>
          {#if reporte.caja.length}
            <ul class="barras">
              {#each reporte.caja as m (m.metodo)}
                <li>
                  <span class="nom"><IconoMetodo metodo={m.metodo} tam={20} /> {METODOS[m.metodo].nombre}</span>
                  <span class="pista"><i style:width="{Math.max(3, (m.montoCent / Math.max(1, totalCaja)) * 100)}%"></i></span>
                  <strong>{soles(m.montoCent)}</strong>
                </li>
              {/each}
            </ul>
            <p class="nota">Total cobrado {soles(totalCaja)}{#if t.adelantosCent} · incluye {soles(t.adelantosCent)} de adelantos de encargos{/if}.</p>
          {:else}
            <p class="vacio-mini">Sin cobros en este período.</p>
          {/if}
        </section>

        <section class="tarjeta panel">
          <h2>Por tipo de cliente</h2>
          {#if reporte.porTipo.length}
            <ul class="tabla">
              {#each reporte.porTipo as g (g.nombre)}<li><span>{g.nombre}</span><small>{g.ventas} {g.ventas === 1 ? 'venta' : 'ventas'}</small><strong>{soles(g.totalCent)}</strong></li>{/each}
            </ul>
          {:else}
            <p class="vacio-mini">Sin ventas en este período.</p>
          {/if}
          {#if reporte.porVendedora.length > 1}
            <h3>Por quien vendió</h3>
            <ul class="tabla">
              {#each reporte.porVendedora as g (g.nombre)}<li><span>{g.nombre}</span><small>{g.ventas} {g.ventas === 1 ? 'venta' : 'ventas'}</small><strong>{soles(g.totalCent)}</strong></li>{/each}
            </ul>
          {/if}
        </section>
      </div>

      <div class="dos">
        <section class="tarjeta panel" data-testid="rep-top">
          <h2>Libros más vendidos</h2>
          {#if reporte.masVendidos.length}
            <ol class="top">
              {#each reporte.masVendidos as l, i (l.libroId)}
                <li><span class="pos">{i + 1}</span><span class="tit">{l.titulo}</span><small>{l.unidades} {l.unidades === 1 ? 'ej.' : 'ej.'}</small><strong>{soles(l.totalCent)}</strong></li>
              {/each}
            </ol>
          {:else}
            <p class="vacio-mini">Todavía no hay ventas en este período.</p>
          {/if}
        </section>

        <section class="tarjeta panel">
          <h2>Por categoría</h2>
          {#if reporte.categorias.length}
            <ul class="barras">
              {#each reporte.categorias as k (k.clave)}
                <li>
                  <span class="nom">{k.nombre}</span>
                  <span class="pista"><i style:width="{Math.max(3, (k.totalCent / maxCat) * 100)}%" style:background={k.color}></i></span>
                  <strong>{soles(k.totalCent)}</strong>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="vacio-mini">Sin ventas en este período.</p>
          {/if}
        </section>
      </div>

      <section class="tarjeta panel" data-testid="rep-sin-mov">
        <div class="cab-sm">
          <h2>Libros sin movimiento</h2>
          <label class="dias">
            sin venta ni ingreso hace
            <select bind:value={diasSinMov} aria-label="Días sin movimiento">
              {#each [30, 60, 90, 180, 365] as d}<option value={d}>{d} días</option>{/each}
            </select>
          </label>
        </div>
        {#if reporte.sinMovimientoTotal}
          <p class="nota"><strong>{reporte.sinMovimientoTotal}</strong> {reporte.sinMovimientoTotal === 1 ? 'libro' : 'libros'} · <strong>{soles(reporte.inmovilizadoCent)}</strong> de plata detenida (stock × costo). Candidatos a oferta o liquidación.</p>
          <div class="scroll">
            <table>
              <thead><tr><th>Libro</th><th class="n">Stock</th><th class="n">Costo</th><th class="n">Precio</th><th class="n">Días</th></tr></thead>
              <tbody>
                {#each reporte.sinMovimiento as l (l.libroId)}
                  <tr><td><strong>{l.titulo}</strong><small>{l.autor}</small></td><td class="n">{l.stock}</td><td class="n">{soles(l.costoCent)}</td><td class="n">{soles(l.precioCent)}</td><td class="n dias-n">{l.dias}</td></tr>
                {/each}
              </tbody>
            </table>
          </div>
          {#if reporte.sinMovimientoTotal > reporte.sinMovimiento.length}<p class="nota">Se muestran los {reporte.sinMovimiento.length} más antiguos; el CSV trae todos.</p>{/if}
        {:else}
          <p class="vacio-mini">🌸 Todo lo que hay en la tienda se ha movido en los últimos {diasSinMov} días.</p>
        {/if}
      </section>
    {:else if cargando}
      <Esqueleto n={3} alto={96} />
    {/if}
  {/if}
</div>

<style>
  .reportes {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 6px 6px 24px;
  }
  .cabecera {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  h1 {
    margin: 0;
    font-size: 30px;
    font-weight: 800;
  }
  h2 {
    margin: 0 0 10px;
    font-size: 17px;
  }
  h3 {
    margin: 14px 0 6px;
    font-size: 14px;
  }
  .exportar {
    position: relative;
  }
  .exportar summary {
    list-style: none;
    cursor: pointer;
  }
  .exportar summary::-webkit-details-marker {
    display: none;
  }
  .exportar ul {
    position: absolute;
    right: 0;
    top: 50px;
    z-index: 20;
    list-style: none;
    margin: 0;
    padding: 6px;
    min-width: 250px;
    background: var(--surface);
  }
  .exportar li button {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 8px 12px;
    border-radius: 10px;
    text-align: left;
  }
  .exportar li button:hover:not(:disabled) {
    background: var(--primary-soft);
  }
  .exportar small {
    color: var(--muted);
    font-weight: 600;
  }
  .periodo {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
  }
  .periodo > button {
    padding: 8px 14px;
    border-radius: 999px;
    font-weight: 700;
    font-size: 13px;
    background: var(--surface);
    box-shadow: var(--sombra-suave);
  }
  .periodo > button.activo {
    background: var(--primary);
    color: var(--on-primary);
  }
  .fechas {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    font-weight: 700;
  }
  .fechas input,
  .dias select {
    height: 36px;
    border-radius: 12px;
    border: 1.5px solid var(--linea);
    background: var(--surface);
    padding: 0 10px;
    font: inherit;
    color: var(--text);
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 10px;
  }
  .kpis[aria-busy='true'] {
    opacity: 0.6;
  }
  .kpi {
    display: flex;
    flex-direction: column;
    padding: 12px 16px;
    border-radius: 18px;
    background: var(--surface);
    box-shadow: var(--sombra-suave);
  }
  .kpi.grande {
    background: var(--primary-soft);
    grid-column: span 2;
  }
  .kpi.anul {
    background: color-mix(in srgb, #e0405f 14%, var(--surface));
  }
  .kpi .et {
    font-size: 12px;
    font-weight: 800;
    color: var(--muted);
  }
  .kpi strong {
    font-size: 26px;
    font-weight: 800;
    color: var(--primary-strong);
    line-height: 1.15;
  }
  .kpi small {
    color: var(--muted);
    font-weight: 600;
  }
  .panel {
    padding: 14px 18px 16px;
    min-width: 0;
  }
  .dos {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }
  @media (max-width: 1000px) {
    .dos {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .barras,
  .tabla,
  .top {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .barras li {
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    font-size: 14px;
  }
  .nom {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 700;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pista {
    height: 12px;
    border-radius: 6px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .pista i {
    display: block;
    height: 100%;
    border-radius: 6px;
    background: var(--primary);
  }
  .tabla li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 12px;
    align-items: center;
    padding: 6px 10px;
    border-radius: 10px;
    background: var(--surface-2);
    font-weight: 700;
  }
  .tabla small,
  .top small {
    color: var(--muted);
    font-weight: 600;
  }
  .top li {
    display: grid;
    grid-template-columns: 26px minmax(0, 1fr) auto auto;
    gap: 10px;
    align-items: center;
    font-size: 14px;
  }
  .pos {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--primary-soft);
    color: var(--primary-strong);
    font-weight: 800;
    font-size: 12px;
  }
  .tit {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 700;
  }
  .nota {
    margin: 8px 0 0;
    font-size: 13px;
    color: var(--muted);
    font-weight: 600;
  }
  .vacio-mini {
    margin: 0;
    color: var(--muted);
    font-weight: 600;
  }
  .cab-sm {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .cab-sm h2 {
    margin: 0;
  }
  .dias {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    font-size: 13px;
    font-weight: 700;
    color: var(--muted);
  }
  .scroll {
    overflow: auto;
    max-height: 340px;
    margin-top: 8px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }
  th {
    text-align: left;
    font-size: 12px;
    color: var(--muted);
    padding: 4px 8px;
    position: sticky;
    top: 0;
    background: var(--surface);
  }
  td {
    padding: 6px 8px;
    border-top: 1px solid var(--linea);
  }
  td small {
    display: block;
    color: var(--muted);
    font-weight: 600;
  }
  .n {
    text-align: right;
    white-space: nowrap;
  }
  .dias-n {
    font-weight: 800;
    color: #b0243f;
  }
  .vacio {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 40px;
    text-align: center;
  }
  .vacio span {
    font-size: 44px;
  }
  .vacio p {
    margin: 0;
    color: var(--muted);
    font-weight: 700;
  }
  .error {
    color: #b0243f;
    font-weight: 700;
  }
  @media (max-width: 700px) {
    .barras li {
      grid-template-columns: 110px minmax(0, 1fr) auto;
    }
    .kpis {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .kpi.grande {
      grid-column: 1 / -1;
    }
  }
</style>
