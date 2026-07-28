package expo.modules.videopipcomposer

import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.service.quicksettings.TileService

/**
 * Tuile « Réglages rapides » (volet Quick Settings) : un tap ouvre TwinLens
 * directement sur l'écran de capture. Pas de permission demandée par l'app —
 * seul le service est protégé par `BIND_QUICK_SETTINGS_TILE` (lié par le système).
 */
class CaptureTileService : TileService() {
  override fun onClick() {
    super.onClick()

    val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    } ?: return

    // Android 14+ : l'overload Intent est retiré (throw) -> PendingIntent obligatoire.
    if (Build.VERSION.SDK_INT >= 34) {
      val pi = PendingIntent.getActivity(
        this,
        0,
        launch,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
      startActivityAndCollapse(pi)
    } else {
      @Suppress("DEPRECATION")
      startActivityAndCollapse(launch)
    }
  }
}
