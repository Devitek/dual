package expo.modules.videopipcomposer

import android.Manifest
import android.app.StatusBarManager
import android.content.ComponentName
import android.content.Intent
import android.graphics.drawable.Icon
import android.net.Uri
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
        params: VideoParams,
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
        layout = params.layout,
        corner = params.corner,
        insetX = params.insetX.toFloat(),
        insetY = params.insetY.toFloat(),
        insetW = params.insetW.toFloat(),
        watermark = params.watermark,
        bitRate = params.bitRate.toInt(),
        outputRatio = params.outputRatio,
        boomerang = params.boomerang,
        boomerangGif = params.boomerangGif,
        saveOriginals = params.saveOriginals,
      )
    }

    AsyncFunction("composePipPhoto") {
        primaryPath: String,
        secondaryPath: String,
        params: PhotoParams,
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
        layout = params.layout,
        corner = params.corner,
        insetX = params.insetX.toFloat(),
        insetY = params.insetY.toFloat(),
        insetW = params.insetW.toFloat(),
        watermark = params.watermark,
        canvasWidth = params.canvasWidth.toInt(),
        outputRatio = params.outputRatio,
        saveOriginals = params.saveOriginals,
      )
    }

    // Partage DIRECT vers une app cible (Instagram / TikTok…) : ACTION_SEND ciblé
    // sur le 1er `packages` installé, média en EXTRA_STREAM (Uri content://) avec
    // droit de lecture. Renvoie true si lancé ; false si aucune cible n'est
    // installée -> le JS retombe sur le partage système.
    AsyncFunction("shareToApp") { uri: String, mimeType: String, packages: List<String>, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      try {
        val parsed = Uri.parse(uri)
        var launched = false
        for (pkg in packages) {
          val intent = Intent(Intent.ACTION_SEND).apply {
            setPackage(pkg)
            type = mimeType
            putExtra(Intent.EXTRA_STREAM, parsed)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
          if (intent.resolveActivity(activity.packageManager) != null) {
            activity.startActivity(intent)
            launched = true
            break
          }
        }
        promise.resolve(launched)
      } catch (e: Exception) {
        promise.resolve(false)
      }
    }

    // Propose à l'utilisateur d'ajouter la tuile « capture rapide » aux Réglages
    // rapides (API 33+, dialogue système). Renvoie false si indisponible.
    // Partage SYSTÈME (feuille de partage) d'un média content:// — fiable, contrairement
    // à expo-sharing qui échoue silencieusement sur les URI MediaStore. ACTION_SEND +
    // createChooser, média en EXTRA_STREAM avec droit de lecture.
    AsyncFunction("shareSystem") { uri: String, mimeType: String, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      try {
        val send = Intent(Intent.ACTION_SEND).apply {
          type = mimeType
          putExtra(Intent.EXTRA_STREAM, Uri.parse(uri))
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val chooser = Intent.createChooser(send, null).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
        activity.startActivity(chooser)
        promise.resolve(true)
      } catch (e: Exception) {
        promise.resolve(false)
      }
    }

    AsyncFunction("requestAddCaptureTile") { promise: Promise ->
      if (Build.VERSION.SDK_INT < 33) {
        promise.resolve(false)
        return@AsyncFunction
      }
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      try {
        val sbm = activity.getSystemService(StatusBarManager::class.java)
        sbm.requestAddTileService(
          ComponentName(activity, CaptureTileService::class.java),
          activity.getString(R.string.tile_capture_label),
          Icon.createWithResource(activity, R.drawable.ic_tile_camera),
          java.util.concurrent.Executor { it.run() },
          java.util.function.Consumer<Int> { },
        )
        promise.resolve(true)
      } catch (e: Exception) {
        promise.resolve(false)
      }
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
