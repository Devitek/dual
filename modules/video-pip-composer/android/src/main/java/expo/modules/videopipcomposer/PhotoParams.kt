package expo.modules.videopipcomposer

import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/**
 * Paramètres de composition PiP PHOTO passés depuis le JS (Record Expo), pour
 * éviter la limite d'arguments positionnels des AsyncFunction.
 *
 * `insetW <= 0` ⇒ vignette au coin (`corner`), sinon vignette libre (fractions du cadre).
 */
class PhotoParams : Record {
  @Field var layout: String = "pip"
  @Field var corner: String = "top-right"
  @Field var insetX: Double = -1.0
  @Field var insetY: Double = -1.0
  @Field var insetW: Double = -1.0
  @Field var watermark: Boolean = false
  @Field var canvasWidth: Double = 1080.0
  /** Ratio du cadre `pip` : "full" (~3:4) | "square" (1:1) | "tall" (9:16). */
  @Field var outputRatio: String = "full"
  @Field var saveOriginals: Boolean = false
}
