# Cahier de test TwinLens

Référentiel de **toutes** les fonctionnalités visibles de l'app et de la façon de
les vérifier. Il sert à deux choses :

1. **La campagne de recette avant chaque release** (section 3) : quoi dérouler,
   sur quel appareil, dans quel ordre.
2. **Le suivi de la couverture** : chaque cas indique s'il est automatisé (et
   par quoi) ou manuel. Un cas automatisé porte le même identifiant dans le code.

Issue d'origine : #263 (décision #217 : outillage maison plutôt qu'un agent IA).

## 1. Modes d'exécution

| Code | Mode | Où | Commande |
|---|---|---|---|
| **J** | Test unitaire Jest | local + CI (gate de PR) | `npm test` |
| **CI** | Flow Maestro sur émulateur (API 34, sans multi-cam) | workflow `e2e-android.yml` (cron lundi + dispatch) | `.maestro/*.yaml` |
| **D** | Suite device automatisée | téléphone réel via adb | `node scripts/e2e/run.mjs` |
| **D+** | Suite device avec action humaine (consigne affichée, action détectée) | téléphone réel | `node scripts/e2e/run.mjs --interactive` |
| **M** | Manuel | téléphone réel | ce document |

Statuts des suites device : `PASS`, `FAIL`, `SKIP`, `KNOWN` (échec attendu, lié à
une issue ouverte), `XPASS` (un cas KNOWN qui passe : vérifier si l'issue est
corrigée, puis retirer le marqueur `known`).

## 2. Matériel et hygiène

**Appareils**
- **Multi-cam** (référence : Pixel 8 Pro, Android 17) : tous les cas.
- **Sans caméras simultanées** (émulateur, ou téléphone qui ne les expose pas) :
  photo séquentielle, vidéo bloquée, bandeau « non supporté ».
- Idéalement un **Samsung** (One UI tue les processus en arrière-plan : §8 d'AGENTS.md).

**Hygiène (vécu)**
- Les suites device **suppriment les médias** qu'elles créent. En manuel, penser
  à nettoyer la galerie.
- **Jamais de `pm clear`** ni de réinstallation sur un téléphone dont on veut
  garder le cache (enregistrements bruts orphelins = banc de test pour #244,
  #255, #261). Le cas `FRS-01` est opt-in (`--allow-destructive`).
- Option développeur « Rester activé » (`stay_on_while_plugged_in`) : la couper
  pour tout test de veille (sinon l'écran ne s'éteint jamais, cf. #214).
- Après un stop vidéo, la composition dure (≈ la durée du clip). Ne jamais
  prendre « le média le plus récent » : attendre le média ajouté **après** l'heure
  du stop (piège « one-behind », #174).
- Pendant un enregistrement, uiautomator ne peut pas dumper l'UI : lire l'état via
  les témoins système (`node scripts/e2e/ui.mjs status`).

## 3. Campagne de recette (avant chaque release)

1. **Automatique, sans appareil** : `npm run typecheck && npm run lint && npm test`
   (gate de PR) et le run `e2e-android.yml` vert sur `main`.
2. **Suites device** sur l'appareil multi-cam, avec la build candidate :
   ```bash
   ADB_SERIAL=<serial> node scripts/e2e/run.mjs --interactive
   ```
   Attendu : aucun `FAIL`. Les `KNOWN` correspondent à des issues ouvertes
   connues ; un `XPASS` est une bonne nouvelle à confirmer.
3. **Bloc manuel prioritaire** (cas marqués ★ ci-dessous) : orientation paysage
   (photo et vidéo), déplacement et redimensionnement de la vignette, Sur le fait
   (notification réelle), widget et tuile, partage direct, touches volume.
4. **Appareil sans caméras simultanées** : cas `VWF-03`, `VWF-04`, `PHO-12`.
5. Joindre le `report.md` des suites device et la liste des cas manuels passés à
   la PR de release (ou en commentaire de l'issue de release).

## 4. Cas de test

Colonnes : **ID**, **cas**, **attendu**, **mode**, **réf.** (issue ou ADR).
★ = prioritaire en recette manuelle.

### 4.1 Installation, permissions, accueil

| ID | Cas | Attendu | Mode | Réf. |
|---|---|---|---|---|
| FRS-01 | Données effacées puis lancement | Écran permissions, puis onboarding, puis viseur actif | D (destructif), CI (`01-launch`) | #218 |
| PRM-01 | Refuser la caméra | Écran de permission avec « Ouvrir les réglages » ; aucune capture possible | M | |
| PRM-02 | Refuser le micro | Gate bloquant (caméra ET micro requis) | M | |
| PRM-03 | Refuser la galerie (écriture) | L'app fonctionne (galerie best-effort, hors gate) ; médias quand même enregistrés via MediaStore | M | AGENTS §3.1 |
| PRM-04 | Manifeste | Aucune permission `READ_MEDIA_*` ni `ACCESS_MEDIA_LOCATION` | M (prebuild + grep) | AGENTS §3.1 |
| ONB-01 | Premier lancement | Onboarding affiché une fois, puis plus jamais | M | |
| ONB-02 | Mise à jour de version | Écran « Nouveautés » une fois après mise à jour | M | |
| UPD-01 | Mise à jour disponible sur le Play Store | Bandeau de mise à jour in-app, « Plus tard » le masque | M | |

### 4.2 Démarrage et viseur

| ID | Cas | Attendu | Mode | Réf. |
|---|---|---|---|---|
| SMK-01 | Lancement à froid | Viseur prêt, caméras réellement ouvertes, pas d'écran d'erreur | D, CI | |
| VWF-01 | Appareil multi-cam | Deux aperçus (principal + vignette) | M | |
| VWF-02 | Caméra prise par une autre app puis retour | Écran d'erreur, « Réessayer » relance la session ; au retour au premier plan, reprise seule | M | #222 |
| VWF-03 | Appareil sans caméras simultanées | Mode séquentiel ; vidéo indisponible avec explication | M | |
| VWF-04 | Bandeau « non supporté » | « Pourquoi ? » ouvre le diagnostic, « Copier » copie le rapport | M | |
| VWF-05 | Inverser les caméras | Principal et vignette échangés | M | |
| VWF-06 | Mode surprise (aperçu selfie masqué) | Vignette masquée à l'écran, présente dans le rendu final | M | |
| VWF-07 | Grille et niveau | Superposés au viseur quand activés, absents du rendu | M | |

### 4.3 Photo

| ID | Cas | Attendu | Mode | Réf. |
|---|---|---|---|---|
| CAP-01 | Photo | Un JPEG `Dual_PiP_*` arrive dans la galerie | D, CI (`03-capture-gallery`) | |
| PHO-01 | Flash off / auto / on | Libellé d'accessibilité reflète l'état ; flash déclenché selon l'état | M, CI (`02-settings-persist` pour l'état) | |
| PHO-02 | Retardateur 3 s / 10 s | Décompte visible, annulable, capture à la fin | M | |
| PHO-03 | Rafale 3 / 5 / 10 | N photos dans la galerie | M | |
| PHO-04 | Vitesse (rapide / équilibré / qualité) | Capture rapide sans « Ne bougez pas » ; qualité affiche l'anti-flou | M | |
| PHO-05 | Sauvegarde : fusion / fusion + originaux / originaux | Respectivement 1, 3 ou 2 fichiers | M | |
| PHO-06 | Ratio de sortie (plein / carré / haut) | Rendu au ratio choisi, masque dans le viseur | M | |
| PHO-07 | Qualité (standard / haute / max) | Résolutions annoncées ; repli signalé si non supporté | M | |
| PHO-08 ★ | Photo tenue en paysage (90 et 270) | Cadrage du viseur conservé, tag EXIF : affichée droite en galerie | M, J (`orientation.test`) | #174 |
| PHO-09 | Miroir caméra avant | Selfie inversé ou non selon le réglage | M | |
| PHO-10 | Filigrane | Présent si activé, absent sinon | M | |
| PHO-11 | Géolocalisation | Coordonnées dans l'EXIF seulement si activée ET permission accordée | M | |
| PHO-12 | Photo séquentielle (sans caméras simultanées) | Deux prises successives fusionnées | M | |
| PHO-13 | Son d'obturateur coupé | Capture silencieuse | M | |

### 4.4 Vidéo

| ID | Cas | Attendu | Mode | Réf. |
|---|---|---|---|---|
| CAP-02 | Vidéo 5 s | Un MP4 composé arrive dans la galerie | D | |
| VID-01 | Compteur d'enregistrement | Compteur visible et croissant ; l'obturateur devient « Arrêter » | M | |
| VID-02 ★ | Vidéo tenue en paysage | Hint MP4 : lue droite ; vignette avant alignée | M | #174 |
| VID-03 | Orientation figée au démarrage | Tourner pendant le clip ne change pas l'orientation du fichier | M | #174 |
| VID-04 | 30 / 60 i/s | Fichier au débit choisi ; repli signalé si non supporté | M | |
| VID-05 | Stabilisation | Activable, sans effet de bord sur la composition | M | |
| VID-06 | Sauvegarde vidéo (fusion / + originaux / originaux) | 1, 3 ou 2 fichiers | M | |
| VID-07 | Longue vidéo (≥ 4 min) | Composition complète (durée ≈ durée du clip), notification de progression | M | #261 |

### 4.5 Boomerang

| ID | Cas | Attendu | Mode | Réf. |
|---|---|---|---|---|
| CAP-03 | Appui long 3 s | Un média boomerang arrive dans la galerie | D | |
| BOO-01 | Format MP4 / GIF | Extension et lecture conformes au réglage | M | |
| BOO-02 | Appui très court (< 0,7 s) | Arrêt différé jusqu'au minimum de 0,7 s : un clip court est produit | M | |

### 4.6 Composition et vignette PiP

| ID | Cas | Attendu | Mode | Réf. |
|---|---|---|---|---|
| LAY-01 | Disposition PiP / côte à côte / haut-bas | Viseur et rendu conformes (photo et vidéo) | M | |
| LAY-02 ★ | Déplacer la vignette (appui long + glisser) | Position du rendu = position du viseur | M | |
| LAY-03 ★ | Redimensionner la vignette (pincer) | Taille du rendu = taille du viseur | M | |
| LAY-04 | Indice de prise en main PiP | Affiché une seule fois | M | |

### 4.7 Zoom, mise au point, exposition, torche

| ID | Cas | Attendu | Mode | Réf. |
|---|---|---|---|---|
| ZOO-01 | Préréglages (.5, 1, 2, 5...) | Zoom appliqué, préréglage sélectionné | M | |
| ZOO-02 | Pincer pour zoomer | Zoom continu, indicateur affiché | M | |
| FOC-01 | Toucher pour mettre au point | Indicateur de mise au point | M | |
| FOC-02 | Verrou AE/AF | Exposition figée jusqu'au déverrouillage | M | |
| TOR-01 | Torche | S'allume ; **jamais rallumée au lancement** (non persistée) | M | AGENTS §8 |

### 4.8 Interruptions et robustesse

| ID | Cas | Attendu | Mode | Réf. |
|---|---|---|---|---|
| INT-01 | Accueil pendant l'enregistrement | Vidéo sauvegardée sans revenir dans l'app | D | #243 |
| INT-02 | Autre app pendant l'enregistrement | Vidéo sauvegardée | D | #243 |
| INT-03 | Arrêt normal puis arrêt forcé pendant la composition | Vidéo reprise au lancement suivant | D (**KNOWN #261**) | #243, #261 |
| INT-04 | Accueil puis arrêt forcé pendant la composition | Vidéo reprise au lancement suivant | D (**KNOWN #261**) | #243, #261 |
| INT-05 | Retrait de l'app des récents pendant la composition | Le service garde le processus : vidéo sauvegardée | M | #243 |
| INT-06 | Composition refusée par Android (hors délai de grâce) | Réessai au retour au premier plan, sinon originaux sauvegardés | M (non reproductible à la demande) | #244 |
| INT-07 | Récupération des vidéos interrompues (réglages) | Bruts orphelins enregistrés en galerie puis retirés du cache | M | #244 |
| LCK-01 | Verrouillage puis déverrouillage | Caméras rouvertes seules, photo possible | D+ | #222 |
| AWK-01 | Viseur ouvert, aucune interaction | Écran maintenu allumé ; relâché en arrière-plan | D | #214 |
| CRS-01 | Crash pendant l'usage | Journal de crash local, consultable et copiable | J (`crashJournal.test`), M | |
| CCH-01 | 5 vidéos en mode fusion, puis 5 photos, puis relance de l'app | Le cache de l'app (Paramètres > Applis > Stockage) ne grossit plus durablement : bruts vidéo supprimés aussitôt, bruts photo et originaux au lancement suivant ; les orphelins (composition jamais aboutie) restent | J (`cachePurge.test`), M | #255 |

### 4.9 Galerie de session et visionneuse

| ID | Cas | Attendu | Mode | Réf. |
|---|---|---|---|---|
| GAL-01 | Ouvrir depuis la miniature | Médias de la session, du plus récent au plus ancien | CI (`03-capture-gallery`), M | |
| GAL-02 | Visionneuse : précédent / suivant / lecture vidéo | Navigation et lecture in-app | M | |
| GAL-03 | Infos d'un média | Date, résolution, taille, double ou non, durée | M | |
| GAL-04 | Partager | Feuille de partage Android avec le bon fichier | M, J (`shareMedia.test`) | |
| GAL-05 ★ | Partage direct Instagram / TikTok | Ouvre l'app cible avec le média | M | |
| GAL-06 | Sélection multiple puis suppression | Médias supprimés de la galerie | M | |

### 4.10 Réglages et persistance (AGENTS.md §8)

| ID | Cas | Attendu | Mode | Réf. |
|---|---|---|---|---|
| SET-01 | Mode de capture après arrêt forcé | Restauré | D | §8 |
| SET-02 | Disposition après arrêt forcé | Restaurée | D | §8 |
| SET-03 | Flash après arrêt forcé | Restauré | CI (`02-settings-persist`) | §8 |
| SET-04 | Tous les réglages de `SETTINGS_KEYS` | Chaque clé écrite est relue au démarrage | J (`settings.test`) | §8 |
| SET-05 | Mise à jour depuis une ancienne version | Migration du schéma de réglages, aucun état incohérent | J (`settings.test`) | §8 |
| SET-06 | Exceptions non persistées | Torche éteinte, géotag selon permission | M | §8 |
| SET-07 ★ | Samsung : arrêt forcé puis relance | Tous les réglages tiennent | M | §8 |

### 4.11 Sur le fait

| ID | Cas | Attendu | Mode | Réf. |
|---|---|---|---|---|
| OTS-01 | Activer | Demande la permission de notification ; refus signalé | M | |
| OTS-02 | Planification (min / max par jour, fenêtre horaire) | Invitations dans la fenêtre, nombre respecté | J (`onTheSpot.test`) | |
| OTS-03 ★ | Notification réelle puis capture dans les 3 min | Capture validée, série incrémentée | M | |
| OTS-04 | Invitation expirée | Marquée manquée, série remise à zéro | J, M | |
| OTS-05 | Historique (onglet galerie) | Captures et manqués listés, filtre « réussies » | M | |

### 4.12 Raccourcis et contrôles physiques

| ID | Cas | Attendu | Mode | Réf. |
|---|---|---|---|---|
| SHT-01 ★ | Widget d'accueil | Ouvre l'app sur le viseur | M | |
| SHT-02 ★ | Tuile Réglages rapides | Ouvre l'app sur le viseur | M | |
| VOL-01 ★ | Touches volume (volume système / déclencheur / zoom) | Action conforme au réglage | M | |
| VOL-02 | Télécommande selfie Bluetooth | Déclenche la capture | M | |

### 4.13 Système, langues, accessibilité

| ID | Cas | Attendu | Mode | Réf. |
|---|---|---|---|---|
| I18N-01 | 6 langues : clés complètes, aucune orpheline | Parité des locales | J (`keys.test`) | |
| I18N-02 | 6 langues à l'exécution | Résolution, interpolation, pluriels, repli anglais | J (`runtime.test`) | #262 |
| I18N-03 | Langue de l'appareil changée | App dans la nouvelle langue au relancement | M | |
| ROT-01 | Icônes en paysage | Les icônes tournent avec le téléphone, l'UI reste en portrait | M | #173 |
| THM-01 | Material You (Android 12+) | Couleurs dynamiques du fond d'écran | M | |
| A11Y-01 | TalkBack | Chaque contrôle a un libellé ; états annoncés (flash, enregistrement) | M | |
| NOT-01 | Notification de composition | Visible (silencieuse) pendant la composition, disparaît à la fin | M | |
| REV-01 | Invitation à noter | Déclenchée selon les règles, jamais en pleine capture | J (`reviewPrompt.test`) | |

### 4.14 Confidentialité et conformité

| ID | Cas | Attendu | Mode | Réf. |
|---|---|---|---|---|
| PRV-01 | Mode avion | Toutes les fonctions marchent (aucune dépendance réseau) | M | ADR 0007 |
| PRV-02 | Trafic réseau de l'app | Aucun (hors Play Store pour mise à jour et notation) | M | ADR 0007 |
| PRV-03 | Galerie en écriture seule | L'app n'a jamais besoin de lire la pellicule | M | AGENTS §3.1 |

### 4.15 Diagnostics

| ID | Cas | Attendu | Mode | Réf. |
|---|---|---|---|---|
| DIA-01 | Copier le rapport appareil | Rapport dans le presse-papiers (modèle, Android, caméras) | J (`deviceReport.test`), M | |
| DIA-02 | Copier / effacer le journal | Journal local copié ; effacement confirmé | M | |

## 5. Ajouter ou automatiser un cas

1. Lui donner un identifiant (préfixe du domaine) dans ce document.
2. S'il manque un point d'accroche, **ajouter un `testID`** au composant (aucun
   changement visuel) et le reporter au catalogue de `docs-dev/e2e-testing.md`.
3. Écrire le cas dans `scripts/e2e/suites/<suite>.mjs` avec le **même
   identifiant**. Préférer un témoin système (`lib/device.mjs`) à la lecture de
   l'UI pour tout état qui change en continu.
4. Bug connu non corrigé : marquer le cas `known: { issue, reason }` (statut
   KNOWN) plutôt que de l'affaiblir ; retirer le marqueur à la livraison du correctif.
5. Passer le mode du cas à `D` (ou `D+`) dans ce document.
