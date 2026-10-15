// La app del celular: no tiene base de datos propia. Cada orden viaja al PC por el WiFi de la tienda, por HTTPS con el
// certificado del PC (se reconoce por su huella, que lleva el QR) y con el token de este celular.
import { invoke } from '@tauri-apps/api/core';
import { ApiTauri } from './tauri';
import type { EstadoInicial } from './tipos';

export interface ConfigLan {
  /** Direcciones del PC (puede tener más de una red). */
  hosts: string[];
  puerto: number;
  token: string;
  /** SHA-256 del certificado del PC. */
  huella: string;
  tienda: string;
}

const CLAVE = 'siglo-lan';
const enTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function leerConfigLan(): ConfigLan | null {
  try {
    const c = JSON.parse(localStorage.getItem(CLAVE) ?? 'null') as ConfigLan | null;
    return c && c.token && c.hosts?.length ? c : null;
  } catch {
    return null;
  }
}

function guardarConfigLan(c: ConfigLan | null) {
  try {
    if (c) localStorage.setItem(CLAVE, JSON.stringify(c));
    else localStorage.removeItem(CLAVE);
  } catch {
    /* sin almacenamiento */
  }
}

/** Lo que lleva el QR: `siglo://vincular?h=ip1,ip2&p=47321&c=CODIGO&f=HUELLA&n=Tienda`. */
export function leerQr(texto: string): { hosts: string[]; puerto: number; codigo: string; huella: string; tienda: string } {
  const t = texto.trim();
  if (!t.startsWith('siglo://vincular?')) throw new Error('Ese código QR no es de la librería. Escanea el que muestra el PC en Ajustes → Celulares.');
  const q = new URLSearchParams(t.slice('siglo://vincular?'.length));
  const hosts = (q.get('h') ?? '').split(',').filter(Boolean);
  const puerto = Number(q.get('p'));
  const codigo = q.get('c') ?? '';
  const huella = q.get('f') ?? '';
  if (!hosts.length || !puerto || !codigo) throw new Error('Ese código QR está incompleto. Pide uno nuevo en el PC.');
  return { hosts, puerto, codigo, huella, tienda: q.get('n') ?? '' };
}

class ErrorLan extends Error {
  vincular = false;
  /** Ninguna dirección respondió (o respondió otro equipo): quizá el PC cambió de IP. */
  get sinRed() {
    return /^(No se pudo conectar|El certificado)/.test(this.message);
  }
}

/** Una petición al PC, probando cada dirección. En la app va por Rust (que fija el certificado); en un navegador, por fetch. */
async function pedir(cfg: { hosts: string[]; puerto: number; huella: string }, metodo: 'GET' | 'POST', ruta: string, cuerpo: unknown, token?: string): Promise<{ hostUsado: string; datos: any }> {
  if (enTauri) {
    try {
      return await invoke('lan_pedir', { hosts: cfg.hosts, puerto: cfg.puerto, huella: cfg.huella, metodo, ruta, cuerpo: cuerpo ?? null, token: token ?? null });
    } catch (e) {
      const m = typeof e === 'string' ? e : e instanceof Error ? e.message : 'No se pudo hablar con el PC';
      const err = new ErrorLan(m.replace(/^\u0001vincular\|/, ''));
      err.vincular = m.startsWith('\u0001vincular|');
      throw err;
    }
  }
  let ultimo: unknown;
  for (const host of cfg.hosts) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 5000);
      const r = await fetch(`https://${host}:${cfg.puerto}${ruta}`, {
        method: metodo,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: cuerpo === undefined || cuerpo === null ? undefined : JSON.stringify(cuerpo),
        signal: ctl.signal,
      }).finally(() => clearTimeout(t));
      const datos = await r.json().catch(() => null);
      if (!r.ok) {
        const err = new ErrorLan(datos?.error ?? `El PC respondió ${r.status}`);
        err.vincular = !!datos?.vincular;
        throw err;
      }
      return { hostUsado: host, datos };
    } catch (e) {
      if (e instanceof ErrorLan) throw e;
      ultimo = e;
    }
  }
  throw new ErrorLan(ultimo ? 'No se pudo conectar con el PC. ¿Está encendido, con la app abierta y en el mismo WiFi?' : 'No hay direcciones del PC');
}

const estadoSin = (fase: EstadoInicial['fase'], tienda: string | null, error?: string): EstadoInicial => ({ fase, carpeta: null, carpetaSugerida: '', tienda, usuaria: null, llavero: true, error });

export class ApiLan extends ApiTauri {
  readonly esCelular = true;
  private cfg: ConfigLan | null = leerConfigLan();

  private ultimaBusqueda = 0;

  /** Si el router le cambió la IP al PC: lo busca en la misma red por la huella de su certificado (como mucho cada 20 s). */
  private async redescubrir(): Promise<boolean> {
    const cfg = this.cfg;
    if (!cfg || !enTauri || Date.now() - this.ultimaBusqueda < 20_000) return false;
    this.ultimaBusqueda = Date.now();
    window.dispatchEvent(new CustomEvent('lan-buscando'));
    try {
      const host = await invoke<string | null>('lan_descubrir', { hosts: cfg.hosts, puerto: cfg.puerto, huella: cfg.huella });
      if (!host) return false;
      this.cfg = { ...cfg, hosts: [host, ...cfg.hosts.filter((h) => h !== host)] };
      guardarConfigLan(this.cfg);
      return true;
    } catch {
      return false;
    }
  }

  protected async llamar<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    if (!this.cfg) throw new Error('Este celular todavía no está vinculado con el PC');
    try {
      return await this.llamarUnaVez<T>(cmd, args);
    } catch (e) {
      // sin conexión con ninguna dirección conocida: quizá el PC cambió de IP
      if (e instanceof ErrorLan && e.sinRed && (await this.redescubrir())) {
        return this.llamarUnaVez<T>(cmd, args);
      }
      throw e;
    }
  }

  private async llamarUnaVez<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    const cfg = this.cfg;
    if (!cfg) throw new Error('Este celular todavía no está vinculado con el PC');
    try {
      const { hostUsado, datos } = await pedir(cfg, 'POST', `/api/rpc/${cmd}`, args ?? {}, cfg.token);
      if (hostUsado !== cfg.hosts[0]) {
        // la dirección que funcionó pasa al frente
        this.cfg = { ...cfg, hosts: [hostUsado, ...cfg.hosts.filter((h) => h !== hostUsado)] };
        guardarConfigLan(this.cfg);
      }
      return datos as T;
    } catch (e) {
      if (e instanceof ErrorLan && e.vincular) {
        this.desvincular();
        window.dispatchEvent(new CustomEvent('lan-desvinculado'));
      }
      throw e;
    }
  }

  override async estadoInicial(): Promise<EstadoInicial> {
    if (!this.cfg) return estadoSin('vincular', null);
    try {
      return await this.llamar<EstadoInicial>('estado_inicial');
    } catch (e) {
      if (!this.cfg) return estadoSin('vincular', null);
      return estadoSin('sinConexion', this.cfg.tienda, (e as Error).message);
    }
  }

  private async vincular(hosts: string[], puerto: number, codigo: string, huella: string, nombre: string): Promise<EstadoInicial> {
    // el PC se reconoce primero: si la huella del certificado no es la del QR, no se manda el código
    const ping = await pedir({ hosts, puerto, huella }, 'GET', '/api/ping', null);
    const huellaReal: string = ping.datos?.huella ?? '';
    if (huella && huellaReal !== huella) throw new Error('Este no es el PC del código QR (el certificado no coincide). Escanea el código del PC de la tienda.');
    const r = await pedir({ hosts: [ping.hostUsado], puerto, huella: huellaReal }, 'POST', '/api/vincular', { codigo, nombre });
    this.cfg = { hosts: [ping.hostUsado, ...hosts.filter((h) => h !== ping.hostUsado)], puerto, token: r.datos.token, huella: huellaReal, tienda: r.datos.tienda ?? ping.datos?.tienda ?? '' };
    guardarConfigLan(this.cfg);
    return this.estadoInicial();
  }

  override vincularConQr(texto: string, nombre: string) {
    const q = leerQr(texto);
    return this.vincular(q.hosts, q.puerto, q.codigo, q.huella, nombre);
  }

  /** Sin QR: se confía en el certificado que presenta el PC en este momento (queda fijado para las próximas veces). */
  override vincularManual(direccion: string, codigo: string, nombre: string) {
    const d = direccion.trim().replace(/^https?:\/\//, '');
    const [host, p] = d.split(':');
    if (!host || !codigo.trim()) throw new Error('Escribe la dirección del PC y el código');
    return this.vincular([host], Number(p) || 47321, codigo.trim(), '', nombre);
  }

  override desvincular() {
    this.cfg = null;
    guardarConfigLan(null);
  }

  override urlPortada(archivo: string): string {
    const c = this.cfg;
    if (!c) return '';
    const host = c.hosts[0];
    if (enTauri) {
      // la app las pide por un protocolo propio (lan://) que Rust atiende fijando el certificado del PC
      const datos = btoa(JSON.stringify({ h: c.hosts, p: c.puerto, t: c.token, f: c.huella })).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
      const base = /Android|Windows/i.test(navigator.userAgent) ? 'http://lan.localhost' : 'lan://localhost';
      return `${base}/${datos}/${archivo}`;
    }
    return `https://${host}:${c.puerto}/portadas/${encodeURIComponent(archivo)}?t=${c.token}`;
  }

  override async prepararPortadas() {}

  override async avisarWhatsapp(id: number) {
    const [encargo, url] = await this.llamar<[import('./tipos').Encargo, string]>('encargo_avisar_whatsapp', { id });
    // en el celular se abre WhatsApp en el propio celular
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
    } catch {
      window.open(url, '_blank', 'noopener');
    }
    return { encargo, url };
  }

  /** En el celular la foto viaja como data-URL (el PC no puede leer una ruta del teléfono). */
  override portadaDesdeArchivo(id: number, origen: string) {
    return this.llamar<import('./tipos').LibroApi>('portada_desde_datos', { id, datos: origen });
  }
}
