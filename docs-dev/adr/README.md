# ADR — Architecture Decision Records

Décisions structurantes du projet, numérotées, immuables une fois acceptées
(une décision qui change = **nouvel** ADR qui supersède l'ancien).

**Processus** : issue « 📐 Proposition d'ADR » (discussion) → PR ajoutant
`NNNN-titre.md` → merge = décision actée. Format : Statut · Contexte · Décision
· Conséquences.

| # | Titre | Statut |
|---|---|---|
| [0001](0001-pas-d-ota.md) | Pas de mises à jour OTA (expo-updates) | ✅ Accepté |
| [0002](0002-versioncode-rev-list.md) | `versionCode` = `git rev-list --count HEAD` | ✅ Accepté |
| [0003](0003-composants-m3-custom.md) | Composants Material 3 custom (pas de react-native-paper) | ✅ Accepté |
| [0004](0004-typescript-6.md) | TypeScript 6.x (retour depuis TS 7) | ✅ Accepté |
| [0005](0005-sequentiel-photo-seulement.md) | Repli séquentiel : photo oui, vidéo non | ✅ Accepté |
| [0006](0006-politique-dependabot.md) | Supply chain : SHA pinning + auto-merge restreint | ✅ Accepté |
| [0007](0007-privacy-produit.md) | Privacy = produit (zéro réseau applicatif) | ✅ Accepté |
