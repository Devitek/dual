# Contribuer à TwinLens

> Les règles **impératives** (workflow release, permissions Play, persistance
> des réglages, CNG) vivent dans **[AGENTS.md](AGENTS.md)** — source de vérité
> unique pour les humains comme pour les agents IA. Ce guide couvre le setup et
> le flux de travail ; en cas de conflit, AGENTS.md gagne.

## Prérequis

- **Node 20+** (la CI est en 20) · **JDK 17** (Temurin) · **Android SDK**
  (platform 36, build-tools 36.0.0, NDK 27.1.12297006, cmake 3.22.1)
- Un appareil Android en débogage USB, ou un émulateur
- **NixOS** : `nix-shell` à la racine fournit tout, variables d'env comprises
  (`ANDROID_HOME`, `JAVA_HOME`, contournement aapt2) — voir [`shell.nix`](shell.nix)

## Setup & boucle de dev

```bash
npm ci
npx expo run:android    # 1re fois, puis après TOUT changement natif
                        # (dépendance ajoutée, config plugin, modules/…)
npm start               # Metro ; les changements JS rechargent à chaud
```

- **Expo Go ne fonctionne pas** (modules natifs : VisionCamera, Nitro,
  video-pip-composer) — development build obligatoire.
- `android/` et `ios/` sont **générés** (CNG) : ne jamais les committer ni les
  éditer à la main. Le natif custom passe par `modules/video-pip-composer/`
  (versionné) ou un config plugin (`plugins/`). Cf. AGENTS.md §4.
- Un build Play est installé sur ton téléphone ? Dev build et build Play
  partagent le même `applicationId` : désinstalle l'un pour installer l'autre.

## Qualité avant de pousser

```bash
npm run typecheck    # tsc --noEmit — DOIT être vert
npm run lint         # ESLint (0 nouvelle warning — ratchet)
npm run format:check # Prettier
npm test             # Jest
npx expo-doctor  # DOIT afficher 21/21
# Si tu as touché aux permissions ou au natif :
npx expo prebuild --platform android --no-install --clean
grep -o 'android:name="android.permission.[^"]*"' android/app/src/main/AndroidManifest.xml | sort -u
```

## Issues = base de connaissance (avant de coder)

Toute unité de travail non triviale commence par une **issue** (contexte, plan,
critères d'acceptation) ; les écueils et décisions rencontrés en route se
documentent **en commentaires au fil de l'eau** ; la PR ferme l'issue
(`Closes #N`). Décision structurante → ADR (`docs-dev/adr/`). Voir AGENTS.md §9.

## Branches, commits, PR

- Branche dédiée (`feat/…`, `fix/…`, `ci/…`, `docs/…`) — **jamais** de push
  direct sur `main`.
- **Conventional Commits** obligatoires : ils pilotent la version via
  release-please (`feat:` → minor, `fix:` → patch, `feat!:` → major,
  `ci:`/`chore:`/`docs:`/… → pas de bump). Messages en anglais. Cf. AGENTS.md §2.
- PR vers `main` (protégé) : le check **« Typecheck · Doctor · Bundle »** doit
  être vert et la branche à jour ; merge en squash.
- **Ne jamais** éditer `CHANGELOG.md`, les versions (`package.json`,
  `app.json`) ni créer de tag : release-please possède tout ça.

## Spécificités du projet (résumé — détails dans AGENTS.md)

- **Réglage utilisateur ajouté** ⇒ checklist §8 en 3 points (clé dans
  `SETTINGS_KEYS` + `PersistedSettings` + `loadPersistedSettings()`, application
  au montage, `saveSetting()` dans le setter) + test « forcer l'arrêt →
  relancer : tout doit tenir ».
- **Média = écriture seule** : ne jamais réintroduire
  `READ_MEDIA_IMAGES/VIDEO/AUDIO` ni `ACCESS_MEDIA_LOCATION` (§3.1).
- **i18n** : toute chaîne UI dans **les 6 locales** (`src/i18n/locales/`).
- **Privacy = produit** : aucune dépendance qui transmet des données hors de
  l'appareil (pas d'analytics, pas de crash reporter réseau) — c'est le
  différenciant de l'app.

## Definition of Done (reprise dans le template de PR)

- [ ] `npm run typecheck` + `npm run lint` + `npm run format:check` + `npm test` + `npx expo-doctor` verts (CI verte)
- [ ] Aucune édition de `CHANGELOG.md` / versions / tags
- [ ] Permissions ou natif touchés → sortie du `grep` manifest collée dans la PR
- [ ] Réglage ajouté → checklist §8 + test force-stop
- [ ] Chaînes UI → 6 locales ; contrôles → labels d'accessibilité
- [ ] Impact fiche / déclarations Play évalué (AGENTS.md §3 et §7)

## Releaser

Merger la « release PR » ouverte par release-please — **c'est tout** : tag,
build AAB signé, upload Play (canal interne, auto-déployé) s'enchaînent sans
action manuelle. Détails, secours et secrets : [RELEASE.md](RELEASE.md).
