package expo.modules.videopipcomposer

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.media.ExifInterface
import java.io.FileOutputStream
import java.io.IOException

/**
 * Composition PiP PHOTO on-device (Android Canvas). Gère les dispositions
 * (`pip` / `sideBySide` / `topBottom`), la vignette libre (drag/pinch) OU au coin,
 * et un filigrane optionnel. Décode les 2 JPEG avec orientation EXIF, dessine, et
 * ré-encode en JPEG. Géométrie alignée sur le compositeur JS (`PipCompositor`).
 */
class PhotoPipComposer(
  private val primaryPath: String,
  private val secondaryPath: String,
  private val outputPath: String,
  private val layout: String,
  private val corner: String,
  /** Vignette libre (fractions du cadre) ; `insetWFrac <= 0` ⇒ utiliser le coin. */
  private val insetXFrac: Float,
  private val insetYFrac: Float,
  private val insetWFrac: Float,
  private val watermark: Boolean,
  private val canvasWidth: Int,
  /** Ratio du cadre `pip` : "full" (~3:4) | "square" (1:1) | "tall" (9:16). */
  private val outputRatio: String,
  private val insetWidthRatio: Float,
  private val marginRatio: Float,
) {
  companion object {
    /** Ratio hauteur/largeur de la vignette (portrait), aligné sur PIP_INSET_ASPECT JS. */
    private val PIP_INSET_ASPECT = 172f / 120f

    /** Facteur hauteur/largeur du canvas `pip` selon le ratio de sortie (aligné JS). */
    fun pipRatioFactor(ratio: String): Float = when (ratio) {
      "square" -> 1f // 1:1
      "tall" -> 16f / 9f // 9:16 vertical
      else -> 4f / 3f // full (~3:4)
    }
  }

  fun compose() {
    val cw = canvasWidth
    // Dimensions du canvas selon la disposition (identiques au JS `canvasSize`).
    val ch = when (layout) {
      "sideBySide" -> (cw * 2f / 3f).toInt() // 2 moitiés portrait -> paysage 3:2
      "topBottom" -> (cw * 3f / 2f).toInt() // 2 moitiés paysage -> portrait 2:3
      else -> (cw * pipRatioFactor(outputRatio)).toInt() // pip : ratio de sortie (full/1:1/9:16)
    }
    val output = Bitmap.createBitmap(cw, ch, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(output)
    canvas.drawColor(Color.BLACK)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)

    when (layout) {
      "sideBySide" -> {
        val half = cw / 2f
        val primary = decodeOriented(primaryPath, half.toInt(), ch)
        drawCover(canvas, primary, RectF(0f, 0f, half, ch.toFloat()), paint)
        primary.recycle()
        val secondary = decodeOriented(secondaryPath, half.toInt(), ch)
        drawCover(canvas, secondary, RectF(half, 0f, cw.toFloat(), ch.toFloat()), paint)
        secondary.recycle()
      }
      "topBottom" -> {
        val half = ch / 2f
        val primary = decodeOriented(primaryPath, cw, half.toInt())
        drawCover(canvas, primary, RectF(0f, 0f, cw.toFloat(), half), paint)
        primary.recycle()
        val secondary = decodeOriented(secondaryPath, cw, half.toInt())
        drawCover(canvas, secondary, RectF(0f, half, cw.toFloat(), ch.toFloat()), paint)
        secondary.recycle()
      }
      else -> {
        // pip : principale plein cadre + vignette (libre ou au coin)
        val primary = decodeOriented(primaryPath, cw, ch)
        drawCover(canvas, primary, RectF(0f, 0f, cw.toFloat(), ch.toFloat()), paint)
        primary.recycle()
        drawInset(canvas, ch, paint)
      }
    }

    if (watermark) drawWatermark(canvas, cw, ch)

    FileOutputStream(outputPath).use { output.compress(Bitmap.CompressFormat.JPEG, 95, it) }
    output.recycle()
  }

  private fun drawInset(canvas: Canvas, canvasH: Int, paint: Paint) {
    val cw = canvasWidth.toFloat()
    val ch = canvasH.toFloat()
    val insetW: Float
    val insetH: Float
    val left: Float
    val top: Float
    if (insetWFrac > 0f) {
      // Vignette libre (drag/pinch)
      insetW = insetWFrac * cw
      insetH = insetW * PIP_INSET_ASPECT
      left = insetXFrac * cw
      top = insetYFrac * ch
    } else {
      // Vignette au coin
      insetW = cw * insetWidthRatio
      insetH = insetW * (ch / cw)
      val margin = cw * marginRatio
      val isTop = corner.startsWith("top")
      val isLeft = corner.endsWith("left")
      left = if (isLeft) margin else cw - margin - insetW
      top = if (isTop) margin else ch - margin - insetH
    }
    val insetRect = RectF(left, top, left + insetW, top + insetH)
    val radius = insetW * 0.09f

    val front = decodeOriented(secondaryPath, insetW.toInt().coerceAtLeast(1), insetH.toInt().coerceAtLeast(1))
    val clip = Path().apply { addRoundRect(insetRect, radius, radius, Path.Direction.CW) }
    canvas.save()
    canvas.clipPath(clip)
    drawCover(canvas, front, insetRect, paint)
    canvas.restore()
    front.recycle()

    val border = maxOf(4f, insetW * 0.02f)
    val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      style = Paint.Style.STROKE
      strokeWidth = border
      color = Color.WHITE
    }
    val strokeRect = RectF(insetRect).apply { inset(border / 2f, border / 2f) }
    canvas.drawRoundRect(strokeRect, radius, radius, borderPaint)
  }

  private fun drawWatermark(canvas: Canvas, cw: Int, ch: Int) {
    val pad = cw * 0.028f
    val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.argb(230, 255, 255, 255)
      textSize = cw * 0.03f
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
      textAlign = Paint.Align.RIGHT
      setShadowLayer(3f, 0f, 1f, Color.argb(140, 0, 0, 0))
    }
    canvas.drawText("TwinLens", cw - pad, ch - pad, textPaint)
  }

  private fun drawCover(canvas: Canvas, bmp: Bitmap, dst: RectF, paint: Paint) {
    val bw = bmp.width.toFloat()
    val bh = bmp.height.toFloat()
    val dstAspect = dst.width() / dst.height()
    val srcAspect = bw / bh
    val src: Rect = if (srcAspect > dstAspect) {
      val cropW = bh * dstAspect
      val x = (bw - cropW) / 2f
      Rect(x.toInt(), 0, (x + cropW).toInt(), bh.toInt())
    } else {
      val cropH = bw / dstAspect
      val y = (bh - cropH) / 2f
      Rect(0, y.toInt(), bw.toInt(), (y + cropH).toInt())
    }
    canvas.drawBitmap(bmp, src, dst, paint)
  }

  private fun decodeOriented(path: String, reqW: Int, reqH: Int): Bitmap {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(path, bounds)
    val opts = BitmapFactory.Options().apply {
      inSampleSize = calcSampleSize(bounds.outWidth, bounds.outHeight, reqW, reqH)
    }
    val bmp = BitmapFactory.decodeFile(path, opts) ?: throw IOException("Décodage impossible: $path")

    val orientation = try {
      ExifInterface(path).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
    } catch (e: Exception) {
      ExifInterface.ORIENTATION_NORMAL
    }
    val matrix = Matrix()
    when (orientation) {
      ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
      ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
      ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
      ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f)
      ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1f, -1f)
      ExifInterface.ORIENTATION_TRANSPOSE -> {
        matrix.postRotate(90f); matrix.postScale(-1f, 1f)
      }
      ExifInterface.ORIENTATION_TRANSVERSE -> {
        matrix.postRotate(270f); matrix.postScale(-1f, 1f)
      }
      else -> return bmp
    }
    val rotated = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, matrix, true)
    if (rotated != bmp) bmp.recycle()
    return rotated
  }

  private fun calcSampleSize(width: Int, height: Int, reqW: Int, reqH: Int): Int {
    if (reqW <= 0 || reqH <= 0 || width <= 0 || height <= 0) return 1
    var sample = 1
    var w = width
    var h = height
    while (w / 2 >= reqW && h / 2 >= reqH) {
      w /= 2
      h /= 2
      sample *= 2
    }
    return sample
  }
}
