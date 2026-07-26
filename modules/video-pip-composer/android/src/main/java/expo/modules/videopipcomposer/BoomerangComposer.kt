package expo.modules.videopipcomposer

import android.graphics.Bitmap
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.media.MediaMuxer
import android.opengl.GLES20
import android.opengl.GLUtils
import java.io.BufferedOutputStream
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

/**
 * Transforme une vidéo (déjà composée en PiP) en « boomerang » : échantillonne N
 * frames via {@link MediaMetadataRetriever} (accès aléatoire — pas de décodage
 * inverse), puis ré-encode en H.264 dans l'ordre avant + arrière, répété `loops`
 * fois. Boomerang = muet (pas de piste audio), comme la convention du genre.
 *
 * Réutilise {@link CodecInputSurface} (EGL éprouvé) pour alimenter la Surface de
 * l'encodeur, et un petit programme GL 2D (frames dessinées plein cadre).
 * Purement local. Fail-safe côté appelant : toute exception laisse la vidéo PiP
 * d'origine être sauvegardée telle quelle.
 */
class BoomerangComposer(
  private val inputPath: String,
  private val outputPath: String,
  /** true -> sortie GIF animé ; false -> MP4 (avant+arrière bouclé). */
  private val asGif: Boolean = false,
  private val frameCount: Int = 24,
  private val loops: Int = 3,
  private val fps: Int = 24,
) {
  private val timeoutUs = 10_000L

  fun compose() {
    val retriever = MediaMetadataRetriever()
    val frames = ArrayList<Bitmap>()
    try {
      retriever.setDataSource(inputPath)
      val durMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
      val durUs = durMs * 1000L
      require(durUs > 0L) { "Durée vidéo inconnue" }
      val n = frameCount.coerceIn(2, 60)
      for (i in 0 until n) {
        val t = durUs * i / (n - 1)
        val bmp = retriever.getFrameAtTime(t, MediaMetadataRetriever.OPTION_CLOSEST)
        if (bmp != null) frames.add(bmp)
      }
    } finally {
      runCatching { retriever.release() }
    }
    require(frames.size >= 2) { "Frames insuffisantes pour le boomerang" }

    if (asGif) {
      try {
        writeGif(frames)
      } finally {
        frames.forEach { runCatching { it.recycle() } }
      }
      return
    }

    // Dimensions (paires) issues de la 1re frame décodée (déjà à l'endroit).
    val w = frames[0].width and 1.inv()
    val h = frames[0].height and 1.inv()
    require(w > 0 && h > 0) { "Dimensions frame invalides" }

    // Ordre boomerang : avant [0..n-1] puis retour [n-2..1], répété `loops` fois.
    val order = ArrayList<Int>()
    repeat(loops.coerceIn(1, 6)) {
      for (i in frames.indices) order.add(i)
      for (i in frames.size - 2 downTo 1) order.add(i)
    }

    val bitRate = (w.toLong() * h.toLong() * 6L).toInt().coerceAtLeast(2_000_000)
    val encFormat = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, w, h).apply {
      setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
      setInteger(MediaFormat.KEY_BIT_RATE, bitRate)
      setInteger(MediaFormat.KEY_FRAME_RATE, fps)
      setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
    }
    val encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
    encoder.configure(encFormat, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
    val glSurface = CodecInputSurface(encoder.createInputSurface())
    encoder.start()

    glSurface.makeCurrent()
    val renderer = FrameRenderer()

    val muxer = MediaMuxer(outputPath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    var muxerVideoIndex = -1
    var muxerStarted = false
    val encInfo = MediaCodec.BufferInfo()

    fun drainEncoder(endOfStream: Boolean) {
      if (endOfStream) encoder.signalEndOfInputStream()
      while (true) {
        val idx = encoder.dequeueOutputBuffer(encInfo, timeoutUs)
        when {
          idx == MediaCodec.INFO_TRY_AGAIN_LATER -> if (!endOfStream) return
          idx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
            muxerVideoIndex = muxer.addTrack(encoder.outputFormat)
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
            if (encInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return
          }
        }
      }
    }

    try {
      val frameDurNs = 1_000_000_000L / fps
      order.forEachIndexed { pos, frameIdx ->
        glSurface.makeCurrent()
        GLES20.glClearColor(0f, 0f, 0f, 1f)
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
        GLES20.glViewport(0, 0, w, h)
        renderer.draw(frames[frameIdx])
        glSurface.setPresentationTime(pos * frameDurNs)
        glSurface.swapBuffers()
        drainEncoder(false)
      }
      drainEncoder(true)
    } finally {
      runCatching { if (muxerStarted) muxer.stop() }
      runCatching { muxer.release() }
      runCatching { encoder.stop() }
      runCatching { encoder.release() }
      runCatching { renderer.release() }
      runCatching { glSurface.release() }
      frames.forEach { runCatching { it.recycle() } }
    }
  }

  /**
   * Variante GIF animé : sous-échantillonne + réduit la taille (poids raisonnable),
   * puis écrit l'ordre boomerang (avant + arrière, 2 boucles) via {@link GifEncoder}.
   */
  private fun writeGif(frames: List<Bitmap>) {
    val maxW = 440
    val step = if (frames.size > 14) 2 else 1
    val base = ArrayList<Bitmap>()
    var i = 0
    while (i < frames.size) {
      base.add(frames[i]); i += step
    }
    val first = base[0]
    val scale = minOf(1f, maxW.toFloat() / first.width)
    val sw = (first.width * scale).toInt().coerceAtLeast(2)
    val sh = (first.height * scale).toInt().coerceAtLeast(2)
    val scaled = base.map { Bitmap.createScaledBitmap(it, sw, sh, true) }

    val order = ArrayList<Int>()
    repeat(2) {
      for (j in scaled.indices) order.add(j)
      for (j in scaled.size - 2 downTo 1) order.add(j)
    }
    try {
      FileOutputStream(outputPath).use { fos ->
        val enc = GifEncoder(BufferedOutputStream(fos))
        order.forEach { enc.addFrame(scaled[it], 80) }
        enc.finish()
      }
    } finally {
      scaled.forEach { runCatching { it.recycle() } }
    }
  }
}

/**
 * Petit programme GL : dessine une texture 2D (bitmap d'une frame) plein cadre.
 * La texture est ré-uploadée à chaque frame via {@link draw}.
 */
private class FrameRenderer {
  private val program: Int
  private val texture: Int
  private val aPositionLoc: Int
  private val aTexCoordLoc: Int
  private val uTexLoc: Int
  private val vertexBuffer: FloatBuffer =
    ByteBuffer.allocateDirect(16 * 4).order(ByteOrder.nativeOrder()).asFloatBuffer()

  companion object {
    private const val STRIDE = 4 * 4
    private const val VERTEX_SHADER = """
      attribute vec2 aPosition;
      attribute vec2 aTexCoord;
      varying vec2 vTexCoord;
      void main() {
        gl_Position = vec4(aPosition, 0.0, 1.0);
        vTexCoord = aTexCoord;
      }
    """
    private const val FRAGMENT_SHADER = """
      precision mediump float;
      varying vec2 vTexCoord;
      uniform sampler2D uTexture;
      void main() { gl_FragColor = texture2D(uTexture, vTexCoord); }
    """
  }

  init {
    program = buildProgram(VERTEX_SHADER, FRAGMENT_SHADER)
    aPositionLoc = GLES20.glGetAttribLocation(program, "aPosition")
    aTexCoordLoc = GLES20.glGetAttribLocation(program, "aTexCoord")
    uTexLoc = GLES20.glGetUniformLocation(program, "uTexture")
    val tex = IntArray(1)
    GLES20.glGenTextures(1, tex, 0)
    texture = tex[0]
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, texture)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
  }

  fun draw(bitmap: Bitmap) {
    // Origine bitmap en HAUT-gauche -> V=1 en bas pour un rendu à l'endroit.
    val verts = floatArrayOf(
      -1f, -1f, 0f, 1f, // BL
      1f, -1f, 1f, 1f, // BR
      -1f, 1f, 0f, 0f, // TL
      1f, 1f, 1f, 0f, // TR
    )
    vertexBuffer.clear()
    vertexBuffer.put(verts)

    GLES20.glUseProgram(program)
    GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, texture)
    GLUtils.texImage2D(GLES20.GL_TEXTURE_2D, 0, bitmap, 0)
    GLES20.glUniform1i(uTexLoc, 0)

    vertexBuffer.position(0)
    GLES20.glEnableVertexAttribArray(aPositionLoc)
    GLES20.glVertexAttribPointer(aPositionLoc, 2, GLES20.GL_FLOAT, false, STRIDE, vertexBuffer)
    vertexBuffer.position(2)
    GLES20.glEnableVertexAttribArray(aTexCoordLoc)
    GLES20.glVertexAttribPointer(aTexCoordLoc, 2, GLES20.GL_FLOAT, false, STRIDE, vertexBuffer)

    GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)

    GLES20.glDisableVertexAttribArray(aPositionLoc)
    GLES20.glDisableVertexAttribArray(aTexCoordLoc)
  }

  fun release() {
    runCatching { GLES20.glDeleteTextures(1, intArrayOf(texture), 0) }
    runCatching { GLES20.glDeleteProgram(program) }
  }

  private fun buildProgram(vs: String, fs: String): Int {
    val v = loadShader(GLES20.GL_VERTEX_SHADER, vs)
    val f = loadShader(GLES20.GL_FRAGMENT_SHADER, fs)
    val p = GLES20.glCreateProgram()
    GLES20.glAttachShader(p, v)
    GLES20.glAttachShader(p, f)
    GLES20.glLinkProgram(p)
    val status = IntArray(1)
    GLES20.glGetProgramiv(p, GLES20.GL_LINK_STATUS, status, 0)
    if (status[0] == 0) {
      val log = GLES20.glGetProgramInfoLog(p)
      GLES20.glDeleteProgram(p)
      throw RuntimeException("Échec link programme boomerang: $log")
    }
    return p
  }

  private fun loadShader(type: Int, src: String): Int {
    val s = GLES20.glCreateShader(type)
    GLES20.glShaderSource(s, src)
    GLES20.glCompileShader(s)
    val status = IntArray(1)
    GLES20.glGetShaderiv(s, GLES20.GL_COMPILE_STATUS, status, 0)
    if (status[0] == 0) {
      val log = GLES20.glGetShaderInfoLog(s)
      GLES20.glDeleteShader(s)
      throw RuntimeException("Échec compile shader boomerang: $log")
    }
    return s
  }
}
