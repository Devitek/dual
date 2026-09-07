# ADR 0007 — Privacy = produit (zéro réseau applicatif)

**Statut** : ✅ Accepté (2026-09) · **Le différenciant n°1 de TwinLens**

## Contexte

La fiche Play promet : « 🔒 100% on-device — no account, no sign-up, no
servers, no tracking ». La déclaration Data Safety est « aucune donnée
collectée ». Question déclenchante : introduire Sentry pour le crash reporting
remettrait-il cela en cause ? **Oui** — même minimal, un crash reporter
transmet stack traces, identifiants d'installation et métadonnées device à un
serveur, et forcerait la déclaration « Diagnostics » sur la fiche.

## Décision

**Aucune dépendance qui transmet des données hors de l'appareil** n'entre dans
l'app. Ni analytics, ni crash reporter réseau, ni OTA (ADR 0001), ni A/B. La
seule communication réseau tolérée est celle des **services système** (Play
in-app updates, MediaStore).

L'observabilité s'obtient sans transmission :
1. **Play Vitals** (télémétrie OS, opt-in utilisateur Google) + **mapping R8
   uploadé** → crashs/ANR désobfusqués dans la console (vague 2) ;
2. **journal local + partage manuel** : rapports (device, crash) copiables par
   l'utilisateur depuis Aide & diagnostic — le canal qui a résolu le cas Oppo.

## Conséquences

- Garde-fou revue/agents : toute PR ajoutant une dep réseau doit citer cet ADR
  et le faire évoluer (nouvel ADR) — sinon refus.
- Data Safety reste « aucune collecte » ; c'est un argument marketing actif.
- Le debugging terrain repose sur la coopération de l'utilisateur (rapports
  copiables) : continuer d'investir ces outils in-app.
- Option de dernier recours documentée mais NON retenue : crash reporting
  **opt-in** vers une instance self-hosted — exigerait quand même une mise à
  jour Data Safety + fiche.
