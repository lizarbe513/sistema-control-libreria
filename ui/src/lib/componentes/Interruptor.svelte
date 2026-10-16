<script lang="ts">
  // Fila de ajuste con interruptor a la derecha, como en Android.
  let {
    titulo,
    detalle = '',
    marcado,
    alCambiar,
  }: { titulo: string; detalle?: string; marcado: boolean; alCambiar: (valor: boolean) => void } = $props();
</script>

<label class="fila">
  <div>
    <strong>{titulo}</strong>
    {#if detalle}<span>{detalle}</span>{/if}
  </div>
  <input type="checkbox" checked={marcado} onchange={(e) => alCambiar(e.currentTarget.checked)} />
  <span class="pastilla" aria-hidden="true"></span>
</label>

<style>
  .fila {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 4px;
    cursor: pointer;
  }
  .fila div {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .fila span {
    font-size: 13px;
    color: var(--muted);
  }
  .fila input {
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
