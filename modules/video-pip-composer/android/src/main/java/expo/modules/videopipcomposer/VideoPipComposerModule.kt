package expo.modules.videopipcomposer

import android.Manifest
import android.app.StatusBarManager
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.drawable.Icon
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import androidx.core.app.ActivityCompat
import java.io.File
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

    // Widget v3 : met à jour la miniature de la dernière capture sur le widget
    // d'accueil (écrit une vignette arrondie dans filesDir puis rafraîchit).
    AsyncFunction("updateCaptureWidget") { uri: String, kind: String, promise: Promise ->
      val ctx = appContext.reactContext
      if (ctx == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      try {
        val parsed = Uri.parse(uri)
        val src: Bitmap? = if (kind == "video") {
          val r = MediaMetadataRetriever()
          try {
            r.setDataSource(ctx, parsed)
            r.getFrameAtTime(-1)
          } finally {
            runCatching { r.release() }
          }
        } else {
          ctx.contentResolver.openInputStream(parsed)?.use {
            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = 4 })
          }
        }
        if (src == null) {
          promise.resolve(false)
          return@AsyncFunction
        }
        val thumb = roundedSquare(src, 180, 26f)
        src.recycle()
        File(ctx.filesDir, CaptureWidgetProvider.THUMB_FILE).outputStream().use {
          thumb.compress(Bitmap.CompressFormat.PNG, 100, it)
        }
        thumb.recycle()

        val mgr = AppWidgetManager.getInstance(ctx)
        val ids = mgr.getAppWidgetIds(ComponentName(ctx, CaptureWidgetProvider::class.java))
        if (ids.isNotEmpty()) {
          ctx.sendBroadcast(
            Intent(ctx, CaptureWidgetProvider::class.java).apply {
              action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
              putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
            },
          )
        }
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

  /** Vignette carrée (center-crop) à coins arrondis pour le widget. */
  private fun roundedSquare(src: Bitmap, size: Int, radius: Float): Bitmap {
    val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    val path = Path().apply {
      addRoundRect(RectF(0f, 0f, size.toFloat(), size.toFloat()), radius, radius, Path.Direction.CW)
    }
    canvas.clipPath(path)
    val scale = maxOf(size / src.width.toFloat(), size / src.height.toFloat())
    val dw = src.width * scale
    val dh = src.height * scale
    val left = (size - dw) / 2f
    val top = (size - dh) / 2f
    canvas.drawBitmap(src, null, RectF(left, top, left + dw, top + dh), paint)
    return out
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
