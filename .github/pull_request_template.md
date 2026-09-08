<!-- Titre de PR en Conventional Commit (il pilote la version) : feat: / fix: / ci: / docs: / chore:… -->

## Quoi & pourquoi

<!-- Contexte, problème, solution. Lier l'issue : Closes #… -->

## Definition of Done

- [ ] `npm run typecheck` + `npm run lint` + `npm run format:check` + `npm test` + `npx expo-doctor` verts (CI **Typecheck · Doctor · Bundle** verte)
- [ ] Aucune édition de `CHANGELOG.md` / versions / tags (release-please)
- [ ] **Permissions / natif touchés** → sortie du `grep` manifest collée ci-dessous (AGENTS.md §4)
- [ ] **Réglage utilisateur ajouté** → checklist AGENTS.md §8 (3 points) + test « forcer l'arrêt → relancer »
- [ ] **Sémantique d'un état persisté modifiée** → bump `SETTINGS_SCHEMA_VERSION` + migration + test « maj depuis version antérieure » (§8)
- [ ] Chaînes UI dans **les 6 locales**
- [ ] **Accessibilité (nouveaux contrôles / UI modifiée)** : `accessibilityLabel` + `accessibilityRole` + `accessibilityState` (selected/disabled/checked) sur chaque contrôle · cible tactile **≥ 48 dp** (sinon `hitSlop`) · images porteuses de sens labellisées · parcours modifié passé sous **TalkBack** (navigation séquentielle + activation) ou « non vérifiable » explicitement noté
- [ ] **Vitrine (changement visible utilisateur)** : checklist AGENTS.md §11 déroulée (fiche ×6, visuels, changelog, site)
- [ ] Impact **Play** évalué (déclarations sensibles §3, fiche §7) : aucun / décrit ci-dessous
- [ ] Testé sur device (ou « non testable hors device » explicitement noté)

## Notes Play / manifest (si concerné)

<!-- grep manifest, changement de déclaration, impact fiche… sinon supprimer. -->
