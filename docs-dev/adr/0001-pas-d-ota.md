# ADR 0001 — Pas de mises à jour OTA (expo-updates)

**Statut** : ✅ Accepté (2026-09) · **Décideur** : mainteneur

## Contexte

Sans EAS, `expo-updates` reste utilisable en self-hosted (protocole ouvert, un
serveur statique suffit). Faut-il l'adopter pour livrer du JS sans passer par
Play ?

## Décision

**Non.** Aucun mécanisme OTA. Les mises à jour passent exclusivement par des
releases binaires Play (canal interne auto, puis promotion), relayées in-app
par `expo-in-app-updates` (dialogue natif Play).

## Justification

1. **Privacy = produit (ADR 0007)** : l'OTA impose un *phone-home* au démarrage
   — incompatible avec la promesse « no servers » de la fiche Play.
2. **App native-heavy** : la plupart des évolutions touchent VisionCamera, le
   module Kotlin ou les permissions → un binaire est requis de toute façon.
3. La chaîne release est déjà 100 % automatisée (merge release PR → Play
   interne) ; le gain OTA serait marginal.

## Conséquences

- **Pas de rollback JS** : tout correctif = release patch (`fix:` → release PR
  → Play). Le plan d'incident (template 🚨) repose sur : halte du staged
  rollout + release corrective.
- La skill/doc release ne doit jamais proposer `expo-updates` comme remède.
- À réévaluer uniquement si la promesse privacy évolue (nouvel ADR).
