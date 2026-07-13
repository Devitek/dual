package expo.modules.videopipcomposer

import android.Manifest
import android.os.Build
import androidx.core.app.ActivityCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Module Expo : lance la composition PiP vidéo dans un Foreground Service
 * (survit à l'arrière-plan / au swipe), émet la progression au JS et résout la
 * Promise à la fin (avec l'URI galerie du fichier déjà sauvegardé nativement).
 */
class VideoPipComposerModule : Module(), PipComposerBus.Listener {
  private val promises = ConcurrentHashMap<String, Promise>()

  override fun definition() = ModuleDefinition {
    Name("VideoPipComposer")
    Events("onProgress", "onComplete", "onError", "onVolumeKey")

    OnCreate {
      PipComposerBus.listener = this@VideoPipComposerModule
      // Émetteur des touches matérielles (obturateur/zoom) vers le JS.
      KeyEventInterceptor.onKey = { key ->
        this@VideoPipComposerModule.sendEvent("onVolumeKey", mapOf("key" to key))
      }
    }
    OnActivityEntersForeground {
      appContext.currentActivity?.let { KeyEventInterceptor.install(it) }
    }
    OnActivityEntersBackground {
      KeyEventInterceptor.uninstall()
    }
    OnDestroy {
      KeyEventInterceptor.uninstall()
      KeyEventInterceptor.onKey = null
      if (PipComposerBus.listener === this@VideoPipComposerModule) PipComposerBus.listener = null
    }

    // Mode « effectif » des touches de volume : "off" | "volume" | "shutter" | "zoom".
    AsyncFunction("setVolumeKeyMode") { mode: String ->
      KeyEventInterceptor.mode = KeyEventInterceptor.parseMode(mode)
    }

    AsyncFunction("composePip") {
        primaryPath: String,
        secondaryPath: String,
        corner: String,
        bitRate: Double,
        saveOriginals: Boolean,
        promise: Promise ->

      val context = appContext.reactContext
      if (context == null) {
        promise.reject("E_NO_CONTEXT", "Contexte natif indisponible", null)
        return@AsyncFunction
      }
      val jobId = UUID.randomUUID().toString()
      promises[jobId] = promise
      PipComposerService.startVideo(
        context = context,
        jobId = jobId,
        primaryPath = primaryPath,
        secondaryPath = secondaryPath,
        corner = corner,
        bitRate = bitRate.toInt(),
        saveOriginals = saveOriginals,
      )
    }

    AsyncFunction("composePipPhoto") {
        primaryPath: String,
        secondaryPath: String,
        corner: String,
        canvasWidth: Double,
        saveOriginals: Boolean,
        promise: Promise ->

      val context = appContext.reactContext
      if (context == null) {
        promise.reject("E_NO_CONTEXT", "Contexte natif indisponible", null)
        return@AsyncFunction
      }
      val jobId = UUID.randomUUID().toString()
      promises[jobId] = promise
      PipComposerService.startPhoto(
        context = context,
        jobId = jobId,
        primaryPath = primaryPath,
        secondaryPath = secondaryPath,
        corner = corner,
        canvasWidth = canvasWidth.toInt(),
        saveOriginals = saveOriginals,
      )
    }

    AsyncFunction("requestNotificationsPermission") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        appContext.currentActivity?.let { activity ->
          ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 8123)
        }
      }
    }
  }

  override fun onProgress(jobId: String, fraction: Double) {
    sendEvent("onProgress", mapOf("jobId" to jobId, "progress" to fraction))
  }

  override fun onComplete(jobId: String, uri: String) {
    sendEvent("onComplete", mapOf("jobId" to jobId, "uri" to uri))
    promises.remove(jobId)?.resolve(uri)
  }

  override fun onError(jobId: String, message: String) {
    sendEvent("onError", mapOf("jobId" to jobId, "message" to message))
    promises.remove(jobId)?.reject("E_PIP", message, null)
  }
}
