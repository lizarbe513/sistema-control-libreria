<script lang="ts">
  // Descuento a mano: porcentaje o monto en soles. Vacío = sin descuento.
  import { untrack } from 'svelte';
  import type { Descuento } from '../api';
  import { aCentimos, aSoles } from '../inventario.svelte';

  let { valor, onCambio, etiqueta = 'Descuento' }: { valor: Descuento | null; onCambio: (d: Descuento | null) => void; etiqueta?: string } = $props();

  let tipo = $state<'pct' | 'monto'>('pct');
  let texto = $state('');

  // Si el descuento cambia desde afuera (p. ej. se vacía el carrito), el campo lo sigue. Solo depende de `valor`:
  // lo que se está escribiendo no debe volver a leerse mientras el valor todavía no se actualizó.
  $effect(() => {
    const v = valor;
    untrack(() => {
      if (!v) {
        if (aEmitido(tipo, texto)) texto = '';
      } else if (aEmitido(v.tipo, texto)?.valor !== v.valor || tipo !== v.tipo) {
        tipo = v.tipo;
        texto = v.tipo === 'pct' ? String(v.valor) : aSoles(v.valor);
      }
    });
  });

  function aEmitido(t: 'pct' | 'monto', txt: string): Descuento | null {
    if (t === 'pct') {
      const n = Number(txt.replace(',', '.'));
      return txt.trim() && Number.isFinite(n) && n > 0 ? { tipo: 'pct', valor: Math.min(100, Math.round(n)) } : null;
    }
    const c = aCentimos(txt);
    return c ? { tipo: 'monto', valor: c } : null;
  }

  function emitir() {
    onCambio(aEmitido(tipo, texto));
  }
</script>

<div class="desc">
  <span class="seg">
    <button type="button" class:on={tipo === 'pct'} onclick={() => ((tipo = 'pct'), emitir())} aria-label="Porcentaje">%</button>
    <button type="button" class:on={tipo === 'monto'} onclick={() => ((tipo = 'monto'), emitir())} aria-label="Monto en soles">S/</button>
  </span>
  <input inputmode="decimal" placeholder="0" bind:value={texto} oninput={emitir} aria-label={etiqueta} />
</div>

<style>
  .desc {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .seg {
    display: inline-flex;
    border-radius: 999px;
    background: var(--surface-2);
    padding: 2px;
  }
  .seg button {
    min-width: 32px;
    height: 28px;
    border-radius: 999px;
    font-weight: 800;
    font-size: 12px;
    color: var(--muted);
  }
  .seg button.on {
    background: var(--primary);
    color: var(--on-primary);
  }
  input {
    width: 70px;
    height: 32px;
    border-radius: 12px;
    border: 1.5px solid var(--linea);
    background: var(--surface);
    padding: 0 10px;
    font: inherit;
    font-weight: 700;
    font-size: 14px;
    color: var(--text);
    box-sizing: border-box;
  }
</style>
