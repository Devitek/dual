// DOIT être le tout premier import de l'app (prérequis react-native-gesture-handler).
import 'react-native-gesture-handler';

import { registerRootComponent } from 'expo';

// Initialise i18n (détection de la langue de l'appareil) avant tout rendu.
import './src/i18n';
import App from './App';
import { installCrashJournal } from './src/utils/crashJournal';

// Capture des erreurs JS fatales dans le journal LOCAL (ADR 0007 : rien n'est
// transmis — l'utilisateur copie le journal depuis Aide & diagnostic).
installCrashJournal();

// registerRootComponent appelle AppRegistry.registerComponent('main', () => App)
// et garantit que l'environnement est correctement configuré aussi bien en
// Development Build qu'en build de production.
registerRootComponent(App);
