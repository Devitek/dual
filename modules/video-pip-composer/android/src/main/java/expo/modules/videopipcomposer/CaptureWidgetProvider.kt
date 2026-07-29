package expo.modules.videopipcomposer

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.widget.RemoteViews
import java.io.File

/**
 * Widget d'écran d'accueil « capture rapide » : 3 raccourcis (Photo / Vidéo / ∞)
 * qui ouvrent TwinLens DIRECTEMENT dans le mode voulu via un deep-link
 * `twinlens://capture?mode=…` (routé côté JS au démarrage).
 */
class CaptureWidgetProvider : AppWidgetProvider() {
  companion object {
    /** Fichier partagé (filesDir) : miniature de la dernière capture (widget v3). */
    const val THUMB_FILE = "widget_thumb.png"
  }

  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    for (id in ids) {
      val views = RemoteViews(context.packageName, R.layout.widget_capture)
      views.setOnClickPendingIntent(R.id.widget_btn_photo, modeIntent(context, "photo", 1))
      views.setOnClickPendingIntent(R.id.widget_btn_video, modeIntent(context, "video", 2))
      views.setOnClickPendingIntent(R.id.widget_btn_boom, modeIntent(context, "boomerang", 3))
      views.setOnClickPendingIntent(R.id.widget_thumb, modeIntent(context, "photo", 4))

      // Miniature de la dernière capture, si dispo.
      val thumb = File(context.filesDir, THUMB_FILE)
      if (thumb.exists()) {
        runCatching { BitmapFactory.decodeFile(thumb.absolutePath) }.getOrNull()?.let {
          views.setImageViewBitmap(R.id.widget_thumb, it)
        }
      }
      manager.updateAppWidget(id, views)
    }
  }

  private fun modeIntent(context: Context, mode: String, req: Int): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("twinlens://capture?mode=$mode"))
      .setPackage(context.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return PendingIntent.getActivity(
      context,
      req,
      intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
  }
}
