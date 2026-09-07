// ESLint flat config — base officielle Expo (react, react-hooks, import, TS).
// `npm run lint` tourne avec --max-warnings 0 : un warning toléré aujourd'hui
// est un bug de hooks demain. Les exceptions sont listées (et justifiées) ici,
// pas en inline-disable éparpillés.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'android/**',
      'ios/**',
      'dist/**',
      'docs/**', // site web statique GitHub Pages (pas du code app)
      'design_handoff_twinlens/**', // maquettes design (artefacts, pas du code)
      'store/**',
      '.expo/**',
    ],
  },
  {
    rules: {
      // Règles « compiler » de react-hooks v6 : conçues pour React Compiler /
      // React DOM. Elles produisent des faux positifs massifs sur deux idiomes
      // React Native au cœur de cette app :
      //   - `useRef(new Animated.Value(0)).current` (115 occurrences flaggées),
      //   - les callbacks Gesture Handler construits dans useMemo (exécutés hors
      //     rendu, mais vus comme du code de rendu par la règle).
      // À réévaluer si adoption de Reanimated ou du React Compiler.
      'react-hooks/refs': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
      // Signal réel (setState synchrone dans un effect) mais 10 occurrences
      // existantes qui demandent une restructuration : warn interdit d'en
      // AJOUTER (via --max-warnings 0)… une fois le stock purgé. Burn-down
      // suivi en issue ; ne pas passer à 'error' avant.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
]);
