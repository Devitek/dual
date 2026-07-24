declare module 'piexifjs' {
  /** Sous-ensemble typé de l'API piexifjs utilisée par l'app (écriture GPS). */
  interface Piexif {
    GPSIFD: {
      GPSLatitudeRef: number;
      GPSLatitude: number;
      GPSLongitudeRef: number;
      GPSLongitude: number;
      GPSAltitudeRef: number;
      GPSAltitude: number;
    };
    ImageIFD: Record<string, number>;
    ExifIFD: Record<string, number>;
    /** Charge les métadonnées EXIF d'une image JPEG (binary string). */
    load: (jpegData: string) => Record<string, Record<number, unknown> | unknown>;
    /** Sérialise un objet EXIF en octets (binary string). */
    dump: (exifObj: Record<string, unknown>) => string;
    /** Insère des octets EXIF dans un JPEG (binary string) et renvoie le nouveau JPEG. */
    insert: (exifBytes: string, jpegData: string) => string;
    /** Retire tout l'EXIF d'un JPEG. */
    remove: (jpegData: string) => string;
  }
  const piexif: Piexif;
  export default piexif;
}
