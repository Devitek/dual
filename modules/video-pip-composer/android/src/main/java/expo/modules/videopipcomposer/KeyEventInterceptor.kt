package expo.modules.videopipcomposer

import android.app.Activity
import android.view.KeyEvent
import android.view.Window
import java.lang.ref.WeakReference

/**
 * Intercepte les touches matérielles pour déclencher l'obturateur / le zoom,
 * SANS toucher au MainActivity généré (CNG-safe) : on enveloppe le
 * `Window.Callback` de l'Activity par un proxy (délégation Kotlin `by`) qui
 * n'override que `dispatchKeyEvent`.
 *
 * - `KEYCODE_CAMERA` (bouton photo physique) -> obturateur, dès que l'écran
 *   caméra est actif (mode != OFF).
 * - `KEYCODE_VOLUME_UP/DOWN` -> obturateur ou zoom SELON le mode choisi par
 *   l'utilisateur ; on consomme alors la touche (pas d'UI système du volume).
 *   En mode VOLUME/OFF, on délègue -> volume normal.
 *
 * L'app pousse le mode « effectif » via `setVolumeKeyMode` (elle repasse en
 * VOLUME/OFF quand un sheet est ouvert, hors écran caméra, etc.).
 */
object KeyEventInterceptor {
  enum class Mode { OFF, VOLUME, SHUTTER, ZOOM }

  @Volatile
  var mode: Mode = Mode.OFF

  /** Émetteur vers le JS. `key` ∈ "up" | "down" | "camera". */
  @Volatile
  var onKey: ((String) -> Unit)? = null

  private var activityRef: WeakReference<Activity>? = null
  private var originalCallback: Window.Callback? = null

  fun install(activity: Activity) {
    val current = activity.window.callback
    if (current is WrappedCallback) return // déjà enveloppé
    originalCallback = current
    activityRef = WeakReference(activity)
    activity.window.callback = WrappedCallback(current)
  }

  fun uninstall() {
    val activity = activityRef?.get()
    val orig = originalCallback
    if (activity != null && orig != null && activity.window.callback is WrappedCallback) {
      activity.window.callback = orig
    }
    activityRef = null
    originalCallback = null
  }

  fun parseMode(value: String): Mode = when (value) {
    "volume" -> Mode.VOLUME
    "shutter" -> Mode.SHUTTER
    "zoom" -> Mode.ZOOM
    else -> Mode.OFF
  }

  private class WrappedCallback(private val delegate: Window.Callback) : Window.Callback by delegate {
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
      val code = event.keyCode

      // Bouton photo physique = obturateur (si l'écran caméra est actif).
      if (code == KeyEvent.KEYCODE_CAMERA && mode != Mode.OFF) {
        if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) onKey?.invoke("camera")
        return true
      }

      if ((code == KeyEvent.KEYCODE_VOLUME_UP || code == KeyEvent.KEYCODE_VOLUME_DOWN) &&
        (mode == Mode.SHUTTER || mode == Mode.ZOOM)
      ) {
        if (event.action == KeyEvent.ACTION_DOWN) {
          // Obturateur : uniquement le 1er appui. Zoom : appui + répétitions
          // (zoom continu au maintien).
          if (mode == Mode.ZOOM || event.repeatCount == 0) {
            onKey?.invoke(if (code == KeyEvent.KEYCODE_VOLUME_UP) "up" else "down")
          }
        }
        return true // consomme DOWN + UP -> pas d'UI volume
      }

      return delegate.dispatchKeyEvent(event)
    }
  }
}
