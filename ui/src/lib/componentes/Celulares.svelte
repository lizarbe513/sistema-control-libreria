<script lang="ts">
  // Ajustes (solo la Dueña): conectar celulares al PC por el WiFi de la tienda y vincularlos con un código QR.
  import { api, type CodigoVinculo, type EstadoCelulares } from '../api';
  import { avisar } from '../estado.svelte';
  import { fechaAmable } from '../seguridad';

  let est = $state<EstadoCelulares | null>(null);
  let codigo = $state<CodigoVinculo | null>(null);
  let resta = $state(0);
  let ocupado = $state(false);

  async function cargar() {
    try {
      est = await api.estadoCelulares();
    } catch (e) {
      avisar((e as Error).message);
    }
  }
  cargar();

  // mientras haya un código a la vista, se cuenta hacia atrás y se refresca la lista (para ver cuando se vincula)
  $effect(() => {
    if (!codigo) return;
    const antes = est?.dispositivos.length ?? 0;
    const t = setInterval(async () => {
      resta -= 2;
      if (resta <= 0) return void (codigo = null);
      await cargar();
      if ((est?.dispositivos.length ?? 0) > antes) {
        codigo = null;
        avisar('¡Celular vinculado! 📱');
      }
    }, 2000);
    return () => clearInterval(t);
  });

  async function activar(valor: boolean) {
    ocupado = true;
    try {
      est = await api.activarCelulares(valor);
      if (!valor) codigo = null;
    } catch (e) {
      avisar((e as Error).message);
      await cargar();
    } finally {
      ocupado = false;
    }
  }

  async function vincular() {
    try {
      codigo = await api.codigoCelular();
      resta = codigo.segundos;
    } catch (e) {
      avisar((e as Error).message);
    }
  }

  async function desconectar(id: number, nombre: string) {
    if (!confirm(`¿Desconectar «${nombre}»? Ese celular dejará de poder entrar hasta que lo vincules otra vez.`)) return;
    try {
      est = await api.desconectarCelular(id);
      avisar(`«${nombre}» se desconectó`);
    } catch (e) {
      avisar((e as Error).message);
    }
  }

  const activos = $derived(est?.dispositivos.filter((d) => !d.revocado) ?? []);
  const viejos = $derived(est?.dispositivos.filter((d) => d.revocado) ?? []);
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;
</script>

{#if est}
  <div class="cel">
    <label class="interruptor">
      <div>
        <strong>Conectar celulares</strong>
        <span class="atenuado">
          Deja usar la librería desde el celular por el WiFi de la tienda (el PC debe estar encendido con la app abierta). Los datos viajan
          <b>cifrados</b> y cada celular se vincula con su propio código.
        </span>
      </div>
      <input type="checkbox" checked={est.activo} disabled={ocupado} onchange={(e) => activar(e.currentTarget.checked)} aria-label="Conectar celulares" />
      <span class="pastilla" aria-hidden="true"></span>
    </label>

    {#if est.activo}
      <p class="estado" class:ok={est.corriendo} data-testid="estado-celulares">
        {#if est.corriendo}
          🟢 Listo en <code>{est.direcciones[0] ?? '—'}:{est.puerto}</code>{#if est.direcciones.length > 1} <span class="atenuado">(también {est.direcciones.slice(1).join(', ')})</span>{/if}
        {:else}
          🟡 Encendiendo…
        {/if}
      </p>
      <p class="nota">Si Windows pregunta si permites que la app acceda a la red, elige <b>«Redes privadas»</b>. El celular debe estar en el mismo WiFi que el PC.</p>

      {#if codigo}
        <div class="vinculo" data-testid="vinculo">
          <div class="qr">{@html codigo.svg}</div>
          <div class="pasos">
            <strong>En el celular</strong>
            <ol>
              <li>Instala y abre la app de la librería.</li>
              <li>Toca <b>«Vincular con el PC»</b> y escanea este código.</li>
            </ol>
            <p class="codigo">Código: <code>{codigo.codigo}</code></p>
            <p class="vence">Vale <b>{mmss(resta)}</b> y se usa una sola vez.</p>
            <button class="enlace" onclick={() => (codigo = null)}>Cerrar</button>
          </div>
        </div>
      {:else}
        <button class="btn btn-primario" onclick={vincular} disabled={!est.corriendo}>📱 Vincular un celular nuevo</button>
      {/if}
    {/if}

    {#if activos.length}
      <h3>Celulares vinculados</h3>
      <ul class="lista">
        {#each activos as d (d.id)}
          <li>
            <span class="ico">📱</span>
            <span class="txt"><strong>{d.nombre}</strong><small>{d.ultimoUso ? `última vez ${fechaAmable(d.ultimoUso)}` : 'todavía no se ha usado'}</small></span>
            <button class="enlace" onclick={() => desconectar(d.id, d.nombre)}>Desconectar</button>
          </li>
        {/each}
      </ul>
    {/if}
    {#if viejos.length}
      <details class="viejos">
        <summary>{viejos.length} desconectado{viejos.length === 1 ? '' : 's'}</summary>
        <ul>
          {#each viejos as d (d.id)}<li class="atenuado">{d.nombre}</li>{/each}
        </ul>
      </details>
    {/if}
  </div>
{:else}
  <p class="atenuado">Cargando…</p>
{/if}

<style>
  .interruptor {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 12px;
    border-radius: 16px;
    background: var(--surface);
    cursor: pointer;
  }
  .interruptor div {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .interruptor span.atenuado {
    font-size: 13px;
  }
  .interruptor input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .pastilla {
    width: 48px;
    height: 28px;
    border-radius: 14px;
    background: var(--linea);
    position: relative;
    transition: background 0.2s;
    flex: none;
  }
  .pastilla::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
    transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  input:checked + .pastilla {
    background: var(--primary);
  }
  input:checked + .pastilla::after {
    transform: translateX(20px);
  }
  .cel {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  p {
    margin: 0;
  }
  .estado {
    font-weight: 700;
    font-size: 14px;
  }
  .estado code {
    font-size: 13px;
  }
  .nota {
    font-size: 13px;
    color: var(--muted);
  }
  .vinculo {
    display: flex;
    gap: 20px;
    align-items: center;
    flex-wrap: wrap;
    padding: 14px;
    border-radius: 18px;
    background: var(--surface-2);
  }
  .qr {
    width: 220px;
    height: 220px;
    border-radius: 12px;
    overflow: hidden;
    background: #fff;
    flex: none;
  }
  .qr :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
  }
  .pasos {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 200px;
  }
  .pasos ol {
    margin: 0;
    padding-left: 20px;
    font-size: 14px;
  }
  .codigo code {
    font-size: 18px;
    font-weight: 800;
    letter-spacing: 2px;
  }
  .vence {
    font-size: 13px;
    color: var(--muted);
  }
  h3 {
    margin: 4px 0 0;
    font-size: 15px;
  }
  .lista,
  .viejos ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .lista li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    border-radius: 12px;
    background: var(--surface-2);
  }
  .ico {
    font-size: 22px;
  }
  .txt {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .txt small {
    color: var(--muted);
  }
  .enlace {
    color: var(--primary-strong);
    font-weight: 700;
    font-size: 13px;
  }
  .viejos summary {
    cursor: pointer;
    font-size: 13px;
    color: var(--muted);
    font-weight: 700;
  }
</style>
