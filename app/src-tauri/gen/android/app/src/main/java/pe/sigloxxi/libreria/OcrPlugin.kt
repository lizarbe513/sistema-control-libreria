package pe.sigloxxi.libreria

// Lee el texto de una foto (la portada de un libro) en el mismo teléfono, con ML Kit: sin internet y sin guardar la
// imagen. Devuelve cada línea con su altura en píxeles: las letras más grandes suelen ser el título.
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
                val lineas = JSArray()
                for (bloque in texto.textBlocks) {
                    for (linea in bloque.lines) {
                        val l = JSObject()
                        l.put("texto", linea.text)
                        l.put("alto", linea.boundingBox?.height() ?: 0)
                        l.put("y", linea.boundingBox?.top ?: 0)
                        lineas.put(l)
                    }
                }
                val r = JSObject()
                r.put("lineas", lineas)
                invoke.resolve(r)
            }
            .addOnFailureListener { e -> invoke.reject(e.message ?: "No se pudo leer el texto") }
            .addOnCompleteListener { foto.recycle() }
    }
}
