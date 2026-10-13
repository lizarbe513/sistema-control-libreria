<script lang="ts">
  import SelectorFondo from '../componentes/SelectorFondo.svelte';
  import { app, avisar, guardar, type AnimLibro } from '../estado.svelte';

  const ANIMACIONES: { id: AnimLibro; nombre: string; emoji: string }[] = [
    { id: 'aleatoria', nombre: 'Sorpresa', emoji: '🎲' },
    { id: 'caida', nombre: 'Caída con rebote', emoji: '⬇️' },
    { id: 'estante', nombre: 'Sale del estante', emoji: '📚' },
    { id: 'pluma', nombre: 'Pluma', emoji: '🪶' },
    { id: 'trompo', nombre: 'Trompo', emoji: '🌀' },
    { id: 'pop', nombre: 'Pop elástico', emoji: '🫧' },
    { id: 'volteo', nombre: 'Vuelta de campana', emoji: '🤸' },
  ];

  function nombrar(e: Event) {
    app.usuario = (e.currentTarget as HTMLInputElement).value;
    guardar('usuario', app.usuario);
  }
  function confirmarNombre(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    app.usuario = el.value.trim() || 'Rosa';
    el.value = app.usuario;
    guardar('usuario', app.usuario);
  }
  function elegirAnimacion(id: AnimLibro) {
    app.calma.animLibro = id;
    guardar('calma', app.calma);
    avisar('Se verá la próxima vez que busques un libro');
  }

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
    <h2 class="titulo-seccion">Mi perfil</h2>
    <label class="campo">
      <span class="atenuado">¿Cómo te llamas?</span>
      <input type="text" maxlength="24" value={app.usuario} oninput={nombrar} onblur={confirmarNombre} onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
    </label>
  </section>

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

  <section class="vidrio bloque">
    <h2 class="titulo-seccion">Cómo aparece el libro</h2>
    <p class="atenuado">Elige una entrada, o deja «Sorpresa» para que cambie cada vez.</p>
    <div class="anims">
      {#each ANIMACIONES as a}
        <button class="chip" class:activo={app.calma.animLibro === a.id} onclick={() => elegirAnimacion(a.id)}>{a.emoji} {a.nombre}</button>
      {/each}
    </div>
  </section>
</div>

<style>
  .campo {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .campo input {
    font: inherit;
    font-weight: 700;
    font-size: 18px;
    padding: 12px 16px;
    border-radius: 16px;
    border: 2px solid var(--linea);
    background: var(--surface);
    color: var(--text);
    max-width: 320px;
    user-select: text;
  }
  .campo input:focus {
    outline: none;
    border-color: var(--primary);
  }
  .anims .chip {
    padding: 9px 14px;
    font-size: 14px;
    background: var(--surface);
    border: 2px solid transparent;
    cursor: pointer;
    transition: transform 0.15s, border-color 0.2s;
  }
  .anims .chip:hover {
    transform: translateY(-1px);
  }
  .anims .chip.activo {
    border-color: var(--primary);
    background: var(--primary-soft);
    color: var(--primary-strong);
  }
  .anims {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
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
