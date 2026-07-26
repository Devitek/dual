package expo.modules.videopipcomposer

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import java.io.File

/**
 * Foreground Service qui exécute la composition PiP (photo OU vidéo) + la
 * sauvegarde en galerie, en natif. Survit à l'arrière-plan et au swipe de l'app
 * (notification persistante). Émet progression/fin/erreur via {@link PipComposerBus}.
 */
class PipComposerService : Service() {
  companion object {
    private const val CHANNEL_ID = "pip_composer"
    private const val NOTIF_ID = 4711

    private const val EXTRA_JOB_ID = "jobId"
    private const val EXTRA_PRIMARY = "primaryPath"
    private const val EXTRA_SECONDARY = "secondaryPath"
    private const val EXTRA_CORNER = "corner"
    private const val EXTRA_MEDIA_TYPE = "mediaType"
    private const val EXTRA_SAVE_ORIGINALS = "saveOriginals"
    private const val EXTRA_BITRATE = "bitRate"
    private const val EXTRA_CANVAS = "canvasWidth"
    private const val EXTRA_LAYOUT = "layout"
    private const val EXTRA_INSET_X = "insetX"
    private const val EXTRA_INSET_Y = "insetY"
    private const val EXTRA_INSET_W = "insetW"
    private const val EXTRA_WATERMARK = "watermark"
    private const val EXTRA_OUTPUT_RATIO = "outputRatio"
    private const val EXTRA_BOOMERANG = "boomerang"
    private const val EXTRA_BOOMERANG_GIF = "boomerangGif"

    private const val TYPE_VIDEO = "video"
    private const val TYPE_PHOTO = "photo"

    // Layout de la vignette (constant, aligné sur DEFAULT_PIP_LAYOUT côté JS).
    private const val INSET_WIDTH_RATIO = 0.3f
    private const val MARGIN_RATIO = 0.04f

    fun startVideo(
      context: Context,
      jobId: String,
      primaryPath: String,
      secondaryPath: String,
      layout: String,
      corner: String,
      insetX: Float,
      insetY: Float,
      insetW: Float,
      watermark: Boolean,
      bitRate: Int,
      outputRatio: String,
      boomerang: Boolean,
      boomerangGif: Boolean,
      saveOriginals: Boolean,
    ) {
      val intent = baseIntent(context, jobId, primaryPath, secondaryPath, corner, saveOriginals).apply {
        putExtra(EXTRA_MEDIA_TYPE, TYPE_VIDEO)
        putExtra(EXTRA_BITRATE, bitRate)
        putExtra(EXTRA_LAYOUT, layout)
        putExtra(EXTRA_INSET_X, insetX)
        putExtra(EXTRA_INSET_Y, insetY)
        putExtra(EXTRA_INSET_W, insetW)
        putExtra(EXTRA_WATERMARK, watermark)
        putExtra(EXTRA_OUTPUT_RATIO, outputRatio)
        putExtra(EXTRA_BOOMERANG, boomerang)
        putExtra(EXTRA_BOOMERANG_GIF, boomerangGif)
      }
      androidx.core.content.ContextCompat.startForegroundService(context, intent)
    }

    fun startPhoto(
      context: Context,
      jobId: String,
      primaryPath: String,
      secondaryPath: String,
      layout: String,
      corner: String,
      insetX: Float,
      insetY: Float,
      insetW: Float,
      watermark: Boolean,
      canvasWidth: Int,
      outputRatio: String,
      saveOriginals: Boolean,
    ) {
      val intent = baseIntent(context, jobId, primaryPath, secondaryPath, corner, saveOriginals).apply {
        putExtra(EXTRA_MEDIA_TYPE, TYPE_PHOTO)
        putExtra(EXTRA_CANVAS, canvasWidth)
        putExtra(EXTRA_LAYOUT, layout)
        putExtra(EXTRA_INSET_X, insetX)
        putExtra(EXTRA_INSET_Y, insetY)
        putExtra(EXTRA_INSET_W, insetW)
        putExtra(EXTRA_WATERMARK, watermark)
        putExtra(EXTRA_OUTPUT_RATIO, outputRatio)
      }
      androidx.core.content.ContextCompat.startForegroundService(context, intent)
    }

    private fun baseIntent(
      context: Context,
      jobId: String,
      primaryPath: String,
      secondaryPath: String,
      corner: String,
      saveOriginals: Boolean,
    ): Intent = Intent(context, PipComposerService::class.java).apply {
      putExtra(EXTRA_JOB_ID, jobId)
      putExtra(EXTRA_PRIMARY, primaryPath)
      putExtra(EXTRA_SECONDARY, secondaryPath)
      putExtra(EXTRA_CORNER, corner)
      putExtra(EXTRA_SAVE_ORIGINALS, saveOriginals)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent == null) {
      stopSelf()
      return START_NOT_STICKY
    }
    val jobId = intent.getStringExtra(EXTRA_JOB_ID) ?: return START_NOT_STICKY
    val primaryPath = intent.getStringExtra(EXTRA_PRIMARY) ?: return stopWith(jobId, "Chemin principal manquant")
    val secondaryPath = intent.getStringExtra(EXTRA_SECONDARY) ?: return stopWith(jobId, "Chemin secondaire manquant")
    val corner = intent.getStringExtra(EXTRA_CORNER) ?: "top-right"
    val mediaType = intent.getStringExtra(EXTRA_MEDIA_TYPE) ?: TYPE_VIDEO
    val saveOriginals = intent.getBooleanExtra(EXTRA_SAVE_ORIGINALS, false)
    val bitRate = intent.getIntExtra(EXTRA_BITRATE, 0)
    val canvasWidth = intent.getIntExtra(EXTRA_CANVAS, 1080)
    val layout = intent.getStringExtra(EXTRA_LAYOUT) ?: "pip"
    val insetX = intent.getFloatExtra(EXTRA_INSET_X, -1f)
    val insetY = intent.getFloatExtra(EXTRA_INSET_Y, -1f)
    val insetW = intent.getFloatExtra(EXTRA_INSET_W, -1f)
    val watermark = intent.getBooleanExtra(EXTRA_WATERMARK, false)
    val outputRatio = intent.getStringExtra(EXTRA_OUTPUT_RATIO) ?: "full"
    val boomerang = intent.getBooleanExtra(EXTRA_BOOMERANG, false)
    val boomerangGif = intent.getBooleanExtra(EXTRA_BOOMERANG_GIF, false)
    val isPhoto = mediaType == TYPE_PHOTO
    val title = if (isPhoto) "Composition de la photo PiP" else "Composition de la vidéo PiP"

    ensureChannel()
    startForegroundCompat(buildNotification(0, true, title))

    Thread {
      val ctx = applicationContext
      try {
        val ts = System.currentTimeMillis()
        if (isPhoto) {
          val outFile = File.createTempFile("pip_", ".jpg", cacheDir)
          PhotoPipComposer(
            primaryPath = primaryPath,
            secondaryPath = secondaryPath,
            outputPath = outFile.absolutePath,
            layout = layout,
            corner = corner,
            insetXFrac = insetX,
            insetYFrac = insetY,
            insetWFrac = insetW,
            watermark = watermark,
            canvasWidth = canvasWidth,
            outputRatio = outputRatio,
            insetWidthRatio = INSET_WIDTH_RATIO,
            marginRatio = MARGIN_RATIO,
          ).compose()
          val uri = MediaStoreSaver.saveImage(ctx, outFile, "Dual_PiP_$ts.jpg")
          if (saveOriginals) {
            MediaStoreSaver.saveImage(ctx, File(primaryPath), "Dual_${ts}_1.jpg")
            MediaStoreSaver.saveImage(ctx, File(secondaryPath), "Dual_${ts}_2.jpg")
          }
          outFile.delete()
          PipComposerBus.complete(jobId, uri)
        } else {
          val outFile = File.createTempFile("pip_", ".mp4", cacheDir)
          var lastPct = -1
          PipVideoComposer(
            primaryPath = primaryPath,
            secondaryPath = secondaryPath,
            outputPath = outFile.absolutePath,
            layout = layout,
            corner = corner,
            insetXFrac = insetX,
            insetYFrac = insetY,
            insetWFrac = insetW,
            watermark = watermark,
            outputRatio = outputRatio,
            insetWidthRatio = INSET_WIDTH_RATIO,
            marginRatio = MARGIN_RATIO,
            bitRate = bitRate,
          ).compose { fraction ->
            val pct = (fraction * 100).toInt().coerceIn(0, 100)
            if (pct != lastPct) {
              lastPct = pct
              updateNotification(buildNotification(pct, fraction < 0, title))
              PipComposerBus.progress(jobId, fraction.toDouble())
            }
          }
          // Boomerang (optionnel) : post-traite la vidéo PiP en avant+arrière
          // bouclé (MP4) ou en GIF animé. FAIL-SAFE : toute erreur laisse la
          // vidéo PiP normale être sauvegardée telle quelle.
          var finalFile = outFile
          var boomFile: File? = null
          var savedAsGif = false
          if (boomerang) {
            try {
              val ext = if (boomerangGif) ".gif" else ".mp4"
              val bf = File.createTempFile("boom_", ext, cacheDir)
              BoomerangComposer(outFile.absolutePath, bf.absolutePath, asGif = boomerangGif).compose()
              boomFile = bf
              finalFile = bf
              savedAsGif = boomerangGif
            } catch (e: Exception) {
              boomFile?.delete()
              boomFile = null
              finalFile = outFile // repli : vidéo normale
            }
          }
          val uri = if (savedAsGif) {
            MediaStoreSaver.saveImage(ctx, finalFile, "Dual_Boomerang_$ts.gif", "image/gif")
          } else {
            val namePrefix = if (boomerang) "Dual_Boomerang" else "Dual_PiP"
            MediaStoreSaver.saveVideo(ctx, finalFile, "${namePrefix}_$ts.mp4")
          }
          if (saveOriginals) {
            MediaStoreSaver.saveVideo(ctx, File(primaryPath), "Dual_${ts}_1.mp4")
            MediaStoreSaver.saveVideo(ctx, File(secondaryPath), "Dual_${ts}_2.mp4")
          }
          outFile.delete()
          boomFile?.let { if (it != outFile) it.delete() }
          PipComposerBus.complete(jobId, uri)
        }
      } catch (e: Exception) {
        PipComposerBus.error(jobId, e.message ?: "Échec composition PiP")
      } finally {
        stopSelfSafely()
      }
    }.start()

    return START_NOT_STICKY
  }

  private fun stopWith(jobId: String, message: String): Int {
    PipComposerBus.error(jobId, message)
    stopSelf()
    return START_NOT_STICKY
  }

  private fun stopSelfSafely() {
    ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val mgr = getSystemService(NotificationManager::class.java)
      if (mgr.getNotificationChannel(CHANNEL_ID) == null) {
        mgr.createNotificationChannel(
          NotificationChannel(CHANNEL_ID, "Traitement PiP", NotificationManager.IMPORTANCE_LOW),
        )
      }
    }
  }

  private fun buildNotification(progress: Int, indeterminate: Boolean, title: String): android.app.Notification {
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(if (indeterminate) "Traitement en cours…" else "$progress %")
      .setSmallIcon(applicationInfo.icon)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setProgress(100, progress, indeterminate)
      .build()
  }

  private fun startForegroundCompat(notification: android.app.Notification) {
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
    } else {
      0
    }
    ServiceCompat.startForeground(this, NOTIF_ID, notification, type)
  }

  private fun updateNotification(notification: android.app.Notification) {
    getSystemService(NotificationManager::class.java)?.notify(NOTIF_ID, notification)
  }
}
