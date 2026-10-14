import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { Api } from './contrato';
import type { DatosConfiguracion, EstadoInicial, Rol, Usuaria } from './tipos';

/** Backend real: comandos de Rust por IPC. Los errores llegan como texto en español. */
export class ApiTauri implements Api {
  readonly esDemo = false;

  private llamar<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    return invoke<T>(cmd, args).catch((e: unknown) => {
      throw new Error(typeof e === 'string' ? e : e instanceof Error ? e.message : 'Ocurrió un error inesperado');
    });
  }

  estadoInicial() {
    return this.llamar<EstadoInicial>('estado_inicial');
  }
  configurar(d: DatosConfiguracion) {
    return this.llamar<EstadoInicial>('configurar', { ...d });
  }
  abrirCarpeta(carpeta: string, contrasena: string) {
    return this.llamar<EstadoInicial>('abrir_carpeta', { carpeta, contrasena });
  }
  desbloquear(contrasena: string) {
    return this.llamar<EstadoInicial>('desbloquear', { contrasena });
  }
  async elegirCarpeta(inicial?: string) {
    const r = await open({ directory: true, multiple: false, defaultPath: inicial, title: 'Carpeta de datos de la librería' });
    return typeof r === 'string' ? r : null;
  }
  usuarias() {
    return this.llamar<Usuaria[]>('usuarias');
  }
  iniciarSesion(id: number, pin: string) {
    return this.llamar<Usuaria>('iniciar_sesion', { id, pin });
  }
  cerrarSesion() {
    return this.llamar<void>('cerrar_sesion');
  }
  guardarPreferencias(cambios: Record<string, unknown>) {
    return this.llamar<Record<string, unknown>>('preferencias_guardar', { cambios });
  }
  crearUsuaria(nombre: string, rol: Rol, pin: string) {
    return this.llamar<Usuaria>('usuaria_crear', { nombre, rol, pin });
  }
  cambiarPin(id: number, pin: string) {
    return this.llamar<void>('usuaria_cambiar_pin', { id, pin });
  }
}
