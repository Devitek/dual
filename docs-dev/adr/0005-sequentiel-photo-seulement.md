# ADR 0005 — Repli séquentiel : photo oui, vidéo non

**Statut** : ✅ Accepté (2026-09) · Contexte : avis Play Oppo Reno12 5G (PR #113)

## Contexte

~77 % des appareils Android n'exposent pas `FEATURE_CAMERA_CONCURRENT`
(déclaratif OEM ; aucune app tierce ne peut le contourner). Sur ces appareils,
TwinLens tombait en mono-caméra — vécu comme « l'app ne marche pas » (avis 1★).

## Décision

Sur les appareils **à deux capteurs sans concurrent-camera** (mode
`sequential`) :

- **Photo** : capture en deux temps (arrière depuis l'aperçu, bascule de
  session vers l'avant avec aperçu selfie, composition PiP via le composeur
  natif existant). Automatique, overlay « gardez la pose 1/2 → 2/2 ».
- **Vidéo/boomerang** : **bloqués** (segments grisés + message), garde-fou dans
  `startRecording()`.

## Justification

- Photo : deux instants séparés de ~1 s restent une vraie « photo double »
  (moi + la scène) — la promesse est tenue à ~90 %.
- Vidéo : impossible de filmer les deux flux en même temps ; une « vidéo
  séquentielle » serait **deux moments différents** présentés comme simultanés
  → tromperie, déception garantie. Mieux vaut un blocage honnête et expliqué
  (bulle « Pourquoi ? » + rapport device copiable).

## Conséquences

- Trois modes runtime : `multi` / `sequential` / `single` (+ `none`).
- La vidéo mono a été retirée sur ces appareils (assumé : la promesse de l'app
  est le dual).
- Latence de bascule non validée sur tout le parc OEM — retours terrain à
  surveiller (issue bug Android + rapport device).
