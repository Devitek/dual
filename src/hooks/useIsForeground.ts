import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * Indique si l'application est au premier plan (`active`).
 *
 * On l'utilise pour désactiver la caméra (`isActive={false}`) quand l'app passe
 * en arrière-plan / est masquée. C'est CRITIQUE : garder une session caméra
 * active en background provoque des crashs natifs et gaspille la batterie.
 *
 * Alternative dans une app multi-écrans : `useIsFocused()` de
 * `@react-navigation/native`, à combiner avec ce hook.
 */
export function useIsForeground(): boolean {
  const [isForeground, setIsForeground] = useState<boolean>(
    AppState.currentState === 'active',
  );

  useEffect(() => {
    const onChange = (state: AppStateStatus): void => {
      setIsForeground(state === 'active');
    };

    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  }, []);

  return isForeground;
}
