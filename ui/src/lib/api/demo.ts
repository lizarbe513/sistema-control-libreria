// Backend de demostración: corre en el navegador (npm run dev) y en las pruebas automáticas.
// Imita las reglas del backend real (validaciones, roles, límite de intentos). Nada se cifra:
// es solo para ver y probar la interfaz.
import type { Api } from './contrato';
import type { DatosConfiguracion, EstadoInicial, Rol, Usuaria } from './tipos';

interface UsuariaDemo extends Usuaria {
  pin: string;
}
interface Datos {
  configurada: boolean;
  bloqueada: boolean;
  carpeta: string;
  contrasena: string;
  tienda: string;
  usuarias: UsuariaDemo[];
}

const CLAVE = 'demo-libreria';
const SUGERIDA = 'C:\\Users\\Tienda\\Documents\\Librería SIGLO XXI';
const espera = (ms = 120) => new Promise((r) => setTimeout(r, ms));

export class ApiDemo implements Api {
  readonly esDemo = true;
  private d: Datos;
  private sesion: UsuariaDemo | null = null;
  private fallos = new Map<number, { n: number; hasta: number }>();

  constructor() {
    let guardado: Datos | null = null;
    try {
      guardado = JSON.parse(localStorage.getItem(CLAVE) ?? 'null');
    } catch {
      /* sin almacenamiento */
    }
    this.d = guardado ?? { configurada: false, bloqueada: false, carpeta: '', contrasena: '', tienda: '', usuarias: [] };
  }

  private persistir() {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(this.d));
    } catch {
      /* sin almacenamiento */
    }
  }

  private publica(u: UsuariaDemo): Usuaria {
    const { pin: _pin, ...resto } = u;
    return structuredClone(resto);
  }

  private estado(): EstadoInicial {
    const base = { carpeta: null, carpetaSugerida: SUGERIDA, tienda: null, usuaria: null, llavero: true };
    if (!this.d.configurada) return { ...base, fase: 'configurar' };
    if (this.d.bloqueada) return { ...base, fase: 'desbloquear', carpeta: this.d.carpeta, tienda: this.d.tienda };
    return {
      ...base,
      fase: this.sesion ? 'sesion' : 'entrar',
      carpeta: this.d.carpeta,
      tienda: this.d.tienda,
      usuaria: this.sesion ? this.publica(this.sesion) : null,
    };
  }

  private validarPin(pin: string) {
    if (!/^\d{4,6}$/.test(pin)) throw new Error('El PIN debe tener de 4 a 6 números');
  }

  private exigirDuena(accion: string) {
    if (!this.sesion) throw new Error('No tienes permiso para hacer esto sin iniciar sesión');
    if (this.sesion.rol !== 'duena') throw new Error(`No tienes permiso para ${accion}`);
  }

  async estadoInicial() {
    await espera(60);
    return this.estado();
  }

  async configurar(x: DatosConfiguracion) {
    await espera(500);
    if (this.d.configurada) throw new Error('La librería ya está configurada');
    if ([...x.contrasena].length < 8) throw new Error('La contraseña maestra debe tener al menos 8 caracteres');
    if (!x.tienda.trim()) throw new Error('Escribe el nombre de la tienda');
    if (!x.nombre.trim()) throw new Error('Escribe un nombre (hasta 40 letras)');
    this.validarPin(x.pin);
    const duena: UsuariaDemo = { id: 1, nombre: x.nombre.trim(), rol: 'duena', avatar: '', preferencias: {}, pin: x.pin };
    this.d = { configurada: true, bloqueada: false, carpeta: x.carpeta, contrasena: x.contrasena, tienda: x.tienda.trim(), usuarias: [duena] };
    this.sesion = duena;
    this.persistir();
    return this.estado();
  }

  async abrirCarpeta(_carpeta: string, contrasena: string) {
    await espera(400);
    if (!this.d.configurada) throw new Error('Esa carpeta no tiene datos de la librería');
    if (contrasena !== this.d.contrasena) throw new Error('La contraseña maestra no es correcta');
    this.d.bloqueada = false;
    this.persistir();
    return this.estado();
  }

  async desbloquear(contrasena: string) {
    await espera(400);
    if (contrasena !== this.d.contrasena) throw new Error('La contraseña maestra no es correcta');
    this.d.bloqueada = false;
    this.persistir();
    return this.estado();
  }

  async elegirCarpeta(inicial?: string) {
    return inicial ?? SUGERIDA;
  }

  async usuarias() {
    await espera(60);
    return this.d.usuarias.map((u) => ({ ...this.publica(u), preferencias: {} }));
  }

  async iniciarSesion(id: number, pin: string) {
    await espera(250);
    const f = this.fallos.get(id);
    if (f && f.hasta > Date.now()) throw new Error(`Demasiados intentos. Espera ${Math.ceil((f.hasta - Date.now()) / 1000)} segundos y vuelve a probar.`);
    const u = this.d.usuarias.find((x) => x.id === id);
    if (!u) throw new Error('No se encontró a esa persona');
    if (u.pin !== pin) {
      const n = (f && f.hasta <= Date.now() && f.hasta > 0 ? 0 : (f?.n ?? 0)) + 1;
      this.fallos.set(id, { n, hasta: n >= 5 ? Date.now() + 30_000 : 0 });
      if (n >= 5) throw new Error('Demasiados intentos. Espera 30 segundos y vuelve a probar.');
      throw new Error('PIN incorrecto');
    }
    this.fallos.delete(id);
    this.sesion = u;
    return this.publica(u);
  }

  async cerrarSesion() {
    this.sesion = null;
  }

  async guardarPreferencias(cambios: Record<string, unknown>) {
    if (!this.sesion) throw new Error('No tienes permiso para hacer esto sin iniciar sesión');
    Object.assign(this.sesion.preferencias, structuredClone(cambios));
    this.persistir();
    return structuredClone(this.sesion.preferencias);
  }

  async crearUsuaria(nombre: string, rol: Rol, pin: string) {
    await espera();
    this.exigirDuena('crear cuentas');
    const n = nombre.trim();
    if (!n || [...n].length > 40) throw new Error('Escribe un nombre (hasta 40 letras)');
    this.validarPin(pin);
    if (this.d.usuarias.some((u) => u.nombre.toLowerCase() === n.toLowerCase())) throw new Error(`Ya hay alguien llamado «${n}»`);
    const u: UsuariaDemo = { id: Math.max(0, ...this.d.usuarias.map((x) => x.id)) + 1, nombre: n, rol, avatar: '', preferencias: {}, pin };
    this.d.usuarias.push(u);
    this.persistir();
    return this.publica(u);
  }

  async cambiarPin(id: number, pin: string) {
    await espera();
    if (!this.sesion) throw new Error('No tienes permiso para hacer esto sin iniciar sesión');
    if (this.sesion.id !== id && this.sesion.rol !== 'duena') throw new Error('No tienes permiso para cambiar el PIN de otra persona');
    this.validarPin(pin);
    const u = this.d.usuarias.find((x) => x.id === id);
    if (!u) throw new Error('No se encontró a esa persona');
    u.pin = pin;
    this.persistir();
  }
}
