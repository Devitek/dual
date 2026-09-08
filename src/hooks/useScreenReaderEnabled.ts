import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Vrai quand un lecteur d'écran (TalkBack) est actif. Sert à proposer des
 * alternatives aux parcours 100 % gestuels (#163) : les swipes du viewer sont
 * invisibles pour TalkBack, on affiche alors de vrais boutons.
 */
export function useScreenReaderEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((v) => {
      if (active) setEnabled(v);
    });
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setEnabled);
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  return enabled;
}
