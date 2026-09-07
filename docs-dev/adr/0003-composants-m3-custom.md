# ADR 0003 — Composants Material 3 custom (pas de react-native-paper)

**Statut** : ✅ Accepté (2026-09) · Contexte : refonte des réglages (PR #116)

## Contexte

L'utilisateur veut un rendu « natif Material You » (switches M3 avec ✓ dans le
pouce, cartes groupées, pill animée). Deux options : adopter
**react-native-paper** (composants M3 prêts) ou construire des composants
custom sur la palette dynamique existante (`@pchmn/expo-material3-theme`).

## Décision

**Custom.** `M3Switch` (dessiné à la main : piste pilule, pouce glissant, ✓),
`Segmented`, cartes de section, pill à indicateur ressort — tous branchés sur
la palette Material You de l'app.

## Justification

1. Le `Switch` de paper délègue au thème natif Android : le rendu M3 exact
   (✓ dans le pouce) **n'est pas garanti** selon l'appareil — précisément ce
   qu'on veut maîtriser.
2. Grosse dépendance (provider, thème parallèle) pour ~4 composants, sous
   RN 0.86 sans possibilité de validation visuelle en CI.
3. Palette déjà en place ; le custom garantit le pixel-perfect vs les captures
   de référence (app Appareil photo Google).

## Conséquences

- Les composants M3 vivent dans `src/components/` (M3Switch, Segmented…) et
  doivent suivre la spec M3 à la main lors des évolutions.
- Si le périmètre UI réglages explose (listes, menus, dialogs complexes),
  réévaluer paper par un nouvel ADR.
