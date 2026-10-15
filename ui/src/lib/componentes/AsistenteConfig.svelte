<script lang="ts">
  // Ajustes → Asistente IA (Dueña, en el PC): las claves gratuitas de Gemini y Groq, el modelo de cada una y «Probar».
  // Las claves se guardan dentro de la base cifrada y nunca vuelven a la pantalla (solo sus últimas 4 letras).
  import { onMount } from 'svelte';
  import { api, type ProveedorIa } from '../api';
  import { avisar } from '../estado.svelte';

  const PASOS: Record<string, { url: string; pasos: string[] }> = {
    gemini: {
      url: 'https://aistudio.google.com/apikey',
      pasos: ['Entra con una cuenta de Google.', 'Toca «Create API key» (o «Crear clave de API»).', 'Copia la clave (empieza con «AIza…») y pégala aquí.'],
    },
    groq: {
      url: 'https://console.groq.com/keys',
      pasos: ['Crea una cuenta gratis (con Google o un correo).', 'Toca «Create API Key».', 'Copia la clave (empieza con «gsk_…») y pégala aquí.'],
    },
  };

  let proveedores = $state<ProveedorIa[]>([]);
  let claves = $state<Record<string, string>>({ gemini: '', groq: '' });
  let modelos = $state<Record<string, string[]>>({});
  let probando = $state<string | null>(null);
  let resultado = $state<Record<string, { ok: boolean; texto: string }>>({});

  onMount(async () => {
    try {
      proveedores = await api.asistenteConfig();
    } catch (e) {
      avisar((e as Error).message);
    }
  });

  async function probar(p: ProveedorIa) {
    probando = p.id;
    try {
      const lista = await api.asistenteProbar(p.id, claves[p.id].trim() || null);
      modelos[p.id] = lista;
      resultado[p.id] = { ok: true, texto: `La clave funciona ✓ (${lista.length} modelos disponibles)` };
    } catch (e) {
      resultado[p.id] = { ok: false, texto: (e as Error).message };
    } finally {
      probando = null;
    }
  }

  async function guardar(p: ProveedorIa, modelo: string | null = null) {
    try {
      const clave = claves[p.id].trim() || null;
      proveedores = await api.asistenteGuardarConfig(p.id, clave, modelo);
      claves[p.id] = '';
      avisar(clave ? `Clave de ${p.nombre} guardada 🔒` : 'Guardado');
    } catch (e) {
      avisar((e as Error).message);
    }
  }

  async function quitar(p: ProveedorIa) {
    proveedores = await api.asistenteGuardarConfig(p.id, '', null);
    resultado[p.id] = { ok: false, texto: 'Clave quitada' };
  }

  async function abrir(url: string) {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
    } catch {
      window.open(url, '_blank', 'noopener');
    }
  }
</script>

<p class="atenuado">
  El asistente usa <b>Gemini</b> (de Google) y, si se acaba su cupo gratis del día, <b>Groq</b> como respaldo. Las dos son gratuitas: basta
  con sacar una clave. Con una sola ya funciona; con las dos, casi nunca se queda sin responder. Los datos de tus clientes nunca se envían.
</p>

<div class="proveedores">
  {#each proveedores as p (p.id)}
    <div class="proveedor" data-testid="proveedor-{p.id}">
      <div class="cab">
        <strong>{p.nombre}{p.id === 'gemini' ? ' (principal)' : ' (respaldo)'}</strong>
        {#if p.configurada}<span class="ok">🔒 Clave guardada ····{p.finalClave}</span>{:else}<span class="falta">Sin clave</span>{/if}
      </div>
      <details>
        <summary>Cómo sacar la clave gratis</summary>
        <ol>
          <li><button class="enlace" onclick={() => abrir(PASOS[p.id].url)}>Abre {PASOS[p.id].url.replace('https://', '')}</button></li>
          {#each PASOS[p.id].pasos as paso (paso)}<li>{paso}</li>{/each}
        </ol>
      </details>
      <div class="fila">
        <input type="password" bind:value={claves[p.id]} placeholder={p.configurada ? 'Pega otra clave para cambiarla' : 'Pega aquí la clave'} aria-label="Clave de {p.nombre}" autocomplete="off" />
        <button class="btn btn-blanco" onclick={() => probar(p)} disabled={probando === p.id || (!p.configurada && !claves[p.id].trim())}>{probando === p.id ? 'Probando…' : 'Probar'}</button>
        <button class="btn btn-primario" onclick={() => guardar(p)} disabled={!claves[p.id].trim()}>Guardar</button>
      </div>
      {#if resultado[p.id]}<p class="resultado" class:bien={resultado[p.id].ok}>{resultado[p.id].texto}</p>{/if}
      <div class="fila">
        <label class="modelo">
          Modelo
          {#if modelos[p.id]?.length}
            <select value={p.modelo} onchange={(e) => guardar(p, e.currentTarget.value)} aria-label="Modelo de {p.nombre}">
              {#if !modelos[p.id].includes(p.modelo)}<option value={p.modelo}>{p.modelo} (no está en la lista)</option>{/if}
              {#each modelos[p.id] as m (m)}<option value={m}>{m}</option>{/each}
            </select>
          {:else}
            <input value={p.modelo} onchange={(e) => guardar(p, e.currentTarget.value)} aria-label="Modelo de {p.nombre}" />
          {/if}
        </label>
        {#if p.configurada}<button class="enlace quitar" onclick={() => quitar(p)}>Quitar la clave</button>{/if}
      </div>
    </div>
  {/each}
</div>

<style>
  .proveedores {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .proveedor {
    padding: 12px 14px;
    border-radius: 16px;
    background: var(--surface);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .cab {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .ok {
    font-size: 12px;
    font-weight: 800;
    color: #2f8a5c;
  }
  .falta {
    font-size: 12px;
    font-weight: 800;
    color: var(--muted);
  }
  details {
    font-size: 13px;
  }
  summary {
    cursor: pointer;
    font-weight: 700;
    color: var(--primary-strong);
  }
  ol {
    margin: 6px 0 0;
    padding-left: 20px;
    line-height: 1.6;
  }
  .fila {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .fila > input,
  .modelo input,
  .modelo select {
    flex: 1;
    min-width: 180px;
    font: inherit;
    padding: 8px 12px;
    border-radius: 12px;
    border: 2px solid var(--linea);
    background: var(--surface);
    color: var(--text);
  }
  .modelo {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 700;
  }
  .resultado {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    color: #b0243f;
  }
  .resultado.bien {
    color: #2f8a5c;
  }
  .enlace {
    font-weight: 800;
    color: var(--primary-strong);
  }
  .quitar {
    color: #b0243f;
    font-size: 13px;
  }
</style>
