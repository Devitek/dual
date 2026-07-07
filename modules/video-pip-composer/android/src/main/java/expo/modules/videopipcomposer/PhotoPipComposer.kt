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
import android.media.ExifInterface
import java.io.FileOutputStream
import java.io.IOException

/**
 * Composition PiP PHOTO on-device (Android Canvas) : décodage des 2 JPEG (avec
 * orientation EXIF), dessin arrière plein cadre + vignette (coins arrondis +
 * bordure blanche) au coin choisi, ré-encodage JPEG.
 */
class PhotoPipComposer(
  private val primaryPath: String,
  private val secondaryPath: String,
  private val outputPath: String,
  private val corner: String,
  private val canvasWidth: Int,
  private val insetWidthRatio: Float,
  private val marginRatio: Float,
) {
  fun compose() {
    val canvasW = canvasWidth
    val canvasH = (canvasWidth * 4f / 3f).toInt() // portrait 3:4
    val output = Bitmap.createBitmap(canvasW, canvasH, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(output)
    canvas.drawColor(Color.BLACK)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)

    // 1) Arrière plein cadre (cover / center-crop)
    val primary = decodeOriented(primaryPath, canvasW, canvasH)
    drawCover(canvas, primary, RectF(0f, 0f, canvasW.toFloat(), canvasH.toFloat()), paint)
    primary.recycle()

    // 2) Vignette (avant) : rectangle du coin choisi + coins arrondis + bordure
    val insetW = canvasW * insetWidthRatio
    val insetH = insetW * (canvasH.toFloat() / canvasW.toFloat())
    val margin = canvasW * marginRatio
    val isTop = corner.startsWith("top")
    val isLeft = corner.endsWith("left")
    val left = if (isLeft) margin else canvasW - margin - insetW
    val top = if (isTop) margin else canvasH - margin - insetH
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

    // 3) Encode JPEG
    FileOutputStream(outputPath).use { output.compress(Bitmap.CompressFormat.JPEG, 95, it) }
    output.recycle()
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
