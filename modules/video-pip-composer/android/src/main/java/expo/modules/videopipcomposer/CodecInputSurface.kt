package expo.modules.videopipcomposer

import android.graphics.SurfaceTexture
import android.opengl.EGL14
import android.opengl.EGLConfig
import android.opengl.EGLContext
import android.opengl.EGLDisplay
import android.opengl.EGLExt
import android.opengl.EGLSurface
import android.opengl.GLES11Ext
import android.opengl.GLES20
import android.os.Handler
import android.os.HandlerThread
import android.view.Surface

/**
 * Texture externe OES alimentée par un décodeur MediaCodec (via son SurfaceTexture).
 * `awaitAndUpdate()` bloque jusqu'à ce qu'une nouvelle frame soit dispo puis
 * l'attache au contexte GL courant.
 */
class OesInput(handler: Handler) {
  val textureId: Int
  val surfaceTexture: SurfaceTexture
  val surface: Surface

  private val lock = java.lang.Object()
  private var frameAvailable = false

  init {
    val tex = IntArray(1)
    GLES20.glGenTextures(1, tex, 0)
    textureId = tex[0]
    GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId)
    GLES20.glTexParameterf(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR.toFloat())
    GLES20.glTexParameterf(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR.toFloat())
    GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
    GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)

    surfaceTexture = SurfaceTexture(textureId)
    surfaceTexture.setOnFrameAvailableListener({
      synchronized(lock) {
        frameAvailable = true
        lock.notifyAll()
      }
    }, handler)
    surface = Surface(surfaceTexture)
  }

  fun awaitAndUpdate(timeoutMs: Long = 2500): Boolean {
    synchronized(lock) {
      val deadline = System.currentTimeMillis() + timeoutMs
      while (!frameAvailable) {
        val remaining = deadline - System.currentTimeMillis()
        if (remaining <= 0) return false
        lock.wait(remaining)
      }
      frameAvailable = false
    }
    surfaceTexture.updateTexImage()
    return true
  }

  fun getTransform(m: FloatArray) = surfaceTexture.getTransformMatrix(m)

  fun release() {
    surface.release()
    surfaceTexture.release()
  }
}

/**
 * Contexte EGL adossé à la Surface d'entrée de l'encodeur MediaCodec, hébergeant
 * deux textures OES (arrière + avant). On dessine dans cette surface -> l'encodeur.
 */
class CodecInputSurface(encoderSurface: Surface) {
  private var eglDisplay: EGLDisplay = EGL14.EGL_NO_DISPLAY
  private var eglContext: EGLContext = EGL14.EGL_NO_CONTEXT
  private var eglSurface: EGLSurface = EGL14.EGL_NO_SURFACE

  private val handlerThread = HandlerThread("PipFrameListener").apply { start() }
  private val handler = Handler(handlerThread.looper)

  val back: OesInput
  val front: OesInput

  init {
    eglDisplay = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
    val version = IntArray(2)
    EGL14.eglInitialize(eglDisplay, version, 0, version, 1)

    val cfgAttribs = intArrayOf(
      EGL14.EGL_RED_SIZE, 8,
      EGL14.EGL_GREEN_SIZE, 8,
      EGL14.EGL_BLUE_SIZE, 8,
      EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT,
      EGLExt.EGL_RECORDABLE_ANDROID, 1,
      EGL14.EGL_NONE,
    )
    val configs = arrayOfNulls<EGLConfig>(1)
    val numConfig = IntArray(1)
    EGL14.eglChooseConfig(eglDisplay, cfgAttribs, 0, configs, 0, 1, numConfig, 0)

    val ctxAttribs = intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE)
    eglContext = EGL14.eglCreateContext(eglDisplay, configs[0], EGL14.EGL_NO_CONTEXT, ctxAttribs, 0)

    val surfAttribs = intArrayOf(EGL14.EGL_NONE)
    eglSurface = EGL14.eglCreateWindowSurface(eglDisplay, configs[0], encoderSurface, surfAttribs, 0)

    makeCurrent()
    back = OesInput(handler)
    front = OesInput(handler)
  }

  fun makeCurrent() {
    EGL14.eglMakeCurrent(eglDisplay, eglSurface, eglSurface, eglContext)
  }

  fun swapBuffers(): Boolean = EGL14.eglSwapBuffers(eglDisplay, eglSurface)

  fun setPresentationTime(nsecs: Long) {
    EGLExt.eglPresentationTimeANDROID(eglDisplay, eglSurface, nsecs)
  }

  fun release() {
    if (eglDisplay != EGL14.EGL_NO_DISPLAY) {
      EGL14.eglMakeCurrent(eglDisplay, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
      EGL14.eglDestroySurface(eglDisplay, eglSurface)
      EGL14.eglDestroyContext(eglDisplay, eglContext)
      EGL14.eglReleaseThread()
      EGL14.eglTerminate(eglDisplay)
    }
    eglDisplay = EGL14.EGL_NO_DISPLAY
    eglContext = EGL14.EGL_NO_CONTEXT
    eglSurface = EGL14.EGL_NO_SURFACE
    back.release()
    front.release()
    handlerThread.quitSafely()
  }
}
