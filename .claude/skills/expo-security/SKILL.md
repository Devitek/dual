---
name: expo-security
description: Utiliser pour toute question de sécurité/privacy sur TwinLens — nouvelle dépendance, permission, stockage, partage d'URI, exported components. La règle cardinale est l'ADR 0007 (zéro réseau applicatif).
---

# Sécurité & privacy (TwinLens)

> Autorité : ADR 0007 (« privacy = produit »), AGENTS.md §3, ADR 0006.

## Le modèle de menace réel de cette app

Pas de backend, pas d'auth, pas de WebView, pas de données sensibles stockées :
la surface est (1) la **chaîne CI/release** (secrets, supply chain), (2) les
**permissions/déclarations Play**, (3) les **URI partagés** entre apps.

## Règles cardinales

1. **ADR 0007** : aucune dépendance qui transmet des données hors de l'appareil
   (analytics, crash reporter réseau, OTA). Toute PR qui en introduit une doit
   d'abord faire évoluer l'ADR — sinon refus. La Data Safety Play reste
   « aucune collecte ».
2. **Nouvelle dépendance** = triple contrôle : manifest injecté (permissions —
   cf. skill expo-prebuild-cng), trafic réseau éventuel (ADR 0007), état
   supply chain (ADR 0006 : version pinnée, auto-merge restreint).
3. **Stockage** : AsyncStorage = réglages non sensibles uniquement (c'est le
   cas aujourd'hui). Si une donnée sensible apparaissait un jour →
   `expo-secure-store` (Keystore) + nouvel ADR.
4. **Partage d'URI** : toujours `content://` (MediaStore/FileProvider), jamais
   `file://` inter-apps ; `ClipData` + `FLAG_GRANT_READ_URI_PERMISSION` (cf.
   `VideoPipComposerModule.shareToApp`) ; MIME exact via
   `ContentResolver.getType` (le générique `video/*` casse Instagram).
5. **Exported components** : uniquement tuile QS (`BIND_QUICK_SETTINGS_TILE`)
   et widget (`APPWIDGET_UPDATE`) — protégés par permissions système. Tout
   nouvel exported = revue + justification en PR.
6. **`queries`** : packages ciblés nommés, jamais `QUERY_ALL_PACKAGES`.

## Vérifications types

```bash
# Permissions du manifest fusionné (à coller en PR si natif touché)
npx expo prebuild --platform android --no-install --clean && \
  grep -o 'android:name="android.permission.[^"]*"' android/app/src/main/AndroidManifest.xml | sort -u
# Réseau caché dans une dep candidate
grep -rn "fetch(\|XMLHttpRequest\|okhttp\|HttpURLConnection" node_modules/<pkg>/src 2>/dev/null | head
```
