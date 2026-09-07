# ADR 0004 — TypeScript 6.x (retour depuis TypeScript 7)

**Statut** : ✅ Accepté (2026-09) · Supersède le choix TS 7 (2026-08)

## Contexte

Le projet était passé à TypeScript **7.0.2** (compilateur natif « tsgo »,
exclu du contrôle `expo install` via `expo.install.exclude`) pour la vitesse de
`tsc --noEmit`. À l'introduction d'ESLint (vague 1.1), constat :

- **typescript-eslint refuse TS 7.0** (gate dur au chargement, cf. leur issue
  #10940 ; support annoncé « TS ≥ 7.1 ») ;
- le contournement `overrides` npm (TS 6 scoppé au sous-arbre lint) est
  **inopérant** : npm déduplique vers la devDep racine (`invalid` dans
  `npm ls`).

## Décision

Revenir à **`typescript@~6.0.3`** au top-level. Retirer l'`expo.install.exclude`
(doctor valide à nouveau la version). `tsconfig` : ajout de
`types: ["jest", "node"]` (TS 6 n'auto-inclut plus les `@types`).

## Justification

Sur ~8 000 lignes, le gain tsgo est de l'ordre de la seconde ; la compat de
**toute la toolchain** (typescript-eslint, éditeurs, doctor, futurs codemods)
vaut infiniment plus.

## Conséquences

- `npm run typecheck` légèrement plus lent (négligeable à cette échelle).
- **Réévaluation planifiée** : quand typescript-eslint supporte TS 7.1+, nouvel
  ADR possible (mesurer alors le gain réel sur la base de code du moment).
