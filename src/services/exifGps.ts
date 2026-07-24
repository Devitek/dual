/**
 * Écriture des tags GPS EXIF dans une photo JPEG, 100 % on-device (piexifjs).
 *
 * Utilisé par le géotag opt-in : on lit la position (expo-location), puis on
 * l'inscrit dans l'EXIF du fichier final AVANT sa sauvegarde en galerie. Rien
 * n'est transmis — la localisation reste dans le fichier, comme l'appareil natif.
 *
 * On charge l'EXIF existant et on ne remplace QUE le bloc GPS (l'orientation et
 * les autres tags sont préservés). L'I/O passe par `expo-file-system/legacy`
 * (base64), comme `expo-media-library/legacy` ailleurs dans l'app.
 */
import { EncodingType, readAsStringAsync, writeAsStringAsync } from 'expo-file-system/legacy';
import { decode as b64decode, encode as b64encode } from 'base-64';
import piexif from 'piexifjs';

export interface GpsCoords {
  latitude: number;
  longitude: number;
  /** Altitude en mètres (optionnelle). */
  altitude?: number | null;
}

/** Convertit une coordonnée décimale en degrés/minutes/secondes (rationnels EXIF). */
function toDMSRational(dec: number): [number, number][] {
  const abs = Math.abs(dec);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = (minFloat - min) * 60;
  return [
    [deg, 1],
    [min, 1],
    [Math.round(sec * 1000), 1000],
  ];
}

/**
 * Inscrit `coords` dans les tags GPS EXIF du JPEG `fileUri` (in-place).
 * Best-effort : lève en cas d'échec d'I/O ; l'appelant l'englobe dans un try.
 */
export async function writeGpsToJpeg(fileUri: string, coords: GpsCoords): Promise<void> {
  const b64 = await readAsStringAsync(fileUri, { encoding: EncodingType.Base64 });
  const binary = b64decode(b64);

  let exifObj: Record<string, unknown>;
  try {
    exifObj = piexif.load(binary) as Record<string, unknown>;
  } catch {
    exifObj = { '0th': {}, Exif: {}, GPS: {}, '1st': {}, thumbnail: null };
  }

  const gps: Record<number, unknown> = { ...((exifObj.GPS as Record<number, unknown>) ?? {}) };
  gps[piexif.GPSIFD.GPSLatitudeRef] = coords.latitude >= 0 ? 'N' : 'S';
  gps[piexif.GPSIFD.GPSLatitude] = toDMSRational(coords.latitude);
  gps[piexif.GPSIFD.GPSLongitudeRef] = coords.longitude >= 0 ? 'E' : 'W';
  gps[piexif.GPSIFD.GPSLongitude] = toDMSRational(coords.longitude);
  if (coords.altitude != null && Number.isFinite(coords.altitude)) {
    gps[piexif.GPSIFD.GPSAltitudeRef] = coords.altitude < 0 ? 1 : 0;
    gps[piexif.GPSIFD.GPSAltitude] = [Math.round(Math.abs(coords.altitude) * 100), 100];
  }
  exifObj.GPS = gps;

  const exifBytes = piexif.dump(exifObj);
  const newBinary = piexif.insert(exifBytes, binary);
  await writeAsStringAsync(fileUri, b64encode(newBinary), { encoding: EncodingType.Base64 });
}
