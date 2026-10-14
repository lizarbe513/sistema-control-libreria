import type { DatosConfiguracion, EstadoInicial, Rol, Usuaria } from './tipos';

/** Lo que la interfaz puede pedirle al backend. Dos implementaciones: Tauri (real) y Demo (navegador). */
export interface Api {
  readonly esDemo: boolean;
  estadoInicial(): Promise<EstadoInicial>;
  configurar(d: DatosConfiguracion): Promise<EstadoInicial>;
  abrirCarpeta(carpeta: string, contrasena: string): Promise<EstadoInicial>;
  desbloquear(contrasena: string): Promise<EstadoInicial>;
  /** Diálogo del sistema para elegir una carpeta (null si se cancela). */
  elegirCarpeta(inicial?: string): Promise<string | null>;
  usuarias(): Promise<Usuaria[]>;
  iniciarSesion(id: number, pin: string): Promise<Usuaria>;
  cerrarSesion(): Promise<void>;
  guardarPreferencias(cambios: Record<string, unknown>): Promise<Record<string, unknown>>;
  crearUsuaria(nombre: string, rol: Rol, pin: string): Promise<Usuaria>;
  cambiarPin(id: number, pin: string): Promise<void>;
}
