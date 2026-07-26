package expo.modules.videopipcomposer

import android.graphics.Bitmap
import android.opengl.GLES20
import android.opengl.GLUtils
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

/**
 * Incruste une texture 2D (bitmap du filigrane « TwinLens ») dans un rectangle NDC,
 * avec blending alpha. Programme GL SÉPARÉ du renderer principal : si sa création
 * échoue, l'appelant retombe sur une vidéo sans filigrane (fail-safe).
 */
class WatermarkRenderer(bitmap: Bitmap) {
  private val program: Int
  private val texture: Int
  private val aPositionLoc: Int
  private val aTexCoordLoc: Int
  private val uTexLoc: Int
  private val vertexBuffer: FloatBuffer =
    ByteBuffer.allocateDirect(16 * 4).order(ByteOrder.nativeOrder()).asFloatBuffer()

  companion object {
    private const val STRIDE = 4 * 4 // 4 floats * 4 bytes

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
    GLUtils.texImage2D(GLES20.GL_TEXTURE_2D, 0, bitmap, 0)
  }

  /** Dessine le filigrane dans le rectangle NDC (x0,y0)-(x1,y1) avec blending. */
  fun draw(x0: Float, y0: Float, x1: Float, y1: Float) {
    // Le bitmap Android a l'origine en HAUT-gauche ; on met V=1 en bas / V=0 en
    // haut pour compenser le flip de GLUtils.texImage2D (image à l'endroit).
    val verts = floatArrayOf(
      x0, y0, 0f, 1f, // BL
      x1, y0, 1f, 1f, // BR
      x0, y1, 0f, 0f, // TL
      x1, y1, 1f, 0f, // TR
    )
    vertexBuffer.clear()
    vertexBuffer.put(verts)

    GLES20.glEnable(GLES20.GL_BLEND)
    // Bitmap Android en alpha prémultiplié -> blending prémultiplié.
    GLES20.glBlendFunc(GLES20.GL_ONE, GLES20.GL_ONE_MINUS_SRC_ALPHA)

    GLES20.glUseProgram(program)
    GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, texture)
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
    GLES20.glDisable(GLES20.GL_BLEND)
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
      throw RuntimeException("Échec link programme filigrane: $log")
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
      throw RuntimeException("Échec compile shader filigrane: $log")
    }
    return s
  }
}
