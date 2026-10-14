// Tipos compartidos con el backend (Rust → JSON).

export type Rol = 'duena' | 'vendedor';

export interface Usuaria {
  id: number;
  nombre: string;
  rol: Rol;
  avatar: string;
  preferencias: Record<string, unknown>;
}

export type Fase = 'configurar' | 'desbloquear' | 'entrar' | 'sesion';

export interface EstadoInicial {
  fase: Fase;
  carpeta: string | null;
  carpetaSugerida: string;
  tienda: string | null;
  usuaria: Usuaria | null;
  /** false si el equipo no tiene llavero: pedirá la contraseña maestra al abrir. */
  llavero: boolean;
}

export interface DatosConfiguracion {
  carpeta: string;
  contrasena: string;
  tienda: string;
  nombre: string;
  pin: string;
}
