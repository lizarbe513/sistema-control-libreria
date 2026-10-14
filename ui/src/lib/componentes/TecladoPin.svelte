<script lang="ts">
  // Teclado numérico grande para el PIN: se usa con el mouse, con el dedo o con el teclado.
  let {
    onEnviar,
    ocupado = false,
    sacudir = 0,
  }: {
    onEnviar: (pin: string) => void;
    ocupado?: boolean;
    /** Cambia su valor para disparar la sacudida (PIN incorrecto). */
    sacudir?: number;
  } = $props();

  let pin = $state('');
  let temblando = $state(false);

  $effect(() => {
    if (!sacudir) return;
    temblando = true;
    pin = '';
    const t = setTimeout(() => (temblando = false), 450);
    return () => clearTimeout(t);
  });

  function pulsar(d: string) {
    if (ocupado || pin.length >= 6) return;
    pin += d;
  }
  function borrar() {
    pin = pin.slice(0, -1);
  }
  function enviar() {
    if (pin.length >= 4 && !ocupado) onEnviar(pin);
  }

  function tecla(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return;
    if (/^\d$/.test(e.key)) pulsar(e.key);
    else if (e.key === 'Backspace') borrar();
    else if (e.key === 'Enter') enviar();
  }
</script>

<svelte:window onkeydown={tecla} />

<div class="teclado">
  <div class="puntos" class:temblando aria-live="polite" aria-label={`${pin.length} números escritos`}>
    {#each Array(Math.max(4, pin.length)) as _, i}
      <span class:lleno={i < pin.length}></span>
    {/each}
  </div>
  <div class="teclas">
    {#each ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as d}
      <button class="tecla" onclick={() => pulsar(d)} disabled={ocupado}>{d}</button>
    {/each}
    <button class="tecla suave" onclick={borrar} disabled={ocupado || !pin} aria-label="Borrar">⌫</button>
    <button class="tecla" onclick={() => pulsar('0')} disabled={ocupado}>0</button>
    <button class="tecla entrar" onclick={enviar} disabled={ocupado || pin.length < 4} aria-label="Entrar">{ocupado ? '…' : '→'}</button>
  </div>
</div>

<style>
  .teclado {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
  }
  .puntos {
    display: flex;
    gap: 12px;
    height: 20px;
  }
  .puntos span {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2.5px solid var(--primary);
    transition:
      background 0.15s,
      transform 0.15s;
  }
  .puntos span.lleno {
    background: var(--primary);
    transform: scale(1.1);
  }
  .temblando {
    animation: sacudida 0.42s;
  }
  @keyframes sacudida {
    20%,
    60% {
      transform: translateX(-10px);
    }
    40%,
    80% {
      transform: translateX(10px);
    }
  }
  .teclas {
    display: grid;
    grid-template-columns: repeat(3, 68px);
    gap: 12px;
  }
  .tecla {
    height: 68px;
    border-radius: 50%;
    background: var(--surface);
    font-size: 26px;
    font-weight: 800;
    color: var(--text);
    box-shadow: var(--sombra-suave);
    transition:
      transform 0.1s,
      background 0.2s;
  }
  .tecla:hover:not(:disabled) {
    background: var(--primary-soft);
  }
  .tecla:active:not(:disabled) {
    transform: scale(0.92);
  }
  .tecla:disabled {
    opacity: 0.5;
  }
  .tecla.suave {
    background: transparent;
    box-shadow: none;
    color: var(--muted);
  }
  .tecla.entrar {
    background: var(--primary);
    color: var(--on-primary);
  }
</style>
