# Journal des avis Play et de nos réponses

Pourquoi ce fichier : l'API Play (`reviews.list`) ne renvoie que les avis
créés ou modifiés sur environ **une semaine glissante**, et la Play Console ne
fournit aucun historique exploitable de NOS réponses. Deux réponses ont déjà
été rédigées puis perdues (issue #171). Ce journal est l'historique long.

Règles :
- **Toute réponse envoyée** (console ou workflow `play-reviews.yml`) est
  reportée ici : avis (texte original), réponse, dates, contexte.
- Limite Play : 350 caractères par réponse, une seule réponse (modifiable) par avis.
- Ton des réponses : courtes, factuelles, orientées solution ; jamais de
  promesse non tenue par une version livrée ; dans la langue de l'avis.
- Outillage : workflow `play-reviews.yml` (action `list` pour récupérer les
  `reviewId`, action `reply` pour répondre avec validation de longueur).

---

## 2026-09-05 · Omar Alejandro Medina Ehuan · 1★ · es · Oppo Reno12 5G (Android 16)

Version au moment de l'avis : 1.15.1 (versionCode 160).

**Avis (original espagnol, résumé)** : l'app n'ouvre qu'une seule caméra à la
fois (avant OU arrière, jamais les deux).

Cause : Oppo n'expose pas l'API concurrent-camera sur le Reno12 5G. À la date
de l'avis, TwinLens basculait en mono-caméra sur ces appareils ; le repli
séquentiel (photo duale arrière puis avant, fusion auto) est arrivé en 1.22.

**Réponse 1 (2026-09-07, console)** :

> ¡Hola! Gracias por tu comentario. TwinLens necesita que el teléfono permita
> usar ambas cámaras a la vez (función «concurrent cameras» de Android). En el
> Reno12 5G, Oppo no expone esa función a las apps, así que solo funciona una
> cámara. Es un límite del fabricante, no de la app. Si Oppo la habilita,
> funcionará automáticamente. ¡Saludos!

**Réponse 2 (2026-09-09, mise à jour après livraison du mode séquentiel en
production, rollout 10 %)** :

> ¡Hola de nuevo! Buenas noticias: desde la versión 1.22, TwinLens también
> funciona en tu Reno12 5G gracias al nuevo modo secuencial: dispara con ambas
> cámaras una tras otra y combina las dos fotos automáticamente. Actualiza la
> app para probarlo (el vídeo dual sigue limitado por Oppo, la foto dual ya
> funciona). ¡Gracias por tu paciencia!

Suivi : s'il repasse l'avis à la hausse ou répond, noter ici.
