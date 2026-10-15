<script lang="ts">
  // Diálogo para confirmar algo que no se deshace fácil (quitar una cuenta, dar de baja un libro con stock…).
  // A diferencia de confirm(), se ve igual en el PC y en el celular, y se cierra con «atrás».
  import type { Snippet } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { alAtras } from '../atras.svelte';

  let {
    titulo,
    children,
    textoSi,
    peligro = false,
    onSi,
    onNo,
  }: { titulo: string; children: Snippet; textoSi: string; peligro?: boolean; onSi: () => void; onNo: () => void } = $props();

  $effect(() => alAtras(onNo));
</script>

<div class="velo" transition:fade={{ duration: 150 }} onclick={onNo} role="presentation"></div>
<div class="dialogo tarjeta" role="alertdialog" aria-modal="true" aria-label={titulo} transition:scale={{ start: 0.94, duration: 180 }}>
  <h3>{titulo}</h3>
  <div class="cuerpo">{@render children()}</div>
  <div class="acciones">
    <button class="btn btn-blanco" onclick={onNo}>Cancelar</button>
    <button class="btn btn-primario" class:peligro onclick={onSi}>{textoSi}</button>
  </div>
</div>

<style>
  .velo {
    position: fixed;
    inset: 0;
    z-index: 80;
    background: rgba(40, 20, 30, 0.35);
  }
  .dialogo {
    position: fixed;
    z-index: 81;
    left: 50%;
    top: 50%;
    translate: -50% -50%;
    width: min(92vw, 420px);
    padding: 20px;
    border-radius: 22px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  h3 {
    margin: 0;
    font-size: 18px;
  }
  .cuerpo {
    font-size: 14px;
    line-height: 1.45;
  }
  .acciones {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;
  }
  .peligro {
    background: #d6365a;
    box-shadow: 0 8px 16px rgba(214, 54, 90, 0.3);
  }
</style>
