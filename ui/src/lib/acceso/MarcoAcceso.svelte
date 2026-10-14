<script lang="ts">
  // Marco de las pantallas antes de entrar: tarjeta de vidrio centrada sobre el fondo animado.
  import type { Snippet } from 'svelte';
  import { fly } from 'svelte/transition';

  let { titulo, subtitulo = '', ancho = 460, children }: { titulo: string; subtitulo?: string; ancho?: number; children: Snippet } = $props();
</script>

<div class="acceso" data-vacio>
  <div class="tarjeta-acceso vidrio" style:--ancho="{ancho}px" in:fly={{ y: 20, duration: 450 }}>
    <div class="marca">
      <span class="logo">📚</span>
      <div>
        <strong>SIGLO XXI</strong>
        <span>Librería</span>
      </div>
    </div>
    <h1>{titulo}</h1>
    {#if subtitulo}<p class="sub">{subtitulo}</p>{/if}
    {@render children()}
  </div>
</div>

<style>
  .acceso {
    position: relative;
    z-index: 1;
    min-height: 100%;
    display: grid;
    place-items: center;
    padding: 24px 16px;
  }
  .tarjeta-acceso {
    width: min(var(--ancho), 100%);
    padding: 28px 30px 30px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    background: color-mix(in srgb, var(--surface) 92%, transparent);
  }
  .marca {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .logo {
    width: 44px;
    height: 44px;
    border-radius: 14px;
    display: grid;
    place-items: center;
    background: var(--primary-soft);
    font-size: 24px;
  }
  .marca div {
    display: flex;
    flex-direction: column;
    line-height: 1.1;
  }
  .marca strong {
    letter-spacing: 0.06em;
  }
  .marca span {
    font-size: 12px;
    color: var(--muted);
  }
  h1 {
    margin: 6px 0 0;
    font-size: 26px;
    font-weight: 800;
  }
  .sub {
    margin: -6px 0 4px;
    color: var(--muted);
  }
  :global(.acceso .campo) {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-weight: 700;
    font-size: 14px;
  }
  :global(.acceso .campo input) {
    font: inherit;
    font-weight: 600;
    font-size: 16px;
    padding: 12px 14px;
    border-radius: 14px;
    border: 2px solid var(--linea);
    background: var(--surface);
    color: var(--text);
  }
  :global(.acceso .campo input:focus) {
    outline: none;
    border-color: var(--primary);
  }
  :global(.acceso .error) {
    margin: 0;
    padding: 10px 14px;
    border-radius: 12px;
    background: color-mix(in srgb, #e0405f 14%, var(--surface));
    color: #b0243f;
    font-weight: 700;
    font-size: 14px;
  }
  :global(.acceso .acciones) {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    margin-top: 6px;
  }
  :global(.acceso .enlace) {
    color: var(--primary-strong);
    font-weight: 700;
    font-size: 14px;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
</style>
