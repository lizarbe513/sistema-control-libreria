package pe.sigloxxi.libreria

// Lee el texto de un recorte de la portada (lo que se marcó con el dedo: el título o el autor) en el mismo teléfono, con
// ML Kit: sin internet y sin guardar la imagen. Devuelve el texto en orden de lectura, en una sola línea.
import android.app.Activity
import android.graphics.BitmapFactory
import android.util.Base64
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions

@InvokeArg
class ArgsReconocer {
    lateinit var imagen: String
}

@TauriPlugin
class OcrPlugin(private val activity: Activity) : Plugin(activity) {
    private val lector by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }

    @Command
    fun reconocer(invoke: Invoke) {
        val args = invoke.parseArgs(ArgsReconocer::class.java)
        val bytes = try {
            Base64.decode(args.imagen.substringAfter(","), Base64.DEFAULT)
        } catch (e: IllegalArgumentException) {
            invoke.reject("La imagen no llegó bien")
            return
        }
        val foto = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        if (foto == null) {
            invoke.reject("No se pudo abrir la foto")
            return
        }
        lector.process(InputImage.fromBitmap(foto, 0))
            .addOnSuccessListener { texto ->
                // de arriba hacia abajo y de izquierda a derecha: un título en dos renglones queda en una sola línea
                val lineas = texto.textBlocks.flatMap { it.lines }
                    .sortedWith(compareBy({ it.boundingBox?.top ?: 0 }, { it.boundingBox?.left ?: 0 }))
                    .map { it.text.trim() }
                    .filter { it.isNotEmpty() }
                val lista = JSArray()
                lineas.forEach { lista.put(it) }
                val r = JSObject()
                r.put("texto", lineas.joinToString(" "))
                r.put("lineas", lista)
                invoke.resolve(r)
            }
            .addOnFailureListener { e -> invoke.reject(e.message ?: "No se pudo leer el texto") }
            .addOnCompleteListener { foto.recycle() }
    }
}
