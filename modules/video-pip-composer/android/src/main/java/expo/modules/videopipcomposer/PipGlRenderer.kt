package expo.modules.videopipcomposer

import android.opengl.GLES11Ext
import android.opengl.GLES20
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

/**
 * Programme GLES2 : dessine une texture externe (OES) dans un rectangle NDC.
 * Pour la vignette (inset), un masque "rounded-rect" (SDF) applique coins
 * arrondis + bordure blanche, comme l'aperçu de l'app.
 */
class PipGlRenderer {
  private val program: Int
  private val aPositionLoc: Int
  private val aTexCoordLoc: Int
  private val aLocalLoc: Int
  private val uStMatrixLoc: Int
  private val uRoundedLoc: Int
  private val uSizePxLoc: Int
  private val uRadiusPxLoc: Int
  private val uBorderPxLoc: Int

  // 4 sommets x 6 floats (x, y, u, v, localU, localV)
  private val vertexBuffer: FloatBuffer =
    ByteBuffer.allocateDirect(24 * 4).order(ByteOrder.nativeOrder()).asFloatBuffer()

  companion object {
    private const val STRIDE = 6 * 4 // 6 floats * 4 bytes

    private const val VERTEX_SHADER = """
      uniform mat4 uSTMatrix;
      attribute vec4 aPosition;
      attribute vec4 aTexCoord;
      attribute vec2 aLocal;
      varying vec2 vTexCoord;
      varying vec2 vLocal;
      void main() {
        gl_Position = aPosition;
        vTexCoord = (uSTMatrix * aTexCoord).xy;
        vLocal = aLocal;
      }
    """

    private const val FRAGMENT_SHADER = """
      #extension GL_OES_EGL_image_external : require
      precision mediump float;
      varying vec2 vTexCoord;
      varying vec2 vLocal;
      uniform samplerExternalOES sTexture;
      uniform float uRounded;
      uniform vec2 uSizePx;
      uniform float uRadiusPx;
      uniform float uBorderPx;
      void main() {
        vec4 tex = texture2D(sTexture, vTexCoord);
        if (uRounded < 0.5) { gl_FragColor = tex; return; }
        vec2 p = vLocal * uSizePx;
        vec2 halfSize = uSizePx * 0.5;
        vec2 q = abs(p - halfSize) - (halfSize - vec2(uRadiusPx));
        float dist = length(max(q, vec2(0.0))) - uRadiusPx;
        if (dist > 0.0) { discard; }
        if (dist > -uBorderPx) { gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0); return; }
        gl_FragColor = tex;
      }
    """
  }

  init {
    program = buildProgram(VERTEX_SHADER, FRAGMENT_SHADER)
    aPositionLoc = GLES20.glGetAttribLocation(program, "aPosition")
    aTexCoordLoc = GLES20.glGetAttribLocation(program, "aTexCoord")
    aLocalLoc = GLES20.glGetAttribLocation(program, "aLocal")
    uStMatrixLoc = GLES20.glGetUniformLocation(program, "uSTMatrix")
    uRoundedLoc = GLES20.glGetUniformLocation(program, "uRounded")
    uSizePxLoc = GLES20.glGetUniformLocation(program, "uSizePx")
    uRadiusPxLoc = GLES20.glGetUniformLocation(program, "uRadiusPx")
    uBorderPxLoc = GLES20.glGetUniformLocation(program, "uBorderPx")
  }

  fun clear() {
    GLES20.glClearColor(0f, 0f, 0f, 1f)
    GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
  }

  /** Dessine plein cadre (pas d'arrondi). */
  fun drawFull(textureId: Int, stMatrix: FloatArray) {
    draw(textureId, stMatrix, -1f, -1f, 1f, 1f, false, 0f, 0f, 0f, 0f)
  }

  /** Dessine la vignette dans le rectangle NDC avec coins arrondis + bordure. */
  fun drawInset(
    textureId: Int,
    stMatrix: FloatArray,
    x0: Float, y0: Float, x1: Float, y1: Float,
    sizePxW: Float, sizePxH: Float, radiusPx: Float, borderPx: Float,
  ) {
    draw(textureId, stMatrix, x0, y0, x1, y1, true, sizePxW, sizePxH, radiusPx, borderPx)
  }

  private fun draw(
    textureId: Int, stMatrix: FloatArray,
    x0: Float, y0: Float, x1: Float, y1: Float,
    rounded: Boolean, sizePxW: Float, sizePxH: Float, radiusPx: Float, borderPx: Float,
  ) {
    // BL, BR, TL, TR — [x, y, u, v, localU, localV]
    val verts = floatArrayOf(
      x0, y0, 0f, 0f, 0f, 0f,
      x1, y0, 1f, 0f, 1f, 0f,
      x0, y1, 0f, 1f, 0f, 1f,
      x1, y1, 1f, 1f, 1f, 1f,
    )
    vertexBuffer.clear()
    vertexBuffer.put(verts)

    GLES20.glUseProgram(program)
    GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
    GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId)

    vertexBuffer.position(0)
    GLES20.glEnableVertexAttribArray(aPositionLoc)
    GLES20.glVertexAttribPointer(aPositionLoc, 2, GLES20.GL_FLOAT, false, STRIDE, vertexBuffer)
    vertexBuffer.position(2)
    GLES20.glEnableVertexAttribArray(aTexCoordLoc)
    GLES20.glVertexAttribPointer(aTexCoordLoc, 2, GLES20.GL_FLOAT, false, STRIDE, vertexBuffer)
    vertexBuffer.position(4)
    GLES20.glEnableVertexAttribArray(aLocalLoc)
    GLES20.glVertexAttribPointer(aLocalLoc, 2, GLES20.GL_FLOAT, false, STRIDE, vertexBuffer)

    GLES20.glUniformMatrix4fv(uStMatrixLoc, 1, false, stMatrix, 0)
    GLES20.glUniform1f(uRoundedLoc, if (rounded) 1f else 0f)
    GLES20.glUniform2f(uSizePxLoc, sizePxW, sizePxH)
    GLES20.glUniform1f(uRadiusPxLoc, radiusPx)
    GLES20.glUniform1f(uBorderPxLoc, borderPx)

    GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)

    GLES20.glDisableVertexAttribArray(aPositionLoc)
    GLES20.glDisableVertexAttribArray(aTexCoordLoc)
    GLES20.glDisableVertexAttribArray(aLocalLoc)
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
      throw RuntimeException("Échec link programme GL: $log")
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
      throw RuntimeException("Échec compile shader: $log")
    }
    return s
  }
}
