"""Affiche la ou les versions presentes sur une piste Play (issue #169).

Sert au workflow play-promote : montrer AVANT la promotion quelle version
va partir (la promotion prend toujours la derniere version de la piste
source, ce n'est pas un parametre).

Best-effort : toute erreur sort en warning, exit 0 (l'affichage ne doit pas
bloquer une promotion valide).

Env : PLAY_SERVICE_ACCOUNT_JSON_PATH, TRACK_NAME.
Sortie : lignes lisibles + resume dans GITHUB_STEP_SUMMARY si present.
"""

import os
import sys

import requests
from google.oauth2 import service_account
import google.auth.transport.requests as gr

PKG = "fr.devitek.twinlens"
API = "https://androidpublisher.googleapis.com/androidpublisher/v3"


def warn_skip(msg: str) -> None:
    print(f"::warning::Lecture de piste ignoree : {msg}")
    sys.exit(0)


def main() -> None:
    track_name = os.environ.get("TRACK_NAME", "")
    key = os.environ.get("PLAY_SERVICE_ACCOUNT_JSON_PATH", "")
    if not track_name:
        warn_skip("TRACK_NAME manquant")
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
        r = s.get(f"{API}/applications/{PKG}/edits/{eid}/tracks/{track_name}", timeout=30)
        r.raise_for_status()
        track = r.json()
        s.delete(f"{API}/applications/{PKG}/edits/{eid}", timeout=30)
    except Exception as e:  # noqa: BLE001 - affichage best-effort
        warn_skip(f"API Play injoignable ({type(e).__name__}: {e})")

    releases = track.get("releases", [])
    if not releases:
        warn_skip(f"aucune release sur la piste '{track_name}'")

    lines = [f"Piste source '{track_name}' : la promotion prendra la DERNIERE version listee."]
    for rel in releases:
        name = rel.get("name", "?")
        status = rel.get("status", "?")
        codes = ", ".join(str(c) for c in rel.get("versionCodes", []))
        lines.append(f"- {name} (versionCode {codes}, statut {status})")
    out = "\n".join(lines)
    print(out)

    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write("## Version(s) sur la piste source\n\n" + out + "\n")


if __name__ == "__main__":
    main()
