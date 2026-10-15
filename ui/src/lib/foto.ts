// Foto con la cámara del celular (o una imagen elegida): se reduce a 1600 px en JPEG antes de enviarla al PC.
export function tomarFoto(): Promise<string | null> {
  return new Promise((resolver) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    document.body.appendChild(input);
    input.onchange = async () => {
      const f = input.files?.[0];
      input.remove();
      resolver(f ? await reducir(f) : null);
    };
    input.oncancel = () => {
      input.remove();
      resolver(null);
    };
    input.click();
  });
}

export async function reducir(archivo: Blob, lado = 1600): Promise<string> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error('No se pudo leer la foto'));
      i.src = url;
    });
    const k = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}
