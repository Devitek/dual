import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent appelle AppRegistry.registerComponent('main', () => App)
// et garantit que l'environnement est correctement configuré aussi bien en
// Development Build qu'en build de production.
registerRootComponent(App);
