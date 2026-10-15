//! Portadas: se guardan en `portadas/` como JPEG de hasta 600 px (desde internet o desde un archivo).

use std::io::Cursor;
use std::path::Path;

use image::ImageReader;
use image::codecs::jpeg::JpegEncoder;

use crate::error::{Error, Result};

const LADO_MAX: u32 = 600;
const BYTES_MAX: usize = 12 * 1024 * 1024;

/// Decodifica, reduce a ≤ 600 px y guarda como `<id>-<n>.jpg`. Borra las versiones anteriores de ese libro.
/// Devuelve el nombre del archivo.
pub fn guardar(dir: &Path, id: i64, bytes: &[u8]) -> Result<String> {
    if bytes.len() > BYTES_MAX {
        return Err(Error::Validacion("La imagen es demasiado grande (máximo 12 MB)".into()));
    }
    let img = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| Error::Validacion("No se pudo leer la imagen".into()))?
        .decode()
        .map_err(|_| Error::Validacion("Ese archivo no es una imagen compatible (JPG, PNG, WebP o GIF)".into()))?;
    let img = if img.width() > LADO_MAX || img.height() > LADO_MAX { img.thumbnail(LADO_MAX, LADO_MAX) } else { img };
    let mut salida = Vec::new();
    JpegEncoder::new_with_quality(&mut salida, 86)
        .encode_image(&img.to_rgb8())
        .map_err(|e| Error::Validacion(format!("No se pudo guardar la portada: {e}")))?;
    std::fs::create_dir_all(dir)?;
    let prefijo = format!("{id}-");
    let mut n = 1;
    for e in std::fs::read_dir(dir)?.flatten() {
        let nombre = e.file_name().to_string_lossy().into_owned();
        if let Some(resto) = nombre.strip_prefix(&prefijo).and_then(|r| r.strip_suffix(".jpg")) {
            if let Ok(k) = resto.parse::<u32>() {
                n = n.max(k + 1);
            }
            let _ = std::fs::remove_file(e.path());
        }
    }
    let nombre = format!("{id}-{n}.jpg");
    std::fs::write(dir.join(&nombre), salida)?;
    Ok(nombre)
}

/// Descarga una imagen (solo https/http, con tope de tamaño).
pub async fn descargar(url: &str) -> Result<Vec<u8>> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err(Error::Validacion("Dirección de imagen no válida".into()));
    }
    let r = crate::isbn::cliente()?
        .get(url)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|_| Error::Red("No se pudo descargar la portada (¿hay internet?)".into()))?;
    let bytes = r.bytes().await.map_err(|_| Error::Red("La descarga de la portada se cortó".into()))?;
    if bytes.len() > BYTES_MAX {
        return Err(Error::Validacion("La imagen es demasiado grande".into()));
    }
    Ok(bytes.to_vec())
}

/// Imagen que llega como texto (data-URL o base64 pelado), p. ej. una foto tomada con el celular.
pub fn desde_base64(texto: &str) -> Result<Vec<u8>> {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let datos = texto.split_once(",").map(|(_, d)| d).unwrap_or(texto);
    if datos.len() > BYTES_MAX * 4 / 3 + 16 {
        return Err(Error::Validacion("La imagen es demasiado grande (máximo 12 MB)".into()));
    }
    let mut salida = Vec::with_capacity(datos.len() * 3 / 4);
    let (mut acc, mut bits) = (0u32, 0u32);
    for c in datos.bytes().filter(|c| !c.is_ascii_whitespace() && *c != b'=') {
        let c = match c {
            b'-' => b'+',
            b'_' => b'/',
            otro => otro,
        };
        let v = T.iter().position(|x| *x == c).ok_or_else(|| Error::Validacion("La imagen llegó dañada".into()))? as u32;
        acc = (acc << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            salida.push((acc >> bits) as u8);
            acc &= (1 << bits) - 1;
        }
    }
    Ok(salida)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageFormat, RgbImage};

    fn png(w: u32, h: u32) -> Vec<u8> {
        let mut v = Vec::new();
        RgbImage::from_pixel(w, h, image::Rgb([242, 122, 155])).write_to(&mut Cursor::new(&mut v), ImageFormat::Png).unwrap();
        v
    }

    #[test]
    fn reduce_y_reemplaza() {
        let dir = tempfile::tempdir().unwrap();
        let a = guardar(dir.path(), 7, &png(1200, 1800)).unwrap();
        assert_eq!(a, "7-1.jpg");
        let img = image::open(dir.path().join(&a)).unwrap();
        assert_eq!((img.width(), img.height()), (400, 600));
        let b = guardar(dir.path(), 7, &png(100, 150)).unwrap();
        assert_eq!(b, "7-2.jpg");
        assert!(!dir.path().join(&a).exists(), "la versión anterior se borra");
        assert!(guardar(dir.path(), 8, b"no soy una imagen").is_err());
    }

    #[test]
    fn base64_y_data_url() {
        assert_eq!(desde_base64("aGVsbG8h").unwrap(), b"hello!");
        assert_eq!(desde_base64("data:image/jpeg;base64,aGVs\nbG8h").unwrap(), b"hello!");
        assert_eq!(desde_base64("Zg==").unwrap(), b"f");
        assert!(desde_base64("no$vale").is_err());
    }
}
