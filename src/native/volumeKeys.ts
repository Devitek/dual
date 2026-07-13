import { requireOptionalNativeModule } from 'expo-modules-core';

/** Action utilisateur pour les touches de volume (réglage). */
export type VolumeKeyAction = 'volume' | 'shutter' | 'zoom';
/** Mode « effectif » poussé au natif (ajoute 'off' quand désactivé/gaté). */
export type VolumeKeyMode = 'off' | VolumeKeyAction;
/** Touche matérielle reçue du natif. */
export type VolumeKey = 'up' | 'down' | 'camera';

interface VolumeKeyEvent {
  key: VolumeKey;
}

interface VolumeKeyNative {
  setVolumeKeyMode: (mode: VolumeKeyMode) => Promise<void>;
  addListener: (event: string, listener: (payload: VolumeKeyEvent) => void) => { remove: () => void };
}

// Même module natif que la composition PiP (VideoPipComposer).
const Native = requireOptionalNativeModule<VolumeKeyNative>('VideoPipComposer');

export const isVolumeKeyAvailable = Native != null && typeof Native.setVolumeKeyMode === 'function';

/** Pousse le mode effectif des touches de volume au natif (silencieux si indispo). */
export function setVolumeKeyMode(mode: VolumeKeyMode): void {
  Native?.setVolumeKeyMode?.(mode).catch(() => {});
}

/** S'abonne aux touches matérielles (obturateur/zoom/bouton caméra). */
export function subscribeVolumeKey(cb: (key: VolumeKey) => void): { remove: () => void } {
  if (Native == null) return { remove: () => {} };
  return Native.addListener('onVolumeKey', (event) => cb(event.key));
}
