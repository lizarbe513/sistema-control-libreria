<script lang="ts">
  // Resumen de la venta recién hecha, como un papelito de caja, con el Osito y una explosión de pétalos.
  // No es un comprobante de pago (sin SUNAT): solo el resumen para la vendedora y el cliente.
  import { alAtras } from '../atras.svelte';
  import { fly, scale } from 'svelte/transition';
  import type { Venta } from '../api';
  import { soles } from '../datos';
  import { app } from '../estado.svelte';
  import { METODOS } from '../ventas/carrito.svelte';
  import IconoMetodo from './IconoMetodo.svelte';
  import Osito from './Osito.svelte';

  let { venta, onCerrar }: { venta: Venta; onCerrar: () => void } = $props();
  // en el celular, «atrás» cierra esto
  $effect(() => alAtras(() => onCerrar()));

  const fecha = $derived(new Date(venta.fecha).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' }));
  const vuelto = $derived(venta.pagos.reduce((s, p) => s + (p.vueltoCent ?? 0), 0));
  const animado = $derived(app.calma.animaciones);

  // el Osito llega caminando y, al llegar, se queda contento
  let llego = $state(false);
  $effect(() => {
    const t = setTimeout(() => (llego = true), animado ? 1200 : 0);
    return () => clearTimeout(t);
  });

  /** Pétalos de la explosión: salen del centro en todas direcciones. */
  const petalos = Array.from({ length: 44 }, (_, i) => {
    const a = (i / 44) * Math.PI * 2 + Math.random() * 0.5;
    const r = 160 + Math.random() * 260;
    return {
      dx: Math.cos(a) * r,
      dy: Math.sin(a) * r * 0.8 - 40,
      giro: Math.round(Math.random() * 540 - 270),
      t: 1.1 + Math.random() * 0.9,
      d: Math.random() * 0.15,
      s: 10 + Math.random() * 12,
      tono: ['#f7a8bd', '#f27a9b', '#ffd1dc', '#f9b9c9'][i % 4],
    };
  });
</script>

<svelte:window onkeydown={(e) => (e.key === 'Escape' || e.key === 'Enter') && onCerrar()} />

<div class="fondo" role="presentation" onclick={(e) => e.target === e.currentTarget && onCerrar()} transition:fly={{ duration: 160 }}>
  {#if animado}
    <div class="explosion" aria-hidden="true">
      {#each petalos as p}
        <span
          style:--dx="{p.dx}px"
          style:--dy="{p.dy}px"
          style:--giro="{p.giro}deg"
          style:animation-duration="{p.t}s"
          style:animation-delay="{p.d}s"
          style:width="{p.s}px"
          style:height="{p.s * 1.3}px"
          style:background={p.tono}
        ></span>
      {/each}
    </div>
  {/if}

  <div class="papel" role="dialog" aria-label="Resumen de la venta" transition:scale={{ start: 0.85, duration: 320 }}>
    <div class="osito" class:llego>
      <Osito tam={150} camina={!llego} />
    </div>
    <h2>¡Venta lista! 🎉</h2>
    <p class="sub">Resumen de venta #{venta.id} · {fecha}</p>

    <div class="corte"></div>

    <p class="quien"><span>Cliente</span><strong>{venta.cliente}</strong></p>
    <p class="quien"><span>Atendió</span><strong>{venta.vendedora}</strong></p>

    <ul class="items">
      {#each venta.items as i}
        <li>
          <span class="t">{i.cantidad} × {i.titulo}</span>
          <span class="m">{soles(i.totalCent)}</span>
        </li>
      {/each}
    </ul>

    <div class="corte"></div>

    <dl class="tot">
      <div><dt>Subtotal</dt><dd>{soles(venta.subtotalCent)}</dd></div>
      {#if venta.descuentoCent}<div class="verde"><dt>Descuentos{#if venta.tipoPct} ({venta.tipoNombre}){/if}</dt><dd>−{soles(venta.descuentoCent)}</dd></div>{/if}
      {#if venta.redondeoCent}<div class="verde"><dt>Redondeo en efectivo</dt><dd>−{soles(venta.redondeoCent)}</dd></div>{/if}
      <div class="gran"><dt>Total</dt><dd data-testid="comprobante-total">{soles(venta.totalCent)}</dd></div>
      {#if venta.adelantoCent}
        <div><dt>Ya pagado (adelanto del encargo)</dt><dd>−{soles(venta.adelantoCent)}</dd></div>
        <div><dt>Pagado hoy</dt><dd>{soles(venta.totalCent - venta.adelantoCent)}</dd></div>
      {/if}
    </dl>

    <p class="pagos">
      {#each venta.pagos as p}<span><IconoMetodo metodo={p.metodo} tam={16} /> {METODOS[p.metodo].nombre} {soles(p.montoCent)}</span>{/each}
      {#if vuelto > 0}<strong>Vuelto {soles(vuelto)}</strong>{/if}
    </p>

    <p class="gracias">¡Gracias por tu compra! 💕</p>
    <button class="btn btn-primario" onclick={onCerrar}>Listo</button>
    <small>Resumen interno: no es un comprobante de pago.</small>
  </div>
</div>

<style>
  .fondo {
    position: fixed;
    inset: 0;
    z-index: 70;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--text) 32%, transparent);
    padding: 16px;
    overflow: hidden;
  }
  .explosion {
    position: absolute;
    left: 50%;
    top: 45%;
    pointer-events: none;
    z-index: 2;
  }
  .explosion span {
    position: absolute;
    border-radius: 80% 0 80% 0;
    opacity: 0;
    animation: estallar cubic-bezier(0.1, 0.7, 0.3, 1) forwards;
  }
  @keyframes estallar {
    0% {
      transform: translate(0, 0) scale(0.2) rotate(0);
      opacity: 1;
    }
    70% {
      opacity: 1;
    }
    100% {
      transform: translate(var(--dx), calc(var(--dy) + 140px)) scale(1) rotate(var(--giro));
      opacity: 0;
    }
  }
  .papel {
    position: relative;
    width: min(380px, 100%);
    max-height: calc(100vh - 32px);
    overflow: auto;
    padding: 18px 26px 22px;
    background: #fffdf8;
    color: #3d2f2a;
    display: flex;
    flex-direction: column;
    gap: 8px;
    text-align: center;
    border-radius: 14px 14px 0 0;
    box-shadow: 0 22px 50px rgba(120, 40, 70, 0.3);
    /* borde inferior de papelito rasgado */
    --d: 10px;
    mask: conic-gradient(from -45deg at bottom, #0000, #000 1deg 89deg, #0000 90deg) bottom / var(--d) 51% repeat-x, linear-gradient(#000 0 0) top / 100% calc(100% - var(--d) * 0.5) no-repeat;
    padding-bottom: 34px;
  }
  .osito {
    height: 150px;
    display: flex;
    justify-content: center;
    animation: llegar 1.2s cubic-bezier(0.3, 0.7, 0.4, 1) both;
  }
  .osito.llego {
    animation: none;
  }
  @keyframes llegar {
    from {
      transform: translateX(-190%);
    }
    to {
      transform: translateX(0);
    }
  }
  h2 {
    margin: 0;
    font-size: 24px;
  }
  .sub {
    margin: 0;
    color: #8a7a74;
    font-size: 13px;
    font-weight: 700;
  }
  .corte {
    border-top: 2px dashed #d9c9c0;
    margin: 6px 0;
  }
  .quien {
    margin: 0;
    display: flex;
    justify-content: space-between;
    font-size: 14px;
  }
  .quien span {
    color: #8a7a74;
  }
  .items {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: left;
    font-size: 14px;
  }
  .items li {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  .items .m,
  .tot dd {
    font-family: ui-monospace, 'DejaVu Sans Mono', monospace;
    font-weight: 700;
  }
  .tot {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 14px;
  }
  .tot div {
    display: flex;
    justify-content: space-between;
  }
  .tot dd {
    margin: 0;
  }
  .tot .verde {
    color: #2f8a5c;
  }
  .tot .gran {
    font-size: 24px;
    font-weight: 800;
    color: var(--primary-strong);
    margin-top: 4px;
  }
  .pagos {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    color: #6c5b55;
  }
  .gracias {
    margin: 6px 0 0;
    font-weight: 800;
  }
  small {
    color: #a89a94;
    font-size: 11px;
  }
  .papel .btn {
    align-self: center;
  }
</style>
