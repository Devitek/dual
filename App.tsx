import React from 'react';
import { StatusBar } from 'expo-status-bar';

import { MultiCameraScreen } from './src/screens/MultiCameraScreen';

/**
 * Point d'entrée de l'application.
 *
 * ⚠️ Cette app embarque du code natif (react-native-vision-camera) :
 * elle NE fonctionne PAS dans Expo Go. Utilisez une Development Build
 * (`npx expo run:ios` / `npx expo run:android` ou EAS Build).
 */
export default function App(): React.ReactElement {
  return (
    <>
      <StatusBar style="light" hidden />
      <MultiCameraScreen />
    </>
  );
}
