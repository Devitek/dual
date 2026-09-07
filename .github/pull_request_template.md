<!-- Titre de PR en Conventional Commit (il pilote la version) : feat: / fix: / ci: / docs: / chore:… -->

## Quoi & pourquoi

<!-- Contexte, problème, solution. Lier l'issue : Closes #… -->

## Definition of Done

- [ ] `npm run typecheck` + `npm run lint` + `npm run format:check` + `npm test` + `npx expo-doctor` verts (CI **Typecheck · Doctor · Bundle** verte)
- [ ] Aucune édition de `CHANGELOG.md` / versions / tags (release-please)
- [ ] **Permissions / natif touchés** → sortie du `grep` manifest collée ci-dessous (AGENTS.md §4)
- [ ] **Réglage utilisateur ajouté** → checklist AGENTS.md §8 (3 points) + test « forcer l'arrêt → relancer »
- [ ] Chaînes UI dans **les 6 locales** · labels d'accessibilité sur les nouveaux contrôles
- [ ] Impact **Play** évalué (déclarations sensibles §3, fiche §7) : aucun / décrit ci-dessous
- [ ] Testé sur device (ou « non testable hors device » explicitement noté)

## Notes Play / manifest (si concerné)

<!-- grep manifest, changement de déclaration, impact fiche… sinon supprimer. -->
