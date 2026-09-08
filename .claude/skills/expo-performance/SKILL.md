---
name: expo-performance
description: Utiliser pour les sujets de performance TwinLens — démarrage, previews caméra, galerie/viewer, animations, taille du binaire. Contraintes spécifiques multi-cam et budgets en place.
---

# Performance (TwinLens)

## Contraintes spécifiques à CETTE app

- **La bande passante ISP est partagée en multi-cam** : vidéos ≤ 1080p, 60 ips
  non garanti (repli 30 auto). Ne jamais « monter la qualité » sans tester sur
  device bas/moyen de gamme.
- La composition PiP tourne dans un **Foreground Service** (survit au kill) —
  le post-traitement ne doit JAMAIS bloquer l'obturateur : capture brute
  d'abord, `enqueue()` ensuite (pattern en place dans le controller).
- Les changements qualité/fps/miroir font un **teardown+rebuild de session**
  (~0,5-1,5 s selon OEM) : ne pas en ajouter sur des chemins fréquents.

## Budgets en place

- **AAB ≤ 85 Mo** (alerte au-delà, step « AAB size budget » du workflow release ;
  actuel ~73 Mo avec R8). Dérive = asset embarqué par erreur / minify off / lib
  dupliquée.
- R8 + shrinkResources **actifs** (ADR implicite 2.1A) : ne pas désactiver sans
  nouvel ADR + gestion du mapping.

## Leviers connus (backlog)

- **`expo-image`** à la place de RN `Image` pour galerie/viewer/posters (cache
  disque, décodage) — ticket 2.3, en attente (dep native → rebuild dev).
- Animations : `Animated` JS-driven partout (pas de Reanimated). Suffisant
  aujourd'hui ; si un jank apparaît sur les gestes du viewer, Reanimated est le
  levier — gros ADR (dépendance lourde + Babel plugin).
- Listes : galerie en `FlatList` 3 colonnes — si les sessions dépassent ~100
  médias, envisager `windowSize`/`getItemLayout`.

## Mesurer avant d'optimiser

```bash
# Taille AAB locale (R8)
nix-shell --run "cd android && ./gradlew bundleRelease -q" && ls -la android/app/build/outputs/bundle/release/
# Démarrage à froid (device)
adb shell am start -W fr.devitek.twinlens/.MainActivity | grep TotalTime
# Jank en direct
adb shell dumpsys gfxinfo fr.devitek.twinlens | head -30
```
Toute optimisation en PR : mesure avant/après collée, sinon refus.
