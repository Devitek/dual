import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { MultiCameraScreen } from './src/screens/MultiCameraScreen';

/**
 * Point d'entrée de l'application.
 *
 * ⚠️ Cette app embarque du code natif (react-native-vision-camera) :
 * elle NE fonctionne PAS dans Expo Go. Utilisez une Development Build
 * (`npx expo run:ios` / `npx expo run:android` ou EAS Build).
 *
 * `GestureHandlerRootView` est requis à la racine pour le tap-to-focus
 * (react-native-gesture-handler).
 */
export default function App(): React.ReactElement {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" hidden />
      <MultiCameraScreen />
    </GestureHandlerRootView>
  );
}
