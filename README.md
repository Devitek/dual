# TwinLens 📸

**Deux caméras. Une seule photo. 100 % sur l'appareil.**

TwinLens est une application caméra **Android** qui capture l'avant et l'arrière
**en même temps** (multi-cam simultané, VisionCamera v5), puis fusionne les deux
flux en une seule photo ou vidéo — Picture-in-Picture, côte à côte ou empilé —
entièrement hors-ligne : **pas de compte, pas de serveur, pas de pub, pas de
tracking**.

[Google Play](https://play.google.com/store/apps/details?id=fr.devitek.twinlens) ·
[Site](https://twinlens.devitek.fr) ·
[Support](https://twinlens.devitek.fr/support.html) ·
[Confidentialité](https://twinlens.devitek.fr/privacy.html)

## Fonctionnalités

- 🎬 Photo & vidéo **double** (avant + arrière simultanés), boomerang (MP4/GIF)
- 🖼️ Compositions on-device : PiP (vignette déplaçable/redimensionnable), côte à
  côte, empilé — un seul fichier prêt à partager
- 📸 Repli **photo séquentielle** sur les appareils sans concurrent-camera
  (les deux clichés l'un après l'autre, composés automatiquement)
- 🔒 **Zéro réseau applicatif** : pas de compte, pas d'analytics, géotag opt-in
  purement local (EXIF)
- 🌍 6 langues · Material You (Android 12+) · widget d'accueil + tuile Réglages
  rapides · partage direct Instagram/TikTok

## Stack

Expo SDK 57 (**CNG** — `android/` généré, jamais commité) · React Native 0.86 ·
TypeScript strict · VisionCamera v5 (Nitro) · module natif local Kotlin
([`modules/video-pip-composer`](modules/video-pip-composer)) : composition PiP
en Foreground Service, MediaStore, widget/tuile, partage · Release :
**GitHub Actions + Fastlane → Google Play** (release-please, aucune étape
manuelle).

## Démarrage rapide

> ⚠️ App **native** : Expo Go ne fonctionne pas — il faut un **development
> build** (`expo run:android`).

```bash
npm ci
npx expo run:android   # build + installe le dev build (appareil USB / émulateur)
npm start              # Metro ; ensuite, rechargement à chaud du JS
```

Utilisateurs NixOS : `nix-shell` fournit tout (SDK Android 36, NDK, JDK 17,
Node, contournement aapt2) — voir [`shell.nix`](shell.nix).

## Documentation

| Fichier | Rôle |
|---|---|
| [`AGENTS.md`](AGENTS.md) | **Source de vérité** des règles (humains & agents IA) : release, permissions Play, persistance des réglages |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Setup, boucle de dev, conventions de PR, Definition of Done |
| [`RELEASE.md`](RELEASE.md) | Chaîne de release Fastlane/Play : signing, secrets, fiche store |
| [`CHANGELOG.md`](CHANGELOG.md) | Généré par release-please — ne pas éditer |
