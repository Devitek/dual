---
name: android-play-compliance
description: Utiliser pour tout ce qui touche à la conformité Google Play de TwinLens — déclarations sensibles, Data Safety, tracks/testeurs, fiche store, et les gotchas déjà rencontrés avec ce compte.
---

# Conformité Play (compte personnel Devitek)

> Autorité : AGENTS.md §3 et §7, RELEASE.md, ADR 0007.

## Contraintes du COMPTE (vécues, non négociables)

- **Compte personnel** → la production exige un **test fermé : ≥ 12 testeurs
  pendant 14 jours**. Chaîne : Internal (auto) → Closed/alpha (workflow
  Play Promote) → Production (rollout progressif).
- Le canal **interne** ne passe pas par l'examen Google (`completed` = testeurs
  servis immédiatement). Fermé/production = examen.
- **Déclarations sensibles = niveau APP** : basées sur le bundle le plus élevé
  **déployé**. Une vieille version avec une permission retirée depuis peut
  maintenir une déclaration exigée → la nouvelle version doit la SUPERSÉDER sur
  ses pistes.

## Gotchas déjà payés (ne pas re-payer)

1. **« Health features »** : `expo-sensors` déclare `ACTIVITY_RECOGNITION`
   (podomètre non utilisé) → Play force la déclaration « Applis de santé » et
   **rejette l'upload API**. Retirée par `plugins/withRemoveActivityRecognition.js`.
   Vérifier qu'elle ne revient jamais (grep manifest en PR).
2. **Média write-only** : `granularPermissions: []` +
   `isAccessMediaLocationEnabled: false` + JAMAIS `READ_MEDIA_*` → pas de
   déclaration « accès photos/vidéos ». Régression = formulaire bloquant.
3. **FGS `dataSync`** (PipComposerService) : déclaré côté console comme
   **« Transcodage multimédia »** (traitement local). Toute nouvelle utilisation
   de FGS = mise à jour de cette déclaration.
4. **Fiche** : poussée par `store/upload_listing.py` (workflow manuel) — PAS
   supply. `changes_not_sent_for_review: true` dans la lane.

## Data Safety (l'argument produit)

« **Aucune donnée collectée** » — c'est vrai et ça doit le rester (ADR 0007).
Géotag = EXIF local opt-in (pas une collecte). Toute dépendance réseau
invaliderait le formulaire ET la fiche (« no tracking »).

## Checklist avant toute promotion en production

- [ ] Version validée en interne puis fermé (14 j/12 testeurs si 1re fois)
- [ ] Déclarations console à jour (FGS, permissions) pour CE bundle
- [ ] Rollout progressif (défaut 10 %) via Play Promote ; halte documentée
      (RELEASE.md §Rollback)
- [ ] `mapping.txt` bien attaché à la release GitHub (désobfuscation Vitals)
