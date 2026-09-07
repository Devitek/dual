# ADR 0006 — Supply chain : SHA pinning + auto-merge restreint

**Statut** : ✅ Accepté (2026-09) · PR #123

## Contexte

Historiquement : actions GitHub épinglées par tag (`@v7`) et auto-merge
dependabot pour les patchs npm **et toutes** les actions. Or les workflows
lisent des secrets (keystore, Play SA) : un tag amont compromis ou un paquet
npm malveillant entrait sans regard humain. Le mainteneur a tranché pour la
sécurité maximale raisonnable (audit, réponse n°4).

## Décision

1. **Toutes les actions épinglées par SHA de commit** (`@<sha40> # vX`) ;
   dependabot met à jour SHA + commentaire.
2. **Auto-merge restreint** aux bumps npm `semver-patch` de
   **devDependencies** uniquement (CI verte requise). Tout le reste — deps de
   production (patch inclus) et bumps d'actions — exige une revue humaine.
3. Secrets sensibles scoppés à l'environment `play-internal` (policies de
   déploiement `main` + `v*`).
4. `Gemfile.lock` commité, fastlane pinné (`~>`).

## Conséquences

- Un peu plus de PRs à examiner à la main (deps de prod : l'écosystème
  Expo/RN est déjà exclu de dependabot — géré par les montées de SDK).
- Les bumps d'actions montrent un diff de SHA : vérifier le tag amont
  correspondant avant merge.
- Toute nouvelle action doit être ajoutée **directement pinnée par SHA**.
