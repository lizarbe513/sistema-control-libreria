<script lang="ts">
  // Celular, botón «+»: lo que más se hace con el teléfono en la mano. Guardar libros (tres formas) o vender.
  import Icono from '../componentes/Icono.svelte';
  import { app } from '../estado.svelte';
  import { hayLectorTexto } from '../escaner';
  import { registrar, type ModoRegistro } from '../registro.svelte';

  const formas: { modo: ModoRegistro; emoji: string; nombre: string; detalle: string; soloCamara?: boolean }[] = [
    { modo: 'isbn', emoji: '📷', nombre: 'Escanear el ISBN', detalle: 'El código de barras de la contratapa. Lo más rápido para recorrer un estante.' },
    { modo: 'titulo', emoji: '🔤', nombre: 'Leer el título', detalle: 'Para libros sin código: toma una foto, marca el título con el dedo y se busca en internet.', soloCamara: true },
    { modo: 'mano', emoji: '✍️', nombre: 'Escribir el título', detalle: 'Lo buscas en internet por título y autor, o llenas los datos a mano.' },
  ];
</script>

<div class="nuevo" data-vacio>
  <h1>Guardar libros</h1>
  <div class="formas">
    {#each formas as f (f.modo)}
      {@const sinCamara = f.soloCamara && !hayLectorTexto()}
      <button class="tarjeta forma" class:principal={f.modo === 'isbn'} disabled={sinCamara} onclick={() => registrar(f.modo)} data-testid="registrar-{f.modo}">
        <span class="emoji" aria-hidden="true">{f.emoji}</span>
        <span class="texto">
          <strong>{f.nombre}</strong>
          <small>{sinCamara ? 'Solo en la app del celular (usa su cámara).' : f.detalle}</small>
        </span>
        <Icono nombre="derecha" tam={20} />
      </button>
    {/each}
  </div>

  <h2 class="titulo-seccion">Vender</h2>
  <button class="tarjeta forma vender" onclick={() => (app.vista = 'vender')} data-testid="ir-vender">
    <span class="emoji" aria-hidden="true">🛍️</span>
    <span class="texto">
      <strong>Nueva venta</strong>
      <small>Agregar libros a la bolsa y cobrar</small>
    </span>
    <Icono nombre="derecha" tam={20} />
  </button>
</div>

<style>
  .nuevo {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  h1 {
    margin: 4px 0 0;
    font-size: 28px;
  }
  h2 {
    margin: 10px 0 0;
  }
  .formas {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .forma {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px;
    text-align: left;
    border-radius: 22px;
    color: var(--text);
    transition: transform 0.15s;
  }
  .forma:active {
    transform: scale(0.98);
  }
  .forma:disabled {
    opacity: 0.55;
  }
  .forma :global(svg) {
    color: var(--muted);
    flex: none;
  }
  .emoji {
    width: 56px;
    height: 56px;
    flex: none;
    display: grid;
    place-items: center;
    border-radius: 18px;
    background: var(--primary-soft);
    font-size: 28px;
  }
  .texto {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .texto strong {
    font-size: 17px;
  }
  .texto small {
    color: var(--muted);
    font-size: 13px;
    line-height: 1.3;
  }
  .principal {
    padding: 22px 16px;
    background: linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 70%, var(--lilac)));
    color: var(--on-primary);
    box-shadow: 0 12px 26px color-mix(in srgb, var(--primary) 35%, transparent);
  }
  .principal .emoji {
    background: rgba(255, 255, 255, 0.25);
  }
  .principal .texto small,
  .principal :global(svg) {
    color: color-mix(in srgb, var(--on-primary) 85%, transparent);
  }
  .vender .emoji {
    background: color-mix(in srgb, #5dbb8a 25%, var(--surface));
  }
</style>
