# Publier TwinLens sur Google Play (gratuit, self-hosted, Fastlane)

Build de l'**AAB signé** dans GitHub Actions (gratuit) → envoi via **Fastlane
`supply`** avec un **compte de service Google**. Aucun service cloud payant, tu
déclenches la publication **manuellement**.

> ⚠️ **Compte personnel** : Google impose, pour un nouveau compte développeur
> **personnel**, un *closed testing* d'au moins **12 testeurs pendant 14 jours**
> avant d'ouvrir la **Production**. On vise donc : **Internal → Closed → Production**.

## 1. Clé de signature (upload key) — une seule fois
Play App Signing gère la clé d'app finale ; toi tu ne gères qu'une **upload key**
(récupérable en cas de perte).

```bash
keytool -genkeypair -v -keystore upload.keystore -alias twinlens \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=Devitek, O=Devitek, C=FR"
# (note le mot de passe choisi)
```

Enregistre les secrets GitHub (⚠️ ne committe jamais le keystore) :

```bash
gh secret set ANDROID_KEYSTORE_BASE64   --repo Devitek/dual < <(base64 -w0 upload.keystore)
gh secret set ANDROID_KEYSTORE_PASSWORD --repo Devitek/dual -b '<motdepasse>'
gh secret set ANDROID_KEY_ALIAS         --repo Devitek/dual -b 'twinlens'
gh secret set ANDROID_KEY_PASSWORD      --repo Devitek/dual -b '<motdepasse>'
```
Garde une **sauvegarde** de `upload.keystore` hors du dépôt.

## 2. Compte de service Google (API Play) — une seule fois
1. Google Cloud Console → crée un projet → **IAM & Admin → Service Accounts** →
   nouveau compte de service → crée une **clé JSON**.
2. **⚠️ Rôle IAM Cloud (sinon 403)** : sur le **projet** Google Cloud, accorde au
   compte de service le rôle **« Service Usage Consumer »**
   (`roles/serviceusage.serviceUsageConsumer`). Les clients Google envoient un
   en-tête `X-Goog-User-Project` (projet de quota) qui exige `serviceusage.services.use`.
   Sans ce rôle : `The caller does not have permission`, même avec tous les droits Play.
   ```bash
   gcloud projects add-iam-policy-binding <PROJECT_ID> \
     --member="serviceAccount:<SA_EMAIL>" \
     --role="roles/serviceusage.serviceUsageConsumer"
   ```
3. Play Console → **Users & permissions** → invite l'e-mail du compte de service
   avec les droits *Releases* + *Gérer la présence sur le Play Store*.
4. Secret GitHub :
   ```bash
   gh secret set PLAY_SERVICE_ACCOUNT_JSON --repo Devitek/dual < play-service-account.json
   ```

## 3. Créer l'app dans la Play Console — une seule fois
- Nouvelle application, package **`fr.devitek.twinlens`**, langue par défaut, gratuite.
- **Play App Signing** : laisser activé (par défaut).
- Fiche : les textes/images sont déjà prêts dans `fastlane/metadata/android/`
  (fr-FR + en-US). Tu peux les saisir à la main, **ou** les pousser (étape 5).
- **Politique de confidentialité** : `https://devitek.github.io/dual/privacy.html`.
- **Data safety** : « aucune donnée collectée / partagée » (tout est local).
  - ⚠️ **Depuis v1.9.0 (géotag opt-in)** : l'app inclut `ACCESS_FINE_LOCATION`
    (premier plan). Compléter dans la Play Console : (1) **déclaration
    d'autorisation de localisation** (usage = géomarquer les photos de l'utilisateur,
    **pas** d'arrière-plan) ; (2) **Data safety** → *Location · Approximate/Precise
    location* : collectée **oui** (traitement sur l'appareil), **partagée non**,
    optionnelle, non utilisée pour le suivi/pub. La localisation ne quitte jamais
    l'appareil (écrite dans l'EXIF de la photo).
- **Content rating** (IARC), audience cible, déclaration pub = non.
- **1er dépôt manuel** : Google exige que le **premier AAB** soit déposé à la main.
  Lance `gh workflow run release-android.yml -f upload_to_play=false` → l'**AAB
  signé est attaché à la release GitHub** (`TwinLens-vX.Y.Z.aab`, aussi en artefact
  `twinlens-aab`). Télécharge-le, puis Play Console → *Internal testing* → Create
  release → upload. Ensuite, tout passe par Fastlane.

## 4. Publier une build
1. Couper une release applicative : merge sur `main` → PR release-please → merge
   → tag `vX.Y.Z` (le `versionName` en découle ; le `versionCode` = numéro de run CI).
2. Lancer le workflow **Release (Play Store)** :
   ```bash
   # 1re fois (AAB attaché à la release, PAS d'envoi Play → dépôt manuel) :
   gh workflow run release-android.yml --repo Devitek/dual -f upload_to_play=false

   # ensuite (build + envoi auto sur la piste choisie) :
   gh workflow run release-android.yml --repo Devitek/dual \
     -f upload_to_play=true -f track=internal -f release_status=draft
   ```
3. Play Console → vérifier la release (draft) → *Rollout*.

## 5. Mettre à jour la fiche (textes/captures) sans binaire — depuis la CI
```bash
gh workflow run store-metadata.yml --repo Devitek/dual
```
Le workflow **Store Metadata** pousse `fastlane/metadata/android/` (6 langues :
titres, descriptions, icône, feature graphic, captures phone + 7"/10") via l'**API
Google Play brute** (`store/upload_listing.py`). On n'utilise PAS `fastlane supply`
ici : supply veut rattacher des notes de version à un versionCode même en mode
« fiche seule », ce qui casse sur une app neuve. Les **notes de version** restent
poussées avec l'AAB par `release-android.yml` (fastlane `internal`).

## 6. (Option) Vraies captures TÉLÉPHONE depuis ton appareil — en local
Les captures livrées sont des mockups. Pour des captures réelles de l'app :
```bash
# pré-requis : adb (platform-tools) + ImageMagick, téléphone en débogage USB.
# règle d'abord la langue du téléphone sur la locale visée.
bundle exec fastlane android capture_phone locale:fr-FR count:4
```
La lane te fait naviguer écran par écran (Entrée entre chaque), capture via `adb`,
normalise au ratio ≤ 2:1 exigé par Play, et écrit dans
`fastlane/metadata/android/<locale>/images/phoneScreenshots/`. Publie ensuite via
le workflow **Store Metadata**.

> 🔜 Tablettes 7"/10" : la lane est prête à évoluer via une option `device:`
> (phone|seveninch|teninch) pointant vers le bon dossier — il suffira de brancher
> une tablette. Les mockups 7"/10" actuels restent en attendant.

## Rappels
- Chaque upload doit **augmenter le `versionCode`** → géré via le numéro de run CI.
- `release_status: draft` = rien n'est diffusé tant que tu n'as pas cliqué *Rollout*.
- Assets de la fiche : `fastlane/metadata/android/` · sources des captures :
  `store/screenshots/src/` (régénérables via Chrome headless).
