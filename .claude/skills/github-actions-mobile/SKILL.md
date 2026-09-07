---
name: github-actions-mobile
description: Utiliser pour créer ou modifier un workflow GitHub Actions de TwinLens (CI qualité, release, crons) — conventions de sécurité, secrets, environments, caches et pièges spécifiques au repo.
---

# GitHub Actions (conventions du repo)

> Autorité : `AGENTS.md`, ADR 0006. Workflows existants : `ci.yml` (qualité PR),
> `release-android.yml` (release, environment `play-internal`),
> `release-please.yml`, `expo-drift.yml` (cron lundi), `store-metadata.yml`
> (manuel), `android-build.yml` (APK), `dependabot-auto-merge.yml`.

## Conventions de sécurité (non négociables)

1. **Actions épinglées par SHA de commit** : `uses: owner/repo@<sha40> # vX`.
   Nouvelle action = résoudre le SHA (`gh api repos/O/R/commits/TAG --jq .sha`).
2. **Secrets uniquement via `env:`** — jamais d'interpolation `${{ secrets.* }}`
   dans le corps d'un `run:` (injection/quoting). Référencer `"$VAR"` quotée.
3. Secrets sensibles (keystore ×4, Play SA) vivent dans l'**environment
   `play-internal`** (policies : branche `main` + tags `v*`). Un job qui en a
   besoin déclare `environment: play-internal`. Ne jamais les redemander au
   niveau repo.
4. `permissions:` minimales par workflow (contents: read par défaut).
5. Auto-merge dependabot : patch **devDependencies npm** uniquement (ADR 0006).

## Pièges spécifiques au repo (vécus)

- **Le check requis s'appelle `Typecheck · Doctor · Bundle`** (branch
  protection). Ajouter des steps DANS ce job, ne pas le renommer — sinon plus
  aucune PR n'est mergeable.
- `release-android.yml` exige `fetch-depth: 0` (versionCode = rev-list, ADR 0002).
- release-please utilise `RELEASE_PLEASE_TOKEN` (PAT) pour que l'event
  `release` **cascade** vers le build (GITHUB_TOKEN ne déclenche pas d'events —
  anti-récursion GitHub).
- YAML : valider avant commit (`python3 -c "import yaml;yaml.safe_load(open('<f>'))"`).
  Attention aux chaînes multi-lignes dans `run: |` (indentation = fin de bloc).
- Cache : npm via `setup-node`, Gradle via `gradle/actions/setup-gradle`,
  bundler via `setup-ruby` + `Gemfile.lock` (commité — ne pas le supprimer).

## Séparation des préoccupations

- **CI qualité** (`ci.yml`, PR + main) : npm ci → typecheck → eslint (ratchet
  `--max-warnings`, cf. eslint.config.js) → prettier → jest → doctor → export.
  Rapide (~1 min), pas de build natif.
- **CD release** : uniquement sur event `release` + dispatch manuel. Jamais de
  déploiement depuis la CI qualité.
- Un nouveau workflow périodique suit le modèle `expo-drift.yml` (cron + issue
  auto en échec, labels existants).

## DoD d'une intervention workflow

- YAML validé ; actions pinnées SHA ; secrets via env ; `permissions:` posées.
- Nom du check requis inchangé ; testé par dispatch quand c'est possible.
- Politique nouvelle ou changée → ADR ou mise à jour AGENTS.md.
