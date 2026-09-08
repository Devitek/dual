"""Avis Google Play : liste et reponse via l'API Play Developer (issue #171).

Deux actions (env ACTION) :
- list  : avis recents -> log + resume de job GitHub. ATTENTION (limite
          Google) : l'API ne renvoie que les avis crees/modifies sur environ
          une semaine glissante ; l'historique long vit dans
          docs-dev/play-reviews.md (journal versionne).
- reply : repond a UN avis (env REVIEW_ID + REPLY_TEXT). Limite Play : 350
          caracteres, une seule reponse (modifiable) par avis. Toute reponse
          envoyee ici DOIT etre reportee dans docs-dev/play-reviews.md.

Env : PLAY_SERVICE_ACCOUNT_JSON_PATH, ACTION, REVIEW_ID, REPLY_TEXT.
"""

import os
import sys

import requests
from google.oauth2 import service_account
import google.auth.transport.requests as gr

PKG = "fr.devitek.twinlens"
API = "https://androidpublisher.googleapis.com/androidpublisher/v3"
REPLY_MAX = 350


def die(msg: str) -> None:
    print(f"::error::{msg}")
    sys.exit(1)


def summary_write(md: str) -> None:
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a", encoding="utf-8") as f:
            f.write(md + "\n")


def session() -> requests.Session:
    key = os.environ.get("PLAY_SERVICE_ACCOUNT_JSON_PATH", "")
    if not key or not os.path.exists(key) or os.path.getsize(key) == 0:
        die("cle de service Play absente ou vide (le job doit tourner dans l'environment play-internal)")
    creds = service_account.Credentials.from_service_account_file(
        key, scopes=["https://www.googleapis.com/auth/androidpublisher"])
    creds.refresh(gr.Request())
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {creds.token}"
    return s


def do_list(s: requests.Session) -> None:
    r = s.get(f"{API}/applications/{PKG}/reviews", params={"maxResults": 100}, timeout=30)
    if not r.ok:
        die(f"reviews.list HTTP {r.status_code}: {r.text[:400]}")
    reviews = r.json().get("reviews", [])
    if not reviews:
        print("Aucun avis dans la fenetre d'une semaine de l'API.")
        summary_write("## Avis Play recents\n\nAucun avis dans la fenetre d'une semaine de l'API.")
        return

    lines = ["## Avis Play recents", "",
             "Rappel : fenetre d'environ une semaine seulement ; historique long dans docs-dev/play-reviews.md.", ""]
    for rev in reviews:
        rid = rev.get("reviewId", "?")
        author = rev.get("authorName", "(anonyme)")
        user = dev = None
        for c in rev.get("comments", []):
            if "userComment" in c:
                user = c["userComment"]
            if "developerComment" in c:
                dev = c["developerComment"]
        if user is None:
            continue
        stars = "★" * int(user.get("starRating", 0)) + "☆" * (5 - int(user.get("starRating", 0)))
        device = user.get("deviceMetadata", {}).get("productName", user.get("device", "?"))
        version = user.get("appVersionName", "?")
        lang = user.get("reviewerLanguage", "?")
        text = (user.get("text", "") or "").strip().replace("\n", " ")
        lines.append(f"### {stars} {author} ({lang}, {device}, v{version})")
        lines.append("")
        lines.append(f"- reviewId : `{rid}`")
        lines.append(f"- avis : {text}")
        if dev is not None:
            reply = (dev.get("text", "") or "").strip().replace("\n", " ")
            lines.append(f"- notre reponse actuelle : {reply}")
        else:
            lines.append("- notre reponse actuelle : (aucune)")
        lines.append("")
    out = "\n".join(lines)
    print(out)
    summary_write(out)


def validate_reply_inputs() -> tuple[str, str]:
    """Validation AVANT toute authentification : echec en local comme en CI,
    sans dependre de la cle ni de l'API."""
    review_id = (os.environ.get("REVIEW_ID", "") or "").strip()
    text = (os.environ.get("REPLY_TEXT", "") or "").strip()
    if not review_id:
        die("REVIEW_ID manquant (recuperable via l'action list)")
    if not text:
        die("REPLY_TEXT vide")
    if len(text) > REPLY_MAX:
        die(f"reponse de {len(text)} caracteres : la limite Play est {REPLY_MAX}. Raccourcis avant tout appel API.")
    return review_id, text


def do_reply(s: requests.Session, review_id: str, text: str) -> None:
    r = s.post(f"{API}/applications/{PKG}/reviews/{review_id}:reply",
               json={"replyText": text}, timeout=30)
    if not r.ok:
        die(f"reviews.reply HTTP {r.status_code}: {r.text[:400]}")
    edited = r.json().get("result", {}).get("lastEdited", {})
    print(f"Reponse envoyee ({len(text)}/{REPLY_MAX} caracteres).")
    summary_write(
        "## Reponse envoyee\n\n"
        f"- reviewId : `{review_id}`\n"
        f"- longueur : {len(text)}/{REPLY_MAX}\n"
        f"- texte :\n\n> {text}\n\n"
        f"- lastEdited : {edited}\n\n"
        "**NE PAS OUBLIER** : reporter cette reponse dans `docs-dev/play-reviews.md` (PR docs)."
    )


def main() -> None:
    action = os.environ.get("ACTION", "list")
    if action == "reply":
        review_id, text = validate_reply_inputs()
        do_reply(session(), review_id, text)
    else:
        do_list(session())


if __name__ == "__main__":
    main()
