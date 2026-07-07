package expo.modules.videopipcomposer

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import android.view.Surface
import java.nio.ByteBuffer

/**
 * Composition PiP vidéo ON-DEVICE (patron canonique bigflake/Grafika) :
 *  - 2 MediaExtractor/MediaCodec (décodeurs) rendent dans 2 textures OES,
 *  - un renderer GL dessine l'arrière plein cadre + l'avant en vignette dans la
 *    Surface d'entrée d'un MediaCodec (encodeur H.264),
 *  - MediaMuxer écrit la vidéo encodée + copie la piste audio de la principale.
 *
 * Synchronisation avant/arrière : lockstep 1:1 (les 2 flux proviennent de la même
 * session, durées ~identiques). À raffiner (sync par PTS) si dérive visible.
 */
class PipVideoComposer(
  private val primaryPath: String,
  private val secondaryPath: String,
  private val outputPath: String,
  private val corner: String,
  private val insetWidthRatio: Float,
  private val marginRatio: Float,
  private val bitRate: Int,
) {
  private val timeoutUs = 10_000L

  fun compose(onProgress: (Float) -> Unit = {}) {
    val backEx = MediaExtractor().apply { setDataSource(primaryPath) }
    val frontEx = MediaExtractor().apply { setDataSource(secondaryPath) }

    val backTrack = selectTrack(backEx, "video/")
    val frontTrack = selectTrack(frontEx, "video/")
    require(backTrack >= 0 && frontTrack >= 0) { "Piste vidéo introuvable" }
    backEx.selectTrack(backTrack)
    frontEx.selectTrack(frontTrack)

    val backFormat = backEx.getTrackFormat(backTrack)
    val frontFormat = frontEx.getTrackFormat(frontTrack)
    val width = backFormat.getInteger(MediaFormat.KEY_WIDTH)
    val height = backFormat.getInteger(MediaFormat.KEY_HEIGHT)
    val frameRate =
      if (backFormat.containsKey(MediaFormat.KEY_FRAME_RATE)) backFormat.getInteger(MediaFormat.KEY_FRAME_RATE) else 30
    val durationUs = if (backFormat.containsKey(MediaFormat.KEY_DURATION)) backFormat.getLong(MediaFormat.KEY_DURATION) else 0L

    // --- Encodeur H.264 (entrée Surface) ---
    val encFormat = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height).apply {
      setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
      setInteger(MediaFormat.KEY_BIT_RATE, if (bitRate > 0) bitRate else (width.toLong() * height.toLong() * 6L).toInt())
      setInteger(MediaFormat.KEY_FRAME_RATE, frameRate)
      setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 2)
    }
    val encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
    encoder.configure(encFormat, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    val glSurface = CodecInputSurface(encoder.createInputSurface())
    encoder.start()

    glSurface.makeCurrent()
    val renderer = PipGlRenderer()

    val backDecoder = createDecoder(backFormat, glSurface.back.surface)
    val frontDecoder = createDecoder(frontFormat, glSurface.front.surface)

    // --- Muxer + audio (depuis la principale) ---
    val muxer = MediaMuxer(outputPath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    val audioEx = MediaExtractor().apply { setDataSource(primaryPath) }
    val audioTrack = selectTrack(audioEx, "audio/")
    var audioFormat: MediaFormat? = null
    if (audioTrack >= 0) {
      audioEx.selectTrack(audioTrack)
      audioFormat = audioEx.getTrackFormat(audioTrack)
    }

    var muxerVideoIndex = -1
    var muxerAudioIndex = -1
    var muxerStarted = false

    val rect = insetNdcRect(corner, width, height)
    val insetWpx = insetWidthRatio * width
    val insetHpx = insetWidthRatio * height
    val radiusPx = insetWpx * 0.09f
    val borderPx = maxOf(4f, insetWpx * 0.02f)

    val backInfo = MediaCodec.BufferInfo()
    val frontInfo = MediaCodec.BufferInfo()
    val encInfo = MediaCodec.BufferInfo()
    val stMatrix = FloatArray(16)

    var backInputDone = false
    var frontInputDone = false
    var backOutputDone = false
    var encoderDone = false

    fun feed(ex: MediaExtractor, dec: MediaCodec): Boolean {
      val inIdx = dec.dequeueInputBuffer(timeoutUs)
      if (inIdx < 0) return false
      val buf = dec.getInputBuffer(inIdx) ?: return false
      val size = ex.readSampleData(buf, 0)
      return if (size < 0) {
        dec.queueInputBuffer(inIdx, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
        true
      } else {
        dec.queueInputBuffer(inIdx, 0, size, ex.sampleTime, 0)
        ex.advance()
        false
      }
    }

    fun drainEncoder(endOfStream: Boolean) {
      if (endOfStream) encoder.signalEndOfInputStream()
      while (true) {
        val idx = encoder.dequeueOutputBuffer(encInfo, timeoutUs)
        when {
          idx == MediaCodec.INFO_TRY_AGAIN_LATER -> if (!endOfStream) return
          idx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
            muxerVideoIndex = muxer.addTrack(encoder.outputFormat)
            audioFormat?.let { muxerAudioIndex = muxer.addTrack(it) }
            muxer.start()
            muxerStarted = true
          }
          idx >= 0 -> {
            val out = encoder.getOutputBuffer(idx)
            if (encInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) encInfo.size = 0
            if (encInfo.size > 0 && muxerStarted && out != null) {
              out.position(encInfo.offset)
              out.limit(encInfo.offset + encInfo.size)
              muxer.writeSampleData(muxerVideoIndex, out, encInfo)
            }
            encoder.releaseOutputBuffer(idx, false)
            if (encInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
              encoderDone = true
              return
            }
          }
        }
      }
    }

    try {
      while (!encoderDone) {
        if (!backInputDone) backInputDone = feed(backEx, backDecoder)
        if (!frontInputDone) frontInputDone = feed(frontEx, frontDecoder)

        if (backOutputDone) continue

        val outIdx = backDecoder.dequeueOutputBuffer(backInfo, timeoutUs)
        if (outIdx < 0) continue

        val eos = backInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
        val doRender = backInfo.size != 0 && !eos
        val ptsNs = backInfo.presentationTimeUs * 1000
        backDecoder.releaseOutputBuffer(outIdx, doRender)

        if (doRender) {
          glSurface.back.awaitAndUpdate()

          // Lockstep : consommer une frame avant (si dispo).
          val fIdx = frontDecoder.dequeueOutputBuffer(frontInfo, 0)
          if (fIdx >= 0) {
            val fEos = frontInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0
            val fRender = frontInfo.size != 0 && !fEos
            frontDecoder.releaseOutputBuffer(fIdx, fRender)
            if (fRender) glSurface.front.awaitAndUpdate()
          }

          glSurface.makeCurrent()
          renderer.clear()
          glSurface.back.getTransform(stMatrix)
          renderer.drawFull(glSurface.back.textureId, stMatrix)
          glSurface.front.getTransform(stMatrix)
          renderer.drawInset(
            glSurface.front.textureId, stMatrix,
            rect[0], rect[1], rect[2], rect[3],
            insetWpx, insetHpx, radiusPx, borderPx,
          )
          glSurface.setPresentationTime(ptsNs)
          glSurface.swapBuffers()
          drainEncoder(false)
          onProgress(if (durationUs > 0L) backInfo.presentationTimeUs.toFloat() / durationUs else -1f)
        }

        if (eos) {
          backOutputDone = true
          drainEncoder(true)
        }
      }

      // --- Copie de la piste audio (sans ré-encodage) ---
      if (audioTrack >= 0 && muxerStarted && muxerAudioIndex >= 0) {
        val buf = ByteBuffer.allocate(512 * 1024)
        val info = MediaCodec.BufferInfo()
        while (true) {
          val size = audioEx.readSampleData(buf, 0)
          if (size < 0) break
          info.offset = 0
          info.size = size
          info.presentationTimeUs = audioEx.sampleTime
          info.flags =
            if (audioEx.sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC != 0) MediaCodec.BUFFER_FLAG_KEY_FRAME else 0
          muxer.writeSampleData(muxerAudioIndex, buf, info)
          audioEx.advance()
        }
      }
    } finally {
      runCatching { if (muxerStarted) muxer.stop() }
      runCatching { muxer.release() }
      runCatching { backDecoder.stop() }; runCatching { backDecoder.release() }
      runCatching { frontDecoder.stop() }; runCatching { frontDecoder.release() }
      runCatching { encoder.stop() }; runCatching { encoder.release() }
      runCatching { glSurface.release() }
      runCatching { backEx.release() }
      runCatching { frontEx.release() }
      runCatching { audioEx.release() }
    }
  }

  private fun createDecoder(format: MediaFormat, surface: Surface): MediaCodec {
    val mime = format.getString(MediaFormat.KEY_MIME)!!
    val dec = MediaCodec.createDecoderByType(mime)
    dec.configure(format, surface, null, 0)
    dec.start()
    return dec
  }

  private fun selectTrack(ex: MediaExtractor, prefix: String): Int {
    for (i in 0 until ex.trackCount) {
      val mime = ex.getTrackFormat(i).getString(MediaFormat.KEY_MIME) ?: continue
      if (mime.startsWith(prefix)) return i
    }
    return -1
  }

  /** Rectangle NDC (x0=bas-gauche, y0=bas, x1=droite, y1=haut) de la vignette. */
  private fun insetNdcRect(corner: String, width: Int, height: Int): FloatArray {
    val insetNdc = 2f * insetWidthRatio
    val mnx = 2f * marginRatio
    val mny = 2f * marginRatio * width / height
    val isTop = corner.startsWith("top")
    val isLeft = corner.endsWith("left")
    val x0 = if (isLeft) -1f + mnx else 1f - mnx - insetNdc
    val x1 = x0 + insetNdc
    val y1 = if (isTop) 1f - mny else -1f + mny + insetNdc
    val y0 = y1 - insetNdc
    return floatArrayOf(x0, y0, x1, y1)
  }
}
