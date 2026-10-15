package pe.sigloxxi.libreria

// Actualizar la app del celular sin cables: busca la versión publicada (latest-android.json), descarga el APK, comprueba
// su huella SHA-256 y abre el instalador de Android (que pide un toque en «Instalar»). Android solo acepta la
// actualización si viene firmada con la misma llave que la app instalada.
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import kotlin.concurrent.thread

@InvokeArg
class ArgsRevisar {
    lateinit var url: String
}

@InvokeArg
class ArgsInstalar {
    lateinit var url: String
    var sha256: String = ""
}

@TauriPlugin
class ActualizarPlugin(private val activity: Activity) : Plugin(activity) {
    private fun abrir(url: String): HttpURLConnection {
        require(url.startsWith("https://")) { "La dirección debe ser https" }
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 15_000
        c.readTimeout = 60_000
        c.instanceFollowRedirects = true
        c.setRequestProperty("User-Agent", "LibreriaSigloXXI-celular")
        return c
    }

    /** Descarga latest-android.json y lo devuelve tal cual (`{ version, notes, apk, sha256 }`). */
    @Command
    fun revisar(invoke: Invoke) {
        val args = invoke.parseArgs(ArgsRevisar::class.java)
        thread {
            try {
                val c = abrir(args.url)
                if (c.responseCode !in 200..299) {
                    invoke.reject("No hay versión publicada (${c.responseCode})")
                    return@thread
                }
                val texto = c.inputStream.bufferedReader().use { it.readText() }
                val r = JSObject(texto)
                invoke.resolve(r)
            } catch (e: Exception) {
                invoke.reject(e.message ?: "No se pudo buscar la actualización")
            }
        }
    }

    /** Descarga el APK, comprueba su huella y abre el instalador. Si falta el permiso de instalar, abre ese ajuste. */
    @Command
    fun instalar(invoke: Invoke) {
        val args = invoke.parseArgs(ArgsInstalar::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !activity.packageManager.canRequestPackageInstalls()) {
            val i = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${activity.packageName}"))
            activity.runOnUiThread { activity.startActivity(i) }
            invoke.reject("permiso")
            return
        }
        thread {
            try {
                val carpeta = File(activity.cacheDir, "updates").apply { mkdirs() }
                carpeta.listFiles()?.forEach { it.delete() }
                val apk = File(carpeta, "libreria.apk")
                val c = abrir(args.url)
                if (c.responseCode !in 200..299) {
                    invoke.reject("No se pudo descargar (${c.responseCode})")
                    return@thread
                }
                val md = MessageDigest.getInstance("SHA-256")
                c.inputStream.use { entrada ->
                    apk.outputStream().use { salida ->
                        val buf = ByteArray(64 * 1024)
                        while (true) {
                            val n = entrada.read(buf)
                            if (n < 0) break
                            md.update(buf, 0, n)
                            salida.write(buf, 0, n)
                        }
                    }
                }
                val huella = md.digest().joinToString("") { "%02x".format(it) }
                if (args.sha256.isNotEmpty() && !huella.equals(args.sha256, ignoreCase = true)) {
                    apk.delete()
                    invoke.reject("La descarga llegó dañada: vuelve a intentarlo")
                    return@thread
                }
                val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", apk)
                val i = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                activity.runOnUiThread { activity.startActivity(i) }
                invoke.resolve()
            } catch (e: Exception) {
                invoke.reject(e.message ?: "No se pudo actualizar")
            }
        }
    }
}
