# ADR 0008 — Notifications locales pour « Sur le fait » (expo-notifications, alarmes inexactes)

**Statut** : ✅ Accepté (2026-09) · Issue #180

## Contexte

La feature « Sur le fait » / On the Spot (#180) invite l'utilisateur, à des
moments aléatoires de la journée, à capturer une photo duale dans un délai de
3 minutes. Elle nécessite des notifications programmées qui survivent à la mort
du process et au redémarrage du téléphone. TwinLens n'avait jusqu'ici aucune
notification applicative (seule la barre de progression du Foreground Service
de composition existait, côté module natif).

Contraintes : ADR 0007 (zéro réseau applicatif, zéro tracking), et la posture
permissions du projet (AGENTS.md §3 : rien de sensible côté Play sans besoin
réel).

## Décision

1. **`expo-notifications`** entre comme dépendance native, pour ses
   notifications **locales programmées** uniquement. Aucun push distant : pas
   de FCM, pas de token, pas de serveur. Le module n'ajoute que
   `POST_NOTIFICATIONS` (permission runtime, demandée à l'ACTIVATION de la
   feature, opt-in) et `RECEIVE_BOOT_COMPLETED` (permission normale : les
   notifications programmées survivent au reboot).

2. **Alarmes INEXACTES assumées.** Pas de `SCHEDULE_EXACT_ALARM` ni
   `USE_EXACT_ALARM` : Android peut décaler une notification de quelques
   minutes, sans aucun impact sur cette UX (l'horaire est déjà aléatoire).
   Éviter ces permissions évite aussi une déclaration sensible Play et les
   restrictions Android 14+.

3. **Le tirage aléatoire est on-device et replanifié opportunistement** : à
   chaque retour de l'app au premier plan (`syncOnTheSpotSchedule`, idempotent,
   best-effort), on garantit les appels du jour et du lendemain. Pas de tâche
   de fond périodique dédiée : si l'utilisateur n'ouvre jamais l'app, les
   appels déjà programmés (aujourd'hui + demain) suffisent comme relance.

## Conséquences

- Rebuild des dev builds (dépendance native) ; manifest vérifié (aucune
  permission au-delà des deux citées).
- Le journal des appels vit en AsyncStorage (`tl_ots_journal`), les réglages
  dans la source unique `services/settings` (§8).
- Si un jour un besoin d'exactitude apparaissait (rappel à heure fixe choisi
  par l'utilisateur), la décision alarmes inexactes devra être révisée ici.
