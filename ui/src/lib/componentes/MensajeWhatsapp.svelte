<script lang="ts">
  // Ajustes (solo la Dueña): el mensaje con que se avisa por WhatsApp que llegó un encargo.
  import { api } from '../api';
  import { avisar } from '../estado.svelte';
  import { sesion } from '../sesion.svelte';

  let texto = $state('');
  let original = $state('');
  api.plantillaWhatsapp().then((t) => (texto = original = t)).catch(() => {});

  const ejemplo = $derived(
    texto
      .replaceAll('{cliente}', 'Rosa')
      .replaceAll('{libro}', 'Los ríos profundos')
      .replaceAll('{tienda}', sesion.estado?.tienda ?? 'SIGLO XXI')
      .replaceAll('{saldo}', 'Saldo a pagar: S/ 30.00. '),
  );

  async function guardar(valor: string) {
    try {
      texto = original = await api.plantillaWhatsapp(valor);
      avisar(valor ? 'Mensaje guardado 💬' : 'Se restableció el mensaje de fábrica');
    } catch (e) {
      avisar((e as Error).message);
    }
  }

  function insertar(marca: string) {
    texto = `${texto}${texto.endsWith(' ') || !texto ? '' : ' '}${marca}`;
  }
</script>

<div class="wa">
  <p class="atenuado">Se abre WhatsApp con este texto al avisar que llegó un encargo. Toca una etiqueta para insertarla:</p>
  <div class="marcas">
    <button type="button" onclick={() => insertar('{cliente}')}>{'{cliente}'} <small>primer nombre</small></button>
    <button type="button" onclick={() => insertar('{libro}')}>{'{libro}'} <small>título</small></button>
    <button type="button" onclick={() => insertar('{tienda}')}>{'{tienda}'} <small>nombre de la tienda</small></button>
    <button type="button" onclick={() => insertar('{saldo}')}>{'{saldo}'} <small>lo que falta pagar</small></button>
  </div>
  <textarea bind:value={texto} rows="4" maxlength="1000" aria-label="Mensaje de WhatsApp"></textarea>
  <div class="vista">
    <span class="etq">Así se verá</span>
    <p class="burbuja">{ejemplo}</p>
  </div>
  <div class="acciones">
    <button class="enlace" onclick={() => guardar('')}>Restablecer el de fábrica</button>
    <button class="btn btn-suave" onclick={() => guardar(texto)} disabled={texto === original}>Guardar mensaje</button>
  </div>
</div>

<style>
  .wa {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  p {
    margin: 0;
  }
  .marcas {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .marcas button {
    padding: 5px 10px;
    border-radius: 999px;
    background: var(--surface-2);
    font-weight: 800;
    font-size: 12px;
    font-family: ui-monospace, monospace;
  }
  .marcas small {
    font-family: var(--fuente, inherit);
    color: var(--muted);
    font-weight: 600;
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    border-radius: 14px;
    border: 2px solid var(--linea);
    background: var(--surface);
    padding: 10px 12px;
    font: inherit;
    color: var(--text);
    resize: vertical;
  }
  .vista {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .etq {
    font-size: 12px;
    font-weight: 800;
    color: var(--muted);
  }
  .burbuja {
    align-self: flex-start;
    max-width: 460px;
    padding: 10px 14px;
    border-radius: 14px 14px 14px 4px;
    background: #dcf8c6;
    color: #1f2d1f;
    font-size: 14px;
    line-height: 1.4;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
  }
  .acciones {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }
  .enlace {
    color: var(--primary-strong);
    font-weight: 700;
    font-size: 13px;
  }
</style>
