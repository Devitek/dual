package expo.modules.videopipcomposer

/**
 * Relais process-local entre le Foreground Service et le module Expo.
 * Le service émet progression/fin/erreur ; le module (s'il est vivant) les
 * transmet au JS. Si l'app est tuée, le listener est null -> no-op, mais le
 * service termine et sauvegarde quand même le fichier.
 */
object PipComposerBus {
  interface Listener {
    fun onProgress(jobId: String, fraction: Double)
    fun onComplete(jobId: String, uri: String)
    fun onError(jobId: String, message: String)
  }

  @Volatile
  var listener: Listener? = null

  fun progress(jobId: String, fraction: Double) {
    listener?.onProgress(jobId, fraction)
  }

  fun complete(jobId: String, uri: String) {
    listener?.onComplete(jobId, uri)
  }

  fun error(jobId: String, message: String) {
    listener?.onError(jobId, message)
  }
}
