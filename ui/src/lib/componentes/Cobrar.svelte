<script lang="ts">
  // Cobro de la venta: uno o varios pagos (efectivo con vuelto, tarjeta, Yape/Plin, transferencia).
  import { fly } from 'svelte/transition';
  import { api, type Metodo, type PagoEntrada, type Venta } from '../api';
  import { soles } from '../datos';
  import { avisar } from '../estado.svelte';
  import { aCentimos, aSoles } from '../inventario.svelte';
  import { carrito, calculoActual, itemsDeVenta, METODOS } from '../ventas/carrito.svelte';
  import { efectivoSugerido, redondeoEfectivo } from '../ventas/calculo';

  let { onCerrar, onListo }: { onCerrar: () => void; onListo: (v: Venta) => void } = $props();

  const calc = $derived(calculoActual());
  let pagos = $state<PagoEntrada[]>([]);
  let montoTexto = $state('');
  let tocado = $state(false);
  let ocupado = $state(false);
  let error = $state('');

  const redondeo = $derived(redondeoEfectivo(calc.totalPrevioCent, pagos));
  const total = $derived(calc.totalPrevioCent - redondeo);
  const pagado = $derived(pagos.reduce((s, p) => s + p.montoCent, 0));
  const falta = $derived(total - pagado);
  const vuelto = $derived(pagos.reduce((s, p) => s + (p.metodo === 'efectivo' ? (p.recibidoCent ?? p.montoCent) - p.montoCent : 0), 0));
  const puedeConfirmar = $derived(pagos.length > 0 && falta === 0 && pagos.every((p) => p.metodo !== 'efectivo' || (p.recibidoCent ?? p.montoCent) >= p.montoCent));

  /** Lo que se cobraría con este método: lo escrito o, si no se tocó, lo que falta (en efectivo, sin los céntimos sueltos). */
  function montoPara(m: Metodo): number {
    if (tocado) return aCentimos(montoTexto) ?? 0;
    const f = Math.max(0, falta);
    return m === 'efectivo' ? efectivoSugerido(f) : f;
  }

  function agregarPago(m: Metodo) {
    const monto = montoPara(m);
    if (monto <= 0) {
      error = 'Escribe cuánto se cobra con este método';
      return;
    }
    error = '';
    pagos.push({ metodo: m, montoCent: monto, recibidoCent: m === 'efectivo' ? monto : null });
    tocado = false;
    montoTexto = '';
  }

  function recibido(i: number, texto: string) {
    const c = aCentimos(texto);
    pagos[i].recibidoCent = c === null || c === 0 ? pagos[i].montoCent : c;
  }

  const BILLETES = [10, 20, 50, 100, 200];

  async function confirmar() {
    ocupado = true;
    error = '';
    try {
      const v = await api.registrarVenta({
        items: itemsDeVenta(),
        tipoClienteId: carrito.tipoId,
        clienteId: carrito.cliente?.id ?? null,
        descuento: carrito.descuento,
        pagos: pagos.map((p) => ({ ...p })),
      });
      onListo(v);
    } catch (e) {
      error = (e as Error).message;
      avisar(error);
    } finally {
      ocupado = false;
    }
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && !ocupado && onCerrar()} />

<div class="fondo" role="presentation" onclick={(e) => e.target === e.currentTarget && !ocupado && onCerrar()} transition:fly={{ duration: 150 }}>
  <div class="caja vidrio" role="dialog" aria-label="Cobrar la venta" transition:fly={{ y: 24, duration: 220 }}>
    <header>
      <h2>Cobrar</h2>
      <button class="x" onclick={onCerrar} aria-label="Cerrar" disabled={ocupado}>✕</button>
    </header>

    <div class="total">
      <span class="etiqueta">Total a cobrar</span>
      <strong data-testid="total-cobrar">{soles(total)}</strong>
      {#if redondeo}<small>Redondeo en efectivo a favor del cliente: −{soles(redondeo)}</small>{/if}
    </div>

    {#if pagos.length}
      <ul class="pagos">
        {#each pagos as p, i (i)}
          <li>
            <span class="m">{METODOS[p.metodo].emoji} {METODOS[p.metodo].nombre}</span>
            <strong>{soles(p.montoCent)}</strong>
            <button class="quitar" onclick={() => pagos.splice(i, 1)} aria-label="Quitar este pago">✕</button>
            {#if p.metodo === 'efectivo'}
              <div class="recibido">
                <label>
                  Recibido S/
                  <input
                    inputmode="decimal"
                    value={aSoles(p.recibidoCent ?? p.montoCent)}
                    onchange={(e) => recibido(i, e.currentTarget.value)}
                    aria-label="Efectivo recibido"
                  />
                </label>
                <span class="rapidos">
                  <button type="button" onclick={() => (p.recibidoCent = p.montoCent)}>Exacto</button>
                  {#each BILLETES.filter((b) => b * 100 > p.montoCent) as b}
                    <button type="button" onclick={() => (p.recibidoCent = b * 100)}>{b}</button>
                  {/each}
                </span>
                {#if (p.recibidoCent ?? p.montoCent) > p.montoCent}
                  <span class="vuelto">Vuelto {soles((p.recibidoCent ?? p.montoCent) - p.montoCent)}</span>
                {/if}
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if falta !== 0}
      <div class="agregar">
        <label class="monto">
          {pagos.length ? 'Falta cobrar' : 'Monto a cobrar'} (S/)
          <input
            inputmode="decimal"
            placeholder={aSoles(Math.max(0, falta))}
            bind:value={montoTexto}
            oninput={() => (tocado = montoTexto.trim() !== '')}
            aria-label="Monto de este pago"
          />
        </label>
        <div class="metodos">
          {#each Object.entries(METODOS) as [id, m] (id)}
            <button class="metodo" onclick={() => agregarPago(id as Metodo)} disabled={falta < 0 && pagos.length > 0}>
              <span class="e">{m.emoji}</span>
              <span>{m.nombre}</span>
              <small>{soles(montoPara(id as Metodo))}</small>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <div class="estado" class:ok={falta === 0 && pagos.length > 0}>
      {#if !pagos.length}
        Elige cómo paga el cliente
      {:else if falta > 0}
        Faltan {soles(falta)}
      {:else if falta < 0}
        Sobran {soles(-falta)}: quita o ajusta un pago
      {:else if vuelto > 0}
        Todo cobrado · <strong>vuelto {soles(vuelto)}</strong>
      {:else}
        Todo cobrado ✓
      {/if}
    </div>

    {#if error}<p class="error" role="alert">{error}</p>{/if}

    <footer>
      <button class="btn btn-blanco" onclick={onCerrar} disabled={ocupado}>Volver</button>
      <button class="btn btn-primario" onclick={confirmar} disabled={!puedeConfirmar || ocupado}>{ocupado ? 'Registrando…' : 'Confirmar venta'}</button>
    </footer>
  </div>
</div>

<style>
  .fondo {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--text) 28%, transparent);
    padding: 16px;
  }
  .caja {
    width: min(520px, 100%);
    max-height: calc(100vh - 32px);
    overflow: auto;
    padding: 20px 22px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    background: var(--surface);
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  h2 {
    margin: 0;
    font-size: 22px;
  }
  .x {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--surface-2);
  }
  .total {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px;
    border-radius: 18px;
    background: var(--primary-soft);
  }
  .etiqueta {
    font-size: 13px;
    font-weight: 700;
    color: var(--muted);
  }
  .total strong {
    font-size: 40px;
    font-weight: 800;
    color: var(--primary-strong);
    line-height: 1.1;
  }
  .total small {
    color: var(--muted);
    font-weight: 700;
  }
  .pagos {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .pagos li {
    display: grid;
    grid-template-columns: 1fr auto 30px;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 14px;
    background: var(--surface-2);
  }
  .m {
    font-weight: 700;
  }
  .quitar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    color: var(--muted);
  }
  .recibido {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }
  .recibido label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 700;
    font-size: 13px;
  }
  .recibido input,
  .monto input {
    width: 96px;
    height: 36px;
    border-radius: 12px;
    border: 1.5px solid var(--linea);
    background: var(--surface);
    padding: 0 10px;
    font: inherit;
    font-weight: 800;
    font-size: 15px;
    color: var(--text);
    box-sizing: border-box;
  }
  .rapidos {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  .rapidos button {
    padding: 5px 10px;
    border-radius: 999px;
    background: var(--surface);
    font-weight: 700;
    font-size: 12px;
  }
  .rapidos button:hover {
    background: var(--primary-soft);
  }
  .vuelto {
    font-weight: 800;
    color: #2f8a5c;
  }
  .agregar {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .monto {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-weight: 700;
    font-size: 14px;
  }
  .metodos {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .metodo {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    column-gap: 10px;
    align-items: center;
    text-align: left;
    padding: 10px 14px;
    border-radius: 16px;
    background: var(--surface-2);
    font-weight: 800;
    transition: background 0.15s, transform 0.15s;
  }
  .metodo:hover:not(:disabled) {
    background: var(--primary-soft);
    transform: translateY(-1px);
  }
  .metodo .e {
    grid-row: 1 / 3;
    font-size: 24px;
  }
  .metodo small {
    color: var(--muted);
    font-weight: 700;
  }
  .estado {
    text-align: center;
    padding: 10px;
    border-radius: 14px;
    font-weight: 700;
    background: color-mix(in srgb, var(--yellow) 55%, var(--surface));
  }
  .estado.ok {
    background: color-mix(in srgb, #5dbb8a 30%, var(--surface));
  }
  .estado strong {
    font-size: 18px;
  }
  .error {
    margin: 0;
    color: #b0243f;
    font-weight: 700;
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }
</style>
