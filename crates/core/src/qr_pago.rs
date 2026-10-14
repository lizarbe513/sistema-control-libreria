//! QR de cobro del negocio (Yape/Plin): una imagen que la Dueña sube en Ajustes y se muestra al cobrar.
//! Vive en la carpeta de datos como `qr-yape.png` (así viaja con la carpeta); la interfaz la recibe como data-URL.

use std::io::Cursor;
use std::path::{Path, PathBuf};

use image::{ImageFormat, ImageReader};

use crate::error::{Error, Result};

const ARCHIVO: &str = "qr-yape.png";
const LADO_MAX: u32 = 1000;
const BYTES_MAX: usize = 12 * 1024 * 1024;

fn ruta(carpeta: &Path) -> PathBuf {
    carpeta.join(ARCHIVO)
}

/// Decodifica, reduce a ≤ 1000 px (un QR necesita nitidez, por eso PNG) y guarda.
pub fn guardar(carpeta: &Path, bytes: &[u8]) -> Result<()> {
    if bytes.len() > BYTES_MAX {
        return Err(Error::Validacion("La imagen es demasiado grande (máximo 12 MB)".into()));
    }
    let img = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| Error::Validacion("No se pudo leer la imagen".into()))?
        .decode()
        .map_err(|_| Error::Validacion("Ese archivo no es una imagen compatible (PNG, JPG, WebP o GIF)".into()))?;
    let img = if img.width() > LADO_MAX || img.height() > LADO_MAX { img.thumbnail(LADO_MAX, LADO_MAX) } else { img };
    let mut salida = Vec::new();
    img.write_to(&mut Cursor::new(&mut salida), ImageFormat::Png)
        .map_err(|e| Error::Validacion(format!("No se pudo guardar el QR: {e}")))?;
    std::fs::write(ruta(carpeta), salida)?;
    Ok(())
}

pub fn quitar(carpeta: &Path) -> Result<()> {
    match std::fs::remove_file(ruta(carpeta)) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.into()),
        _ => Ok(()),
    }
}

/// El QR como `data:image/png;base64,…`, o None si no hay.
pub fn data_url(carpeta: &Path) -> Result<Option<String>> {
    match std::fs::read(ruta(carpeta)) {
        Ok(b) => Ok(Some(format!("data:image/png;base64,{}", base64(&b)))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.into()),
    }
}

fn base64(datos: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut s = String::with_capacity(datos.len().div_ceil(3) * 4);
    for t in datos.chunks(3) {
        let n = (u32::from(t[0]) << 16) | (u32::from(*t.get(1).unwrap_or(&0)) << 8) | u32::from(*t.get(2).unwrap_or(&0));
        s.push(T[(n >> 18) as usize & 63] as char);
        s.push(T[(n >> 12) as usize & 63] as char);
        s.push(if t.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
        s.push(if t.len() > 2 { T[n as usize & 63] as char } else { '=' });
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_estandar() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foo"), "Zm9v");
        assert_eq!(base64(b"hello!"), "aGVsbG8h");
    }

    #[test]
    fn guarda_reduce_y_quita() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(data_url(dir.path()).unwrap(), None);
        let img = image::RgbImage::from_pixel(2000, 1000, image::Rgb([120, 10, 140]));
        let mut png = Vec::new();
        img.write_to(&mut Cursor::new(&mut png), ImageFormat::Png).unwrap();
        guardar(dir.path(), &png).unwrap();
        let guardada = image::open(dir.path().join(ARCHIVO)).unwrap();
        assert_eq!((guardada.width(), guardada.height()), (1000, 500));
        assert!(data_url(dir.path()).unwrap().unwrap().starts_with("data:image/png;base64,"));
        assert!(guardar(dir.path(), b"no es una imagen").is_err());
        quitar(dir.path()).unwrap();
        quitar(dir.path()).unwrap();
        assert_eq!(data_url(dir.path()).unwrap(), None);
    }
}
