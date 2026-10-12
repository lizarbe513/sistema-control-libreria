<script lang="ts">
  import SelectorFondo from '../componentes/SelectorFondo.svelte';
  import { app, guardar } from '../estado.svelte';

  const OPCIONES = [
    { clave: 'petalosRadio', nombre: 'Pétalos de la radio', detalle: 'Caen pétalos (o chispitas de noche) mientras suena la música' },
    { clave: 'animaciones', nombre: 'Animaciones', detalle: 'Rebote del libro, transiciones y pequeños detalles' },
    { clave: 'rendimiento', nombre: 'Modo rendimiento', detalle: 'Menos partículas y 30 cuadros por segundo, para PCs modestos' },
  ] as const;

  function alternar(clave: (typeof OPCIONES)[number]['clave']) {
    app.calma[clave] = !app.calma[clave];
    guardar('calma', app.calma);
  }
</script>

<div class="ajustes" data-vacio>
  <section class="vidrio bloque">
    <h2 class="titulo-seccion">Fondo animado</h2>
    <p class="atenuado">Elige el ambiente. Interactúa con los espacios vacíos del fondo: ¡cada uno esconde algo!</p>
    <SelectorFondo grande />
  </section>

  <section class="vidrio bloque">
    <h2 class="titulo-seccion">Calma</h2>
    {#each OPCIONES as o}
      <label class="interruptor">
        <div>
          <strong>{o.nombre}</strong>
          <span class="atenuado">{o.detalle}</span>
        </div>
        <input type="checkbox" checked={app.calma[o.clave]} onchange={() => alternar(o.clave)} />
        <span class="pastilla" aria-hidden="true"></span>
      </label>
    {/each}
  </section>
</div>

<style>
  .ajustes {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 4px 4px 24px;
    max-width: 900px;
  }
  .bloque {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .bloque p {
    margin: -6px 0 4px;
    font-size: 14px;
  }
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
  input:focus-visible + .pastilla {
    outline: 3px solid color-mix(in srgb, var(--primary) 55%, transparent);
    outline-offset: 2px;
  }
</style>
