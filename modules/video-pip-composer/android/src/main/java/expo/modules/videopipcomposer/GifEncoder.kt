package expo.modules.videopipcomposer

import android.graphics.Bitmap
import java.io.OutputStream

/**
 * Encodeur GIF89a animé minimal et *correct par construction* :
 *  - palette FIXE de 216 couleurs (cube web-safe 6×6×6) + rampe de gris -> pas
 *    d'algorithme de quantification (donc pas de bug de quantification) ;
 *  - compression LZW conforme GIF (largeur de code variable, règle d'incrément
 *    alignée sur giflib, clear/end codes, sous-blocs de 255 octets).
 *
 * Qualité « fun » (léger banding) mais fiable, adaptée à un boomerang partageable.
 * Boucle à l'infini (extension NETSCAPE2.0).
 */
class GifEncoder(private val out: OutputStream) {
  private val palette = buildPalette()
  private var started = false
  private var width = 0
  private var height = 0

  /** Écrit un frame (toutes les frames doivent avoir la même taille). `delayMs` en ms. */
  fun addFrame(bitmap: Bitmap, delayMs: Int) {
    if (!started) {
      width = bitmap.width
      height = bitmap.height
      writeHeader()
      writeLoopExtension()
      started = true
    }
    val indices = quantize(bitmap)
    writeGraphicControl(delayMs)
    writeImageDescriptor()
    LzwWriter(out).encode(indices, 8)
  }

  fun finish() {
    out.write(0x3B) // trailer
    out.flush()
  }

  // ---- Structures GIF ----

  private fun writeHeader() {
    out.write("GIF89a".toByteArray(Charsets.US_ASCII))
    writeShort(width)
    writeShort(height)
    // GCT présent, résolution 8 bits, taille GCT = 256 (2^(7+1)) -> 0xF7
    out.write(0xF7)
    out.write(0) // couleur de fond
    out.write(0) // aspect ratio
    out.write(palette) // 256 * 3 octets
  }

  private fun writeLoopExtension() {
    out.write(0x21); out.write(0xFF); out.write(0x0B)
    out.write("NETSCAPE2.0".toByteArray(Charsets.US_ASCII))
    out.write(0x03); out.write(0x01)
    writeShort(0) // 0 = boucle infinie
    out.write(0x00)
  }

  private fun writeGraphicControl(delayMs: Int) {
    out.write(0x21); out.write(0xF9); out.write(0x04)
    out.write(0x04) // disposal = 1 (ne pas disposer), pas de transparence
    writeShort((delayMs / 10).coerceAtLeast(2)) // centièmes de seconde
    out.write(0x00) // index transparent (inutilisé)
    out.write(0x00) // terminateur du bloc
  }

  private fun writeImageDescriptor() {
    out.write(0x2C)
    writeShort(0); writeShort(0) // left, top
    writeShort(width); writeShort(height)
    out.write(0x00) // pas de table locale
  }

  private fun writeShort(v: Int) {
    out.write(v and 0xFF)
    out.write((v shr 8) and 0xFF)
  }

  /** Convertit un bitmap en indices palette (cube 6×6×6). */
  private fun quantize(bitmap: Bitmap): ByteArray {
    val n = width * height
    val pixels = IntArray(n)
    bitmap.getPixels(pixels, 0, width, 0, 0, width, height)
    val out = ByteArray(n)
    for (i in 0 until n) {
      val p = pixels[i]
      val r = (p shr 16) and 0xFF
      val g = (p shr 8) and 0xFF
      val b = p and 0xFF
      val ri = (r * 5 + 127) / 255
      val gi = (g * 5 + 127) / 255
      val bi = (b * 5 + 127) / 255
      out[i] = (ri * 36 + gi * 6 + bi).toByte() // 0..215
    }
    return out
  }

  companion object {
    /** Palette 256*3 : cube web-safe 6×6×6 (216) + rampe de gris (40). */
    private fun buildPalette(): ByteArray {
      val p = ByteArray(256 * 3)
      var idx = 0
      for (ri in 0..5) for (gi in 0..5) for (bi in 0..5) {
        p[idx * 3] = (ri * 51).toByte()
        p[idx * 3 + 1] = (gi * 51).toByte()
        p[idx * 3 + 2] = (bi * 51).toByte()
        idx++
      }
      // 216..255 : gris (non ciblés par le mapping, mais palette pleine et valide)
      for (i in 0 until 40) {
        val v = (i * 255 / 39)
        p[idx * 3] = v.toByte()
        p[idx * 3 + 1] = v.toByte()
        p[idx * 3 + 2] = v.toByte()
        idx++
      }
      return p
    }
  }
}

/**
 * Compression LZW GIF : codes de largeur variable empaquetés LSB-first, découpés
 * en sous-blocs de 255 octets. Règle d'incrément de largeur alignée sur giflib
 * (`nextCode > maxCode` où maxCode = 2^codeSize − 1).
 */
private class LzwWriter(private val out: OutputStream) {
  private val block = ByteArray(255)
  private var blockLen = 0
  private var bitBuffer = 0
  private var bitCount = 0

  fun encode(pixels: ByteArray, minCodeSize: Int) {
    out.write(minCodeSize)
    val clearCode = 1 shl minCodeSize
    val endCode = clearCode + 1
    var codeSize = minCodeSize + 1
    var nextCode = endCode + 1
    val dict = HashMap<Int, Int>()

    writeCode(clearCode, codeSize)
    if (pixels.isEmpty()) {
      writeCode(endCode, codeSize)
      flushBits()
      flushBlock()
      return
    }
    var prefix = pixels[0].toInt() and 0xFF
    for (i in 1 until pixels.size) {
      val k = pixels[i].toInt() and 0xFF
      val key = (prefix shl 8) or k
      val existing = dict[key]
      if (existing != null) {
        prefix = existing
      } else {
        writeCode(prefix, codeSize)
        dict[key] = nextCode
        nextCode++
        if (nextCode > (1 shl codeSize) - 1) {
          if (codeSize == 12) {
            writeCode(clearCode, codeSize)
            dict.clear()
            codeSize = minCodeSize + 1
            nextCode = endCode + 1
          } else {
            codeSize++
          }
        }
        prefix = k
      }
    }
    writeCode(prefix, codeSize)
    writeCode(endCode, codeSize)
    flushBits()
    flushBlock()
  }

  private fun writeCode(code: Int, size: Int) {
    bitBuffer = bitBuffer or (code shl bitCount)
    bitCount += size
    while (bitCount >= 8) {
      pushByte(bitBuffer and 0xFF)
      bitBuffer = bitBuffer ushr 8
      bitCount -= 8
    }
  }

  private fun flushBits() {
    if (bitCount > 0) {
      pushByte(bitBuffer and 0xFF)
      bitBuffer = 0
      bitCount = 0
    }
  }

  private fun pushByte(b: Int) {
    block[blockLen++] = b.toByte()
    if (blockLen == 255) {
      out.write(255)
      out.write(block, 0, 255)
      blockLen = 0
    }
  }

  /** Écrit le dernier sous-bloc partiel + le terminateur (0x00). */
  private fun flushBlock() {
    if (blockLen > 0) {
      out.write(blockLen)
      out.write(block, 0, blockLen)
      blockLen = 0
    }
    out.write(0x00)
  }
}
