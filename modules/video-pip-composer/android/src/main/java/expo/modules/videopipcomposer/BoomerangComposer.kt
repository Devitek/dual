package expo.modules.videopipcomposer

import android.graphics.Bitmap
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.media.MediaMuxer
import java.io.BufferedOutputStream
import java.io.FileOutputStream
import java.nio.ByteBuffer

/**
 * Transforme une vidéo PiP (déjà composée, **encodée toutes-images-clés** pour le
 * boomerang) en boomerang, par **RE-MUX** avant + arrière bouclé : on lit les
 * échantillons H.264 encodés et on les ré-écrit dans l'ordre avant puis arrière
 * avec des PTS recalculés. Aucun décodage/ré-encodage -> **pleine résolution,
 * sans perte, rapide** (avant : `getFrameAtTime` renvoyait des miniatures 480px
 * + des images-clés dupliquées = rendu saccadé et basse déf).
 *
 * On rogne le tout début (montée en route de la caméra avant = vignette noire).
 * Reverse OK uniquement si toutes les images sont des images-clés (garanti par
 * l'encodeur PiP `allKeyframes=true`) ; sinon on lève -> repli service (vidéo
 * normale). Boomerang = muet.
 *
 * `asGif=true` : variante GIF animé (frames décodées via MediaMetadataRetriever,
 * en évitant le tout début noir).
 */
class BoomerangComposer(
  private val inputPath: String,
  private val outputPath: String,
  private val asGif: Boolean = false,
  private val loops: Int = 3,
) {
  fun compose(onProgress: (Float) -> Unit = {}) {
    if (asGif) composeGif(onProgress) else composeRemux(onProgress)
  }

  // --- MP4 : re-mux avant + arrière (pas de ré-encodage) ---

  private fun composeRemux(onProgress: (Float) -> Unit) {
    val extractor = MediaExtractor().apply { setDataSource(inputPath) }
    try {
      val track = (0 until extractor.trackCount).firstOrNull {
        extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("video/") == true
      } ?: throw IllegalStateException("Piste vidéo introuvable")
      extractor.selectTrack(track)
      val format = extractor.getTrackFormat(track)
      val srcFps = if (format.containsKey(MediaFormat.KEY_FRAME_RATE)) format.getInteger(MediaFormat.KEY_FRAME_RATE) else 30

      // Lecture de TOUS les échantillons encodés (petits : ~30KB/frame).
      val datas = ArrayList<ByteArray>()
      val syncs = ArrayList<Boolean>()
      val buf = ByteBuffer.allocate(4 * 1024 * 1024)
      while (true) {
        buf.clear()
        val size = extractor.readSampleData(buf, 0)
        if (size < 0) break
        buf.position(0)
        buf.limit(size)
        val bytes = ByteArray(size)
        buf.get(bytes)
        datas.add(bytes)
        syncs.add(extractor.sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC != 0)
        extractor.advance()
      }
      require(datas.size >= 2) { "Images insuffisantes pour le boomerang" }

      // Rogne le tout début (vignette noire au démarrage caméra avant).
      val trim = minOf(datas.size / 4, maxOf(0, (srcFps * 0.15f).toInt()))
      var fwdData = datas.subList(trim, datas.size).toMutableList()
      var fwdSync = syncs.subList(trim, syncs.size)
      require(fwdData.size >= 2) { "Images insuffisantes après rognage" }

      // Reverse impossible si des images ne sont pas des images-clés.
      require(fwdSync.all { it }) { "Vidéo PiP non toutes-images-clés" }

      // Sous-échantillonne les clips longs (garde ~un boomerang court et nerveux).
      if (fwdData.size > 32) {
        val step = fwdData.size / 32
        fwdData = fwdData.filterIndexed { i, _ -> i % step == 0 }.toMutableList()
      }
      val n = fwdData.size
      val nLoops = (if (n <= 16) 3 else 2).coerceAtMost(loops)

      // Ordre boomerang : avant [0..n-1] puis retour [n-2..1], bouclé.
      val order = ArrayList<Int>()
      repeat(nLoops) {
        for (i in 0 until n) order.add(i)
        for (i in n - 2 downTo 1) order.add(i)
      }

      val muxer = MediaMuxer(outputPath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
      try {
        val outTrack = muxer.addTrack(format)
        muxer.start()
        val frameDurUs = 1_000_000L / srcFps.coerceIn(1, 60)
        val info = MediaCodec.BufferInfo()
        order.forEachIndexed { pos, idx ->
          val d = fwdData[idx]
          val bb = ByteBuffer.wrap(d)
          info.offset = 0
          info.size = d.size
          info.presentationTimeUs = pos * frameDurUs
          info.flags = MediaCodec.BUFFER_FLAG_KEY_FRAME
          muxer.writeSampleData(outTrack, bb, info)
          onProgress((pos + 1).toFloat() / order.size)
        }
      } finally {
        runCatching { muxer.stop() }
        runCatching { muxer.release() }
      }
    } finally {
      runCatching { extractor.release() }
    }
  }

  // --- GIF : frames décodées (en évitant le tout début noir) ---

  private fun composeGif(onProgress: (Float) -> Unit) {
    val retriever = MediaMetadataRetriever()
    val frames = ArrayList<Bitmap>()
    try {
      retriever.setDataSource(inputPath)
      val durUs = (retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L) * 1000L
      require(durUs > 0L) { "Durée vidéo inconnue" }
      val n = 18
      // Démarre à ~12% (évite la vignette noire du démarrage), jusqu'à la fin.
      val startUs = (durUs * 0.12f).toLong()
      for (i in 0 until n) {
        val t = startUs + (durUs - startUs) * i / (n - 1)
        val bmp = retriever.getFrameAtTime(t, MediaMetadataRetriever.OPTION_CLOSEST)
        if (bmp != null) frames.add(bmp)
        onProgress(0.4f * (i + 1) / n)
      }
    } finally {
      runCatching { retriever.release() }
    }
    require(frames.size >= 2) { "Images insuffisantes pour le GIF" }
    try {
      writeGif(frames)
      onProgress(1f)
    } finally {
      frames.forEach { runCatching { it.recycle() } }
    }
  }

  private fun writeGif(frames: List<Bitmap>) {
    val maxW = 440
    val first = frames[0]
    val scale = minOf(1f, maxW.toFloat() / first.width)
    val sw = (first.width * scale).toInt().coerceAtLeast(2)
    val sh = (first.height * scale).toInt().coerceAtLeast(2)
    val scaled = frames.map { Bitmap.createScaledBitmap(it, sw, sh, true) }
    val order = ArrayList<Int>()
    repeat(2) {
      for (j in scaled.indices) order.add(j)
      for (j in scaled.size - 2 downTo 1) order.add(j)
    }
    try {
      FileOutputStream(outputPath).use { fos ->
        val enc = GifEncoder(BufferedOutputStream(fos))
        order.forEach { enc.addFrame(scaled[it], 70) }
        enc.finish()
      }
    } finally {
      scaled.forEach { runCatching { it.recycle() } }
    }
  }
}
