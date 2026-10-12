// Música relajante generada en vivo con Web Audio (para el prototipo).
// La app real usará pistas libres de derechos empaquetadas + estaciones online opcionales,
// pero conservará el mismo analizador para que los pétalos "bailen" con la música.

export interface Pista {
  nombre: string;
  ambiente: string;
  bpm: number;
  acordes: number[][]; // notas MIDI
  lluvia?: boolean;
  brillo: number; // frecuencia de corte del filtro de los pads
}

export const PISTAS: Pista[] = [
  {
    nombre: 'Té de jazmín',
    ambiente: 'caja de música',
    bpm: 68,
    brillo: 1400,
    acordes: [
      [53, 57, 60, 64],
      [52, 55, 59, 62],
      [50, 53, 57, 60],
      [48, 52, 55, 59],
    ],
  },
  {
    nombre: 'Lluvia en la ventana',
    ambiente: 'lluvia suave',
    bpm: 60,
    brillo: 1100,
    lluvia: true,
    acordes: [
      [57, 60, 64, 67],
      [53, 57, 60, 64],
      [48, 55, 60, 64],
      [55, 59, 62, 64],
    ],
  },
  {
    nombre: 'Páginas al atardecer',
    ambiente: 'piano tibio',
    bpm: 74,
    brillo: 1600,
    acordes: [
      [50, 54, 57, 61],
      [47, 50, 54, 57],
      [43, 50, 54, 59],
      [45, 52, 57, 61],
    ],
  },
  {
    nombre: 'Jardín de cerezos',
    ambiente: 'brisa',
    bpm: 56,
    brillo: 1250,
    acordes: [
      [48, 52, 55, 59, 62],
      [45, 55, 59, 60, 64],
      [41, 53, 57, 60, 64],
      [43, 55, 59, 62, 64],
    ],
  },
];

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

class Musica {
  private ctx?: AudioContext;
  private maestro!: GainNode;
  private mezcla!: GainNode;
  private reverb!: ConvolverNode;
  private analizador!: AnalyserNode;
  private datos!: Uint8Array<ArrayBuffer>;
  private lluvia?: AudioBufferSourceNode;
  private lluviaGain?: GainNode;
  private reloj?: ReturnType<typeof setInterval>;
  private siguienteCompas = 0;
  private compas = 0;
  private pista = PISTAS[0];
  private volumen = 0.6;
  private nivelSuave = 0;
  sonando = false;

  private iniciarContexto() {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.maestro = ctx.createGain();
    this.maestro.gain.value = 0;
    this.mezcla = ctx.createGain();
    this.mezcla.gain.value = 0.9;
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulso(3.2);
    const humedo = ctx.createGain();
    humedo.gain.value = 0.55;
    this.analizador = ctx.createAnalyser();
    this.analizador.fftSize = 512;
    this.datos = new Uint8Array(this.analizador.fftSize);

    this.mezcla.connect(this.maestro);
    this.mezcla.connect(this.reverb);
    this.reverb.connect(humedo);
    humedo.connect(this.maestro);
    this.maestro.connect(this.analizador);
    this.analizador.connect(ctx.destination);
  }

  private impulso(seg: number) {
    const ctx = this.ctx!;
    const largo = ctx.sampleRate * seg;
    const buf = ctx.createBuffer(2, largo, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < largo; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / largo, 2.6);
    }
    return buf;
  }

  private pad(notas: number[], t: number, dur: number) {
    const ctx = this.ctx!;
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.value = this.pista.brillo;
    filtro.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 1.6);
    g.gain.setValueAtTime(0.06, t + dur - 0.4);
    g.gain.linearRampToValueAtTime(0, t + dur + 1.8);
    filtro.connect(g);
    g.connect(this.mezcla);
    for (const n of notas) {
      for (const [tipo, desafino] of [['triangle', -6], ['sine', 7]] as const) {
        const o = ctx.createOscillator();
        o.type = tipo;
        o.frequency.value = hz(n);
        o.detune.value = desafino;
        o.connect(filtro);
        o.start(t);
        o.stop(t + dur + 2);
      }
    }
    // bajo suave
    const b = ctx.createOscillator();
    const bg = ctx.createGain();
    b.type = 'sine';
    b.frequency.value = hz(notas[0] - 12);
    bg.gain.setValueAtTime(0, t);
    bg.gain.linearRampToValueAtTime(0.09, t + 0.5);
    bg.gain.exponentialRampToValueAtTime(0.001, t + dur + 1);
    b.connect(bg);
    bg.connect(this.mezcla);
    b.start(t);
    b.stop(t + dur + 1.2);
  }

  /** Nota tipo caja de música / kalimba. */
  private campana(midi: number, t: number, fuerza = 1) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.07 * fuerza, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 2.2);
    g.connect(this.mezcla);
    const o1 = ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.value = hz(midi);
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = hz(midi) * 3.01;
    const g2 = ctx.createGain();
    g2.gain.value = 0.12;
    o1.connect(g);
    o2.connect(g2);
    g2.connect(g);
    o1.start(t);
    o2.start(t);
    o1.stop(t + 2.3);
    o2.stop(t + 2.3);
  }

  private programar = () => {
    const ctx = this.ctx!;
    const negra = 60 / this.pista.bpm;
    const durCompas = negra * 4;
    while (this.siguienteCompas < ctx.currentTime + 0.4) {
      const t = this.siguienteCompas;
      const acorde = this.pista.acordes[this.compas % this.pista.acordes.length];
      this.pad(acorde, t, durCompas);
      // melodía: corcheas con probabilidad, notas del acorde una o dos octavas arriba
      let anterior = -1;
      for (let i = 0; i < 8; i++) {
        if (Math.random() < (i % 2 ? 0.22 : 0.42)) {
          let n: number;
          do n = acorde[Math.floor(Math.random() * acorde.length)] + (Math.random() < 0.7 ? 12 : 24);
          while (n === anterior && acorde.length > 1);
          anterior = n;
          this.campana(n, t + i * (negra / 2) + Math.random() * 0.02, 0.7 + Math.random() * 0.5);
        }
      }
      this.siguienteCompas += durCompas;
      this.compas++;
    }
  };

  private iniciarLluvia() {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let ultimo = 0;
    for (let i = 0; i < d.length; i++) {
      ultimo = ultimo * 0.97 + (Math.random() * 2 - 1) * 0.03;
      d[i] = ultimo * 6 + (Math.random() < 0.0008 ? Math.random() * 0.6 : 0);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2200;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 2);
    src.connect(f);
    f.connect(g);
    g.connect(this.maestro);
    src.start();
    this.lluvia = src;
    this.lluviaGain = g;
  }

  private detenerLluvia() {
    if (!this.lluvia || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.lluviaGain!.gain.linearRampToValueAtTime(0, t + 0.8);
    this.lluvia.stop(t + 1);
    this.lluvia = undefined;
  }

  async reproducir(indice: number) {
    this.iniciarContexto();
    const ctx = this.ctx!;
    await ctx.resume();
    this.pista = PISTAS[indice % PISTAS.length];
    this.compas = 0;
    this.siguienteCompas = ctx.currentTime + 0.1;
    clearInterval(this.reloj);
    this.reloj = setInterval(this.programar, 80);
    this.programar();
    this.detenerLluvia();
    if (this.pista.lluvia) this.iniciarLluvia();
    this.maestro.gain.cancelScheduledValues(ctx.currentTime);
    this.maestro.gain.setTargetAtTime(this.volumen, ctx.currentTime, 0.6);
    this.sonando = true;
  }

  pausar() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.maestro.gain.cancelScheduledValues(t);
    this.maestro.gain.setTargetAtTime(0, t, 0.25);
    clearInterval(this.reloj);
    this.detenerLluvia();
    this.sonando = false;
  }

  async cambiar(indice: number) {
    if (!this.ctx || !this.sonando) return;
    const t = this.ctx.currentTime;
    this.maestro.gain.setTargetAtTime(0, t, 0.2);
    clearInterval(this.reloj);
    await new Promise((r) => setTimeout(r, 700));
    await this.reproducir(indice);
  }

  fijarVolumen(v: number) {
    this.volumen = v;
    if (this.ctx && this.sonando) this.maestro.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  /** Intensidad actual de la música, 0..1 (suavizada). Se usa para los pétalos. */
  nivel(): number {
    if (!this.ctx || !this.sonando) return (this.nivelSuave *= 0.9);
    this.analizador.getByteTimeDomainData(this.datos);
    let suma = 0;
    for (let i = 0; i < this.datos.length; i++) {
      const v = (this.datos[i] - 128) / 128;
      suma += v * v;
    }
    const rms = Math.sqrt(suma / this.datos.length);
    const objetivo = Math.min(1, rms * 9);
    this.nivelSuave += (objetivo - this.nivelSuave) * 0.15;
    return this.nivelSuave;
  }
}

export const musica = new Musica();
