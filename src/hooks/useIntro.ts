import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type IntroMode = 'onboarding' | 'whatsnew';

const ONBOARDED_KEY = 'tl_onboarded';
const WHATSNEW_KEY = 'tl_whatsnew_rev';

/**
 * Révision du contenu « Nouveautés ». À INCRÉMENTER volontairement pour re-montrer
 * la feuille des nouveautés après une mise à jour marquante (découplé de la version
 * app / release-please : on ne spamme les utilisateurs que quand on le décide).
 */
export const WHATS_NEW_REV = 1;

/**
 * Décide quelle feuille d'intro afficher, une seule fois, quand l'UI principale est
 * prête (`ready`) :
 *  - jamais onboardé -> `onboarding` ;
 *  - déjà onboardé mais révision « Nouveautés » périmée -> `whatsnew`.
 * La persistance (AsyncStorage) garantit qu'elle ne réapparaît pas après un kill.
 */
export function useIntro(ready: boolean): { introMode: IntroMode | null; dismissIntro: () => void } {
  const [mode, setMode] = useState<IntroMode | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void (async () => {
      try {
        const pairs = await AsyncStorage.multiGet([ONBOARDED_KEY, WHATSNEW_KEY]);
        if (cancelled) return;
        const map = Object.fromEntries(pairs);
        if (map[ONBOARDED_KEY] !== '1') {
          setMode('onboarding');
        } else if (Number(map[WHATSNEW_KEY] ?? 0) < WHATS_NEW_REV) {
          setMode('whatsnew');
        }
      } catch {
        // best-effort : en cas d'échec de lecture on ne montre rien
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  const dismissIntro = useCallback(() => {
    setMode(null);
    // On marque à la fois « onboardé » et la révision courante des nouveautés :
    // une nouvelle installation qui vient de voir l'onboarding ne verra pas en
    // plus la feuille « Nouveautés » du même contenu.
    void AsyncStorage.multiSet([
      [ONBOARDED_KEY, '1'],
      [WHATSNEW_KEY, String(WHATS_NEW_REV)],
    ]).catch(() => {});
  }, []);

  return { introMode: mode, dismissIntro };
}
