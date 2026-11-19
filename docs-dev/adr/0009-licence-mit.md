# ADR 0009 : Licence MIT pour le dépôt

**Statut** : ✅ Accepté (2026-11) · Issue #251 · PR #252

## Contexte

Le dépôt `Devitek/dual` est public, mais n'avait **aucune licence** : par défaut,
tous les droits sont réservés. Conséquences concrètes :

- personne ne peut légalement réutiliser, modifier ou redistribuer le code ;
- les **contributions externes** (premières PRs de @the40n8 : #244, #248, #250)
  arrivent sans cadre explicite sur les droits accordés au projet ;
- le README annonçait un projet ouvert sans base juridique pour le faire.

Alignement avec la charte commune des dépôts Devitek (README charté, #251).

## Décision

Le dépôt est publié sous **licence MIT** (`LICENSE`, `Copyright (c) 2026
Devitek`), déclarée aussi dans `package.json` (`"license": "MIT"`).

- **Entrant = sortant** : une contribution acceptée est publiée sous la même
  licence MIT (pratique standard GitHub, rappelée dans CONTRIBUTING au besoin).
- **Compatibilité vérifiée** : les 38 dépendances directes de l'app sont sous
  MIT (relevé du 2026-11-19), aucune dépendance copyleft (GPL/AGPL) embarquée.
  Toute nouvelle dépendance doit rester compatible (permissive : MIT, Apache-2.0,
  BSD, ISC).
- **Hors licence** : la licence MIT ne concède **aucun droit sur les marques**.
  Le nom TwinLens, l'icône et le logotype Devitek restent la propriété de
  Devitek ; un fork ne peut pas se présenter comme TwinLens.

## Conséquences

- Un tiers peut forker et republier l'app (y compris sur le Play Store) sous un
  autre nom et une autre identité : c'est assumé. La valeur du projet tient à sa
  promesse (gratuit, sans pub, 100 % sur l'appareil, ADR 0007) et à sa
  maintenance, pas à la rareté du code.
- Les audits de dépendances (ADR 0006) ajoutent un critère : licence compatible.
- Changer de licence plus tard demanderait l'accord des contributeurs : à
  trancher par un nouvel ADR qui supersède celui-ci.
