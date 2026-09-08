"""Garde versionCode (issue #150, ADR 0002).

Compare le versionCode calcule (git rev-list --count HEAD) au maximum deja
publie sur Google Play (toutes pistes). Echoue AVANT le build si le nouveau
n'est pas strictement superieur : message clair en 30 s au lieu d'un rejet
`supply` apres 25 min de build.

Comportement :
- versionCode <= max publie  -> exit 1 (violation, message explicite) ;
- API Play indisponible/erreur -> warning + exit 0 (garde best-effort : la
  flakiness de l'API ne doit pas bloquer une release valide) ;
- cle de service absente/vide  -> warning + exit 0.

Env : PLAY_SERVICE_ACCOUNT_JSON_PATH, APP_VERSION_CODE.
"""

import os
import sys

import requests
from google.oauth2 import service_account
import google.auth.transport.requests as gr

PKG = "fr.devitek.twinlens"
API = "https://androidpublisher.googleapis.com/androidpublisher/v3"


def warn_skip(msg: str) -> None:
    print(f"::warning::Garde versionCode ignoree : {msg}")
    sys.exit(0)


def main() -> None:
    code_str = os.environ.get("APP_VERSION_CODE", "")
    if not code_str.isdigit():
        warn_skip(f"APP_VERSION_CODE invalide ({code_str!r})")
    new_code = int(code_str)

    key = os.environ.get("PLAY_SERVICE_ACCOUNT_JSON_PATH", "")
    if not key or not os.path.exists(key) or os.path.getsize(key) == 0:
        warn_skip("cle de service Play absente ou vide")

    try:
        creds = service_account.Credentials.from_service_account_file(
            key, scopes=["https://www.googleapis.com/auth/androidpublisher"])
        creds.refresh(gr.Request())
        s = requests.Session()
        s.headers["Authorization"] = f"Bearer {creds.token}"

        r = s.post(f"{API}/applications/{PKG}/edits", timeout=30)
        r.raise_for_status()
        eid = r.json()["id"]

        r = s.get(f"{API}/applications/{PKG}/edits/{eid}/tracks", timeout=30)
        r.raise_for_status()
        tracks = r.json().get("tracks", [])

        # L'edit n'est jamais committee : on la supprime (best-effort).
        s.delete(f"{API}/applications/{PKG}/edits/{eid}", timeout=30)
    except Exception as e:  # noqa: BLE001 - garde best-effort, on liste tout
        warn_skip(f"API Play injoignable ({type(e).__name__}: {e})")

    published = [
        vc
        for t in tracks
        for rel in t.get("releases", [])
        for vc in rel.get("versionCodes", [])
    ]
    if not published:
        warn_skip("aucun versionCode publie trouve (premiere release ?)")

    max_published = max(int(vc) for vc in published)
    print(f"versionCode calcule: {new_code} / max publie sur Play: {max_published}")

    if new_code <= max_published:
        print(
            f"::error::versionCode {new_code} <= {max_published} (max publie sur Play). "
            "Le rev-list a probablement recule : historique de main reecrit, ou build "
            "depuis un checkout partiel (fetch-depth != 0). Voir ADR 0002 : ne JAMAIS "
            "reecrire l'historique de main, ne jamais fixer le versionCode a la main."
        )
        sys.exit(1)

    print("OK : versionCode strictement superieur, le build peut continuer.")


if __name__ == "__main__":
    main()
