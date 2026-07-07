package expo.modules.videopipcomposer

import android.content.ContentValues
import android.content.Context
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException

/**
 * Insère un fichier vidéo dans la galerie (MediaStore) SANS passer par le JS,
 * afin que la sauvegarde survive même si l'app est tuée pendant le traitement.
 */
object MediaStoreSaver {
  fun saveVideo(context: Context, file: File, displayName: String): String {
    val resolver = context.contentResolver
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val values = ContentValues().apply {
        put(MediaStore.Video.Media.DISPLAY_NAME, displayName)
        put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
        // Même emplacement que les photos (expo-media-library) = racine DCIM
        // (galerie/pellicule principale), pas un sous-dossier dédié.
        put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_DCIM)
        put(MediaStore.Video.Media.IS_PENDING, 1)
      }
      val uri = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)
        ?: throw IOException("Insertion MediaStore impossible")
      resolver.openOutputStream(uri).use { out ->
        checkNotNull(out) { "OutputStream null" }
        FileInputStream(file).use { it.copyTo(out) }
      }
      values.clear()
      values.put(MediaStore.Video.Media.IS_PENDING, 0)
      resolver.update(uri, values, null, null)
      return uri.toString()
    }

    // Android < 10 : copie dans DCIM + scan média (nécessite WRITE_EXTERNAL_STORAGE)
    @Suppress("DEPRECATION")
    val dcimDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM).apply { mkdirs() }
    val dest = File(dcimDir, displayName)
    FileInputStream(file).use { input -> FileOutputStream(dest).use { input.copyTo(it) } }
    MediaScannerConnection.scanFile(context, arrayOf(dest.absolutePath), arrayOf("video/mp4"), null)
    return Uri.fromFile(dest).toString()
  }

  fun saveImage(context: Context, file: File, displayName: String): String {
    val resolver = context.contentResolver
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val values = ContentValues().apply {
        put(MediaStore.Images.Media.DISPLAY_NAME, displayName)
        put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
        put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_DCIM)
        put(MediaStore.Images.Media.IS_PENDING, 1)
      }
      val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
        ?: throw IOException("Insertion MediaStore impossible")
      resolver.openOutputStream(uri).use { out ->
        checkNotNull(out) { "OutputStream null" }
        FileInputStream(file).use { it.copyTo(out) }
      }
      values.clear()
      values.put(MediaStore.Images.Media.IS_PENDING, 0)
      resolver.update(uri, values, null, null)
      return uri.toString()
    }

    @Suppress("DEPRECATION")
    val dcimDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM).apply { mkdirs() }
    val dest = File(dcimDir, displayName)
    FileInputStream(file).use { input -> FileOutputStream(dest).use { input.copyTo(it) } }
    MediaScannerConnection.scanFile(context, arrayOf(dest.absolutePath), arrayOf("image/jpeg"), null)
    return Uri.fromFile(dest).toString()
  }
}
