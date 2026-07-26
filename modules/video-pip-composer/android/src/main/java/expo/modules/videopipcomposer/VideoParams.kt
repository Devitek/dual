package expo.modules.videopipcomposer

import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/**
 * Paramètres de composition PiP VIDÉO passés depuis le JS (Record Expo).
 *
 * `insetW <= 0` ⇒ vignette au coin (`corner`), sinon vignette libre (fractions du cadre).
 */
class VideoParams : Record {
  @Field var layout: String = "pip"
  @Field var corner: String = "top-right"
  @Field var insetX: Double = -1.0
  @Field var insetY: Double = -1.0
  @Field var insetW: Double = -1.0
  @Field var watermark: Boolean = false
  @Field var bitRate: Double = 0.0
  @Field var saveOriginals: Boolean = false
}
