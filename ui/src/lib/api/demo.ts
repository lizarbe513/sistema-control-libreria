// Backend de demostración: corre en el navegador (npm run dev) y en las pruebas automáticas.
// Imita las reglas del backend real (validaciones, roles, límite de intentos). Nada se cifra:
// es solo para ver y probar la interfaz.
import { LIBROS_DEMO } from '../datos';
import { buscarEn } from '../busqueda';
import { calcular, montoDescuento, redondeoEfectivo } from '../ventas/calculo';
import type { Tienda } from '../tienda/modelo';
import type { Api } from './contrato';
import type {
  CategoriaApi,
  Cliente,
  ClienteEntrada,
  Descuento,
  Metodo,
  DatosConfiguracion,
  EstadoInicial,
  Filtros,
  LibroApi,
  LibroEntrada,
  PlantillaApi,
  PlantillasApi,
  ResultadoLinea,
  ResumenInventario,
  ResumenVentas,
  Rol,
  Sugerencia,
  TipoCliente,
  TipoEntrada,
  Usuaria,
  Venta,
  VentaEntrada,
} from './tipos';

const CATEGORIAS_DEMO: CategoriaApi[] = [
  { clave: 'literarias', nombre: 'Obras literarias', color: '#E9E3FB', patron: 'marco' },
  { clave: 'diccionarios', nombre: 'Diccionarios', color: '#DDEFFB', patron: 'dorado' },
  { clave: 'biblias', nombre: 'Biblias', color: '#DDEFFB', patron: 'dorado' },
  { clave: 'autoayuda', nombre: 'Autoayuda', color: '#FCEFC7', patron: 'rayos' },
  { clave: 'ninos', nombre: 'Cuentos para niños', color: '#FBD3DE', patron: 'confeti' },
  { clave: 'regionales', nombre: 'Cuentos regionales', color: '#FDE2D0', patron: 'andino' },
  { clave: 'preu', nombre: 'Pre-universitarios', color: '#DDF3E4', patron: 'cuadricula' },
  { clave: 'universitarios', nombre: 'Universitarios', color: '#DDF3E4', patron: 'cuadricula' },
  { clave: 'otros', nombre: 'Otros', color: '#F1ECEE', patron: 'ondas' },
];

/** ISBN-13 normalizado (acepta ISBN-10) o null. Igual que `isbn::normalizar` en Rust. */
export function normalizarIsbn(entrada: string): string | null {
  const t = entrada.replace(/[\s\-\u2010-\u2015]/g, '').toUpperCase();
  const c13 = (d: string) => (10 - ([...d].reduce((s, c, i) => s + Number(c) * (i % 2 ? 3 : 1), 0) % 10)) % 10;
  if (/^\d{13}$/.test(t)) return c13(t.slice(0, 12)) === Number(t[12]) ? t : null;
  if (/^\d{9}[\dX]$/.test(t)) {
    const s = [...t].reduce((a, c, i) => a + (10 - i) * (c === 'X' ? 10 : Number(c)), 0);
    if (s % 11) return null;
    const doce = `978${t.slice(0, 9)}`;
    return doce + c13(doce);
  }
  return null;
}

/** Una portada de ejemplo (dibujada) para los resultados de la demostración. */
function portadaDemo(titulo: string, color: string) {
  const t = titulo.replace(/&/g, 'y').replace(/</g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450"><rect width="300" height="450" fill="${color}"/><rect x="18" y="18" width="264" height="414" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="4"/><text x="150" y="215" font-family="sans-serif" font-size="30" font-weight="800" fill="#fff" text-anchor="middle">${t.slice(0, 18)}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** Libros conocidos para la búsqueda en línea de la demostración (sin internet). */
const CATALOGO_DEMO: Omit<ResultadoLinea, 'portadaUrl' | 'fuente'>[] = [
  { titulo: 'El Principito', autor: 'Antoine de Saint-Exupéry', editorial: 'Salamandra', anio: 1943, isbn: '9788498381146', espanol: true },
  { titulo: 'El Principito', autor: 'Antoine de Saint-Exupéry', editorial: 'Emecé', anio: 1999, isbn: '9788478884384', espanol: true },
  { titulo: 'The Little Prince', autor: 'Antoine de Saint-Exupéry', editorial: 'Harcourt', anio: 1943, isbn: '9780156012195', espanol: false },
  { titulo: 'La ciudad y los perros', autor: 'Mario Vargas Llosa', editorial: 'Alfaguara', anio: 1963, isbn: null, espanol: true },
  { titulo: 'Conversación en La Catedral', autor: 'Mario Vargas Llosa', editorial: 'Alfaguara', anio: 1969, isbn: null, espanol: true },
  { titulo: 'Los ríos profundos', autor: 'José María Arguedas', editorial: 'Losada', anio: 1958, isbn: null, espanol: true },
  { titulo: 'Padre Rico, Padre Pobre', autor: 'Robert T. Kiyosaki', editorial: 'Debolsillo', anio: 1997, isbn: null, espanol: true },
  { titulo: 'Paco Yunque', autor: 'César Vallejo', editorial: 'Bruño', anio: 1931, isbn: null, espanol: true },
];

/** Datos de ejemplo para la búsqueda por ISBN del modo demostración (sin internet). */
const ISBN_DEMO: Record<string, Omit<Sugerencia, 'isbn' | 'fuente'>> = {
  '9788437604947': {
    titulo: 'Cien años de soledad',
    autor: 'Gabriel García Márquez',
    editorial: 'Cátedra',
    anio: 2007,
    sinopsis: 'La saga de los Buendía en Macondo, donde lo real y lo maravilloso conviven.',
    portadaUrl: null,
  },
  '9780140328721': {
    titulo: 'Fantastic Mr Fox',
    autor: 'Roald Dahl',
    editorial: 'Puffin',
    anio: 1988,
    sinopsis: 'Un zorro astuto burla a tres granjeros malhumorados.',
    portadaUrl: null,
  },
};

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
  libros?: (LibroApi & { activo?: boolean })[];
  mapa?: Tienda | null;
  plantillas?: PlantillaApi[];
  defecto?: string | null;
  vendedoresEditan?: boolean;
  ventas?: Venta[];
  tipos?: TipoCliente[];
  tope?: number;
  clientes?: Cliente[];
  qrPago?: string | null;
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
    if (!this.d.libros) {
      this.d.libros = structuredClone(LIBROS_DEMO);
      // El Principito con ISBN, para probar la búsqueda por código
      Object.assign(this.d.libros[0], { isbn: '9788498381146', codigo: '9788498381146' });
    }
  }

  private get libros() {
    return (this.d.libros ?? []).filter((l) => l.activo !== false);
  }

  private exigirSesion() {
    if (!this.sesion) throw new Error('No tienes permiso para hacer esto sin iniciar sesión');
    return this.sesion;
  }

  private exigirEditar() {
    const u = this.exigirSesion();
    if (u.rol !== 'duena' && !this.d.vendedoresEditan) throw new Error('No tienes permiso para agregar o editar libros (pídeselo a la Dueña)');
    return u;
  }

  /** Copia para entregar: sin costo si quien consulta no es la Dueña. */
  private entregar(l: LibroApi): LibroApi {
    const c = structuredClone(l) as LibroApi & { activo?: boolean };
    delete c.activo;
    if (this.sesion?.rol !== 'duena') c.costoCent = null;
    return c;
  }

  private buscarId(id: number) {
    const l = this.libros.find((x) => x.id === id);
    if (!l) throw new Error('No se encontró ese libro');
    return l;
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
    // el inventario de ejemplo se conserva (es una demostración)
    this.d = { ...this.d, configurada: true, bloqueada: false, carpeta: x.carpeta, contrasena: x.contrasena, tienda: x.tienda.trim(), usuarias: [duena] };
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
    Object.assign(this.sesion.preferencias, JSON.parse(JSON.stringify(cambios)));
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

  // ── inventario ──
  async categorias() {
    this.exigirSesion();
    return structuredClone(CATEGORIAS_DEMO);
  }

  async buscarLibros(consulta: string, f: Filtros = {}) {
    await espera(40);
    this.exigirSesion();
    const acepta = (l: LibroApi) =>
      (!f.categoria || l.categoria === f.categoria) &&
      (!f.soloConStock || l.stock > 0) &&
      (!f.stockBajo || l.stock <= l.stockMinimo) &&
      (!f.sinUbicacion || !l.ubicacion) &&
      (f.precioMin == null || l.precioCent >= f.precioMin) &&
      (f.precioMax == null || l.precioCent <= f.precioMax);
    const limite = Math.min(f.limite ?? 100, 500);
    const t = consulta.trim();
    const isbn = normalizarIsbn(t);
    const porCodigo = this.libros.find((l) => (isbn && l.isbn === isbn) || l.codigo.toLowerCase() === t.toLowerCase());
    if (porCodigo) return [this.entregar(porCodigo)];
    const nombreCat = (c: string) => CATEGORIAS_DEMO.find((x) => x.clave === c)?.nombre ?? '';
    const base = this.libros.filter(acepta);
    const lista = t
      ? buscarEn(base, t, (l) => ({ titulo: l.titulo, resto: `${l.autor} ${l.editorial} ${nombreCat(l.categoria)} ${l.etiquetas.join(' ')}`, stock: l.stock }))
      : [...base].sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
    return lista.slice(0, limite).map((l) => this.entregar(l));
  }

  async libro(id: number) {
    this.exigirSesion();
    return this.entregar(this.buscarId(id));
  }

  async guardarLibro(entrada: LibroEntrada) {
    await espera(150);
    // copia simple: así se comporta como el backend real, que recibe JSON
    const e: LibroEntrada = JSON.parse(JSON.stringify(entrada));
    const yo = this.exigirEditar();
    const titulo = e.titulo.trim();
    if (!titulo) throw new Error('Escribe el título del libro');
    if (e.precioCent < 0 || (e.costoCent ?? 0) < 0) throw new Error('Los precios no pueden ser negativos');
    if ((e.stock ?? 0) < 0 || (e.stockMinimo ?? 0) < 0) throw new Error('El stock no puede ser negativo');
    if (e.anio != null && (e.anio < 1400 || e.anio > 2100)) throw new Error('Revisa el año de publicación');
    if (!CATEGORIAS_DEMO.some((c) => c.clave === e.categoria)) throw new Error('Elige una categoría');
    if (e.ubicacion && (!e.ubicacion.estante.trim() || e.ubicacion.tramo < 1 || e.ubicacion.repisa < 1))
      throw new Error('Elige el estante, tramo y repisa en la tienda');
    let isbn: string | null = null;
    if (e.isbn?.trim()) {
      isbn = normalizarIsbn(e.isbn);
      if (!isbn) throw new Error('Ese ISBN no es válido. Revisa los números.');
      const otro = this.libros.find((l) => l.isbn === isbn && l.id !== e.id);
      if (otro) throw new Error(`Ya existe un libro con ese ISBN: «${otro.titulo}»`);
    }
    const etiquetas = [...new Map((e.etiquetas ?? []).map((t) => t.trim()).filter(Boolean).map((t) => [t.toLowerCase(), t])).values()];
    const comun = {
      isbn,
      titulo,
      autor: e.autor.trim(),
      editorial: e.editorial.trim(),
      anio: e.anio ?? null,
      sinopsis: e.sinopsis.trim(),
      categoria: e.categoria,
      precioCent: e.precioCent,
      stockMinimo: e.stockMinimo ?? 1,
      ubicacion: e.ubicacion ?? null,
      etiquetas,
      formato: e.formato ?? 'normal',
      actualizado: new Date().toISOString(),
    };
    let l: LibroApi;
    if (e.id == null) {
      const id = Math.max(0, ...(this.d.libros ?? []).map((x) => x.id)) + 1;
      l = {
        ...comun,
        id,
        codigo: isbn ?? `SXXI-${String(id).padStart(6, '0')}`,
        portada: null,
        colorTapa: e.colorTapa ?? ['#6FA8DC', '#E9B949', '#5DBB8A', '#F27A9B', '#7E57C2'][id % 5],
        costoCent: yo.rol === 'duena' ? (e.costoCent ?? 0) : 0,
        stock: e.stock ?? 0,
      };
      this.d.libros!.push(l);
    } else {
      l = this.buscarId(e.id);
      const costo = yo.rol === 'duena' ? (e.costoCent ?? l.costoCent) : l.costoCent;
      Object.assign(l, comun, { costoCent: costo, codigo: isbn ?? (l.codigo.startsWith('SXXI-') ? l.codigo : `SXXI-${String(l.id).padStart(6, '0')}`) });
      if (e.colorTapa) l.colorTapa = e.colorTapa;
    }
    this.persistir();
    return this.entregar(l);
  }

  async desactivarLibro(id: number) {
    this.exigirDuena('dar de baja libros');
    const l = this.buscarId(id) as LibroApi & { activo?: boolean };
    l.activo = false;
    l.isbn = null;
    this.persistir();
  }

  async ajustarStock(id: number, delta: number, motivo: 'ingreso' | 'ajuste') {
    this.exigirEditar();
    if (!delta) throw new Error('Indica cuántos ejemplares sumar o restar');
    if (motivo !== 'ingreso' && motivo !== 'ajuste') throw new Error('Motivo de ajuste desconocido');
    const l = this.buscarId(id);
    if (l.stock + delta < 0) throw new Error(`Solo hay ${l.stock} en stock: no puede quedar negativo`);
    l.stock += delta;
    this.persistir();
    return this.entregar(l);
  }

  async resumenInventario(): Promise<ResumenInventario> {
    this.exigirSesion();
    const ls = this.libros;
    return {
      contadores: {
        libros: ls.length,
        unidades: ls.reduce((s, l) => s + l.stock, 0),
        sinStock: ls.filter((l) => l.stock === 0).length,
        stockBajo: ls.filter((l) => l.stock > 0 && l.stock <= l.stockMinimo).length,
        sinUbicacion: ls.filter((l) => !l.ubicacion).length,
      },
      stockBajo: ls
        .filter((l) => l.stock <= l.stockMinimo)
        .sort((a, b) => a.stock - b.stock || a.titulo.localeCompare(b.titulo))
        .slice(0, 8)
        .map((l) => this.entregar(l)),
    };
  }

  async consultarIsbn(entrada: string): Promise<Sugerencia> {
    await espera(500);
    const isbn = normalizarIsbn(entrada);
    if (!isbn) throw new Error('Ese ISBN no es válido. Revisa los números.');
    const d = ISBN_DEMO[isbn];
    if (!d) throw new Error('En el modo demostración solo hay datos de ejemplo para algunos ISBN (prueba 9788437604947).');
    return { isbn, ...d, fuente: 'Ejemplo (modo demostración)' };
  }

  async buscarEnLinea(titulo: string, autor: string): Promise<ResultadoLinea[]> {
    await espera(600);
    this.exigirEditar();
    if (titulo.trim().length < 2 && autor.trim().length < 2) throw new Error('Escribe al menos el título o el autor');
    const colores = ['#F27A9B', '#6FA8DC', '#5DBB8A', '#E9B949', '#9B87E0'];
    const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const q = (t: string) => norm(t).split(/\s+/).filter(Boolean);
    const qt = q(titulo);
    const qa = q(autor);
    return CATALOGO_DEMO.filter((c) => qt.every((w) => norm(c.titulo).includes(w)) && qa.every((w) => norm(c.autor).includes(w))).map((c, i) => ({
      ...c,
      portadaUrl: i === 1 ? null : portadaDemo(c.titulo, colores[i % colores.length]), // uno sin portada, para probar ese caso
      fuente: 'Ejemplo (modo demostración)',
    }));
  }

  async portadaDesdeUrl(id: number, url: string) {
    this.exigirEditar();
    const l = this.buscarId(id);
    l.portada = url;
    this.persistir();
    return this.entregar(l);
  }

  async portadaDesdeArchivo(id: number, origen: string) {
    return this.portadaDesdeUrl(id, origen);
  }

  async quitarPortada(id: number) {
    this.exigirEditar();
    const l = this.buscarId(id);
    l.portada = null;
    this.persistir();
    return this.entregar(l);
  }

  elegirImagen(): Promise<string | null> {
    // en el navegador: un selector de archivo y la imagen como dataURL
    return new Promise((resolver) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = () => {
        const f = input.files?.[0];
        if (!f) return resolver(null);
        const r = new FileReader();
        r.onload = () => resolver(String(r.result));
        r.onerror = () => resolver(null);
        r.readAsDataURL(f);
      };
      input.click();
    });
  }

  urlPortada(archivo: string) {
    return archivo;
  }

  async prepararPortadas() {}

  async permisoVendedoresEditan(valor?: boolean) {
    this.exigirSesion();
    if (valor !== undefined) {
      this.exigirDuena('cambiar los permisos');
      this.d.vendedoresEditan = valor;
      this.persistir();
    }
    return !!this.d.vendedoresEditan;
  }

  // ── tienda ──
  async cargarTienda() {
    this.exigirSesion();
    return this.d.mapa ? structuredClone(this.d.mapa) : null;
  }

  async guardarTienda(t: Tienda) {
    this.exigirDuena('diseñar la tienda');
    this.d.mapa = JSON.parse(JSON.stringify(t));
    this.persistir();
  }

  async plantillas(): Promise<PlantillasApi> {
    this.exigirSesion();
    return { lista: structuredClone(this.d.plantillas ?? []), defecto: this.d.defecto ?? null };
  }

  async guardarPlantilla(nombre: string, t: Tienda) {
    this.exigirDuena('guardar plantillas de la tienda');
    const p: PlantillaApi = { id: `p${Date.now().toString(36)}`, nombre: nombre.trim() || 'Mi plantilla', tienda: JSON.parse(JSON.stringify(t)) };
    this.d.plantillas = [...(this.d.plantillas ?? []), p];
    this.persistir();
    return structuredClone(p);
  }

  async borrarPlantilla(id: string) {
    this.exigirDuena('borrar plantillas');
    this.d.plantillas = (this.d.plantillas ?? []).filter((p) => p.id !== id);
    if (this.d.defecto === id) this.d.defecto = null;
    this.persistir();
  }

  async fijarPlantillaDefecto(id: string | null) {
    this.exigirDuena('cambiar la plantilla por defecto');
    this.d.defecto = id;
    this.persistir();
  }

  // ── ventas ──
  private get tipos() {
    return (this.d.tipos ??= [
      { id: 1, nombre: 'Público', descuentoPct: 0, activo: true },
      { id: 2, nombre: 'Profesor', descuentoPct: 15, activo: true },
      { id: 3, nombre: 'Mayorista', descuentoPct: 25, activo: true },
    ]);
  }

  async registrarVenta(e: VentaEntrada) {
    const yo = this.exigirSesion();
    if (!e.items.length) throw new Error('Agrega al menos un libro a la venta');
    if (e.items.some((i) => i.cantidad <= 0)) throw new Error('La cantidad debe ser al menos 1');
    const tipo = this.tipos.find((t) => t.id === e.tipoClienteId && t.activo);
    if (!tipo) throw new Error('No se encontró ese tipo de cliente');
    const libros = e.items.map((i) => {
      const l = this.libros.find((x) => x.id === i.libroId);
      if (!l) throw new Error('No se encontró uno de los libros');
      return l;
    });
    const lineas = e.items.map((i, k) => ({ precioCent: libros[k].precioCent, cantidad: i.cantidad, descuento: i.descuento }));
    const calc = calcular(lineas, tipo.descuentoPct, e.descuento);
    if (yo.rol !== 'duena') {
      const tope = this.d.tope ?? 10;
      const pasa = (base: number, d?: Descuento | null) => montoDescuento(base, d) * 100 > base * tope;
      const base = calc.lineas.reduce((s, l) => s + l.totalCent, 0);
      if (lineas.some((l) => pasa(l.precioCent * l.cantidad, l.descuento)) || pasa(base, e.descuento))
        throw new Error(`Los descuentos a mano llegan hasta ${tope} % sin la Dueña`);
    }
    if (!e.pagos.length) throw new Error('Agrega al menos un pago');
    if (e.pagos.some((p) => p.montoCent <= 0)) throw new Error('Cada pago debe ser de más de S/ 0.00');
    const redondeo = redondeoEfectivo(calc.totalPrevioCent, e.pagos);
    const total = calc.totalPrevioCent - redondeo;
    const pagado = e.pagos.reduce((s, p) => s + p.montoCent, 0);
    const soles = (c: number) => `S/ ${(c / 100).toFixed(2)}`;
    if (pagado < total) throw new Error(`Faltan ${soles(total - pagado)} por cobrar`);
    if (pagado > total) throw new Error(`Los pagos suman ${soles(pagado - total)} más que el total`);
    if (e.pagos.some((p) => p.recibidoCent != null && (p.metodo !== 'efectivo' || p.recibidoCent < p.montoCent)))
      throw new Error('Lo recibido en efectivo no puede ser menos que el monto del pago');
    // el stock se valida antes de tocar nada (en Rust, la transacción se deshace)
    e.items.forEach((i, k) => {
      if (libros[k].stock < i.cantidad) throw new Error(`Solo hay ${libros[k].stock} de «${libros[k].titulo}» en stock: no puede quedar negativo`);
    });
    e.items.forEach((i, k) => (libros[k].stock -= i.cantidad));
    const ventas = (this.d.ventas ??= []);
    const cliente = e.clienteId ? (this.d.clientes ?? []).find((c) => c.id === e.clienteId) : undefined;
    if (e.clienteId && !cliente) throw new Error('No se encontró ese cliente');
    const nombreCliente = e.clienteNombre?.trim() || cliente?.nombre || 'Cliente';
    if ([...nombreCliente].length > 80) throw new Error('El nombre del cliente es demasiado largo (máximo 80 letras)');
    const venta: Venta = {
      id: Math.max(0, ...ventas.map((v) => v.id)) + 1,
      fecha: new Date().toISOString(),
      usuarioId: yo.id,
      vendedora: yo.nombre,
      clienteId: cliente?.id ?? null,
      cliente: nombreCliente,
      tipoNombre: tipo.nombre,
      tipoPct: tipo.descuentoPct,
      subtotalCent: calc.subtotalCent,
      descuentoCent: calc.descuentoCent,
      redondeoCent: redondeo,
      totalCent: total,
      anulada: false,
      anuladaFecha: null,
      motivoAnulacion: '',
      items: e.items.map((i, k) => ({
        libroId: i.libroId,
        titulo: libros[k].titulo,
        cantidad: i.cantidad,
        precioUnitCent: libros[k].precioCent,
        descuentoCent: calc.lineas[k].descuentoCent,
        totalCent: calc.lineas[k].totalCent,
      })),
      pagos: e.pagos.map((p) =>
        p.metodo === 'efectivo'
          ? { metodo: p.metodo, montoCent: p.montoCent, recibidoCent: p.recibidoCent ?? p.montoCent, vueltoCent: (p.recibidoCent ?? p.montoCent) - p.montoCent }
          : { metodo: p.metodo, montoCent: p.montoCent, recibidoCent: null, vueltoCent: null },
      ),
    };
    ventas.push(venta);
    this.persistir();
    return structuredClone(venta);
  }

  async anularVenta(id: number, motivo: string) {
    this.exigirDuena('anular ventas');
    if (!motivo.trim()) throw new Error('Escribe el motivo de la anulación');
    const v = (this.d.ventas ?? []).find((x) => x.id === id);
    if (!v) throw new Error('No se encontró esa venta');
    if (v.anulada) throw new Error('Esta venta ya estaba anulada');
    v.anulada = true;
    v.anuladaFecha = new Date().toISOString();
    v.motivoAnulacion = motivo.trim();
    for (const i of v.items) {
      const l = (this.d.libros ?? []).find((x) => x.id === i.libroId);
      if (l) l.stock += i.cantidad;
    }
    this.persistir();
    return structuredClone(v);
  }

  async ventas(desde: string, hasta: string) {
    this.exigirSesion();
    return (this.d.ventas ?? [])
      .filter((v) => v.fecha >= desde && v.fecha < hasta)
      .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.id - a.id))
      .map((v) => structuredClone(v));
  }

  async resumenVentas(desde: string, hasta: string): Promise<ResumenVentas> {
    this.exigirSesion();
    const del = (this.d.ventas ?? []).filter((v) => v.fecha >= desde && v.fecha < hasta);
    const ok = del.filter((v) => !v.anulada);
    const por = new Map<Metodo, number>();
    for (const p of ok.flatMap((v) => v.pagos)) por.set(p.metodo, (por.get(p.metodo) ?? 0) + p.montoCent);
    return {
      ventas: ok.length,
      anuladas: del.length - ok.length,
      unidades: ok.reduce((s, v) => s + v.items.reduce((n, i) => n + i.cantidad, 0), 0),
      totalCent: ok.reduce((s, v) => s + v.totalCent, 0),
      porMetodo: [...por].sort(([a], [b]) => a.localeCompare(b)).map(([metodo, montoCent]) => ({ metodo, montoCent })),
    };
  }

  async tiposCliente(todos = false) {
    this.exigirSesion();
    return this.tipos.filter((t) => todos || t.activo).map((t) => ({ ...t }));
  }

  async guardarTipoCliente(e: TipoEntrada) {
    this.exigirDuena('cambiar los tipos de cliente');
    const nombre = e.nombre.trim();
    if (!nombre) throw new Error('Escribe el nombre del tipo de cliente');
    if (e.descuentoPct < 0 || e.descuentoPct > 100) throw new Error('El descuento debe estar entre 0 % y 100 %');
    const tipos = this.tipos;
    const antes = structuredClone(tipos);
    if (e.id) {
      const t = tipos.find((x) => x.id === e.id);
      if (!t) throw new Error('No se encontró ese tipo de cliente');
      Object.assign(t, { nombre, descuentoPct: e.descuentoPct, activo: e.activo });
    } else tipos.push({ id: Math.max(0, ...tipos.map((t) => t.id)) + 1, nombre, descuentoPct: e.descuentoPct, activo: e.activo });
    if (!tipos.some((t) => t.activo)) {
      this.d.tipos = antes;
      throw new Error('Debe quedar al menos un tipo de cliente activo');
    }
    this.persistir();
    return this.tipos.map((t) => ({ ...t }));
  }

  async topeDescuento(valor?: number) {
    this.exigirSesion();
    if (valor !== undefined) {
      this.exigirDuena('cambiar el tope de descuento');
      if (valor < 0 || valor > 100) throw new Error('El tope debe estar entre 0 % y 100 %');
      this.d.tope = valor;
      this.persistir();
    }
    return this.d.tope ?? 10;
  }

  async buscarClientes(texto: string) {
    this.exigirSesion();
    const q = texto.trim().toLowerCase();
    return (this.d.clientes ?? [])
      .filter((c) => c.nombre.toLowerCase().includes(q) || c.telefono.includes(q))
      .slice(-20)
      .reverse();
  }

  async crearCliente(e: ClienteEntrada) {
    this.exigirSesion();
    if (!e.nombre.trim()) throw new Error('Escribe el nombre del cliente');
    const cs = (this.d.clientes ??= []);
    const c: Cliente = { id: Math.max(0, ...cs.map((x) => x.id)) + 1, nombre: e.nombre.trim(), telefono: (e.telefono ?? '').trim(), tipoClienteId: e.tipoClienteId ?? null };
    cs.push(c);
    this.persistir();
    return { ...c };
  }

  async qrPago() {
    this.exigirSesion();
    return this.d.qrPago ?? null;
  }

  async guardarQrPago(origen: string) {
    this.exigirDuena('cambiar el QR de pago');
    if (!origen.startsWith('data:image/')) throw new Error('Ese archivo no es una imagen compatible (PNG, JPG, WebP o GIF)');
    this.d.qrPago = origen;
    this.persistir();
    return origen;
  }

  async quitarQrPago() {
    this.exigirDuena('cambiar el QR de pago');
    this.d.qrPago = null;
    this.persistir();
  }
}
