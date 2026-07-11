#!/usr/bin/env python3
"""Pousse la FICHE Play Store (titres, descriptions, icône, feature graphic,
captures téléphone + tablettes) via l'API Google Play Developer BRUTE.

Pourquoi pas `fastlane supply` : supply insiste pour rattacher des notes de
version à une release (versionCode) même en mode « fiche seule », ce qui casse
sur une app neuve. L'API brute (prouvée fonctionnelle) ne fait QUE la fiche.
Les notes de version restent gérées par le lane fastlane `internal` (avec l'AAB).

Lit `fastlane/metadata/android/<locale>/` :
  title.txt, short_description.txt, full_description.txt
  images/icon.png, images/featureGraphic.png
  images/phoneScreenshots/*.png, images/sevenInchScreenshots/*.png,
  images/tenInchScreenshots/*.png

Env: PLAY_SERVICE_ACCOUNT_JSON_PATH (clé JSON du compte de service).
"""
import glob
import os
import sys

import requests
from google.oauth2 import service_account
import google.auth.transport.requests as gr

PKG = "fr.devitek.twinlens"
META = "fastlane/metadata/android"
API = "https://androidpublisher.googleapis.com/androidpublisher/v3"
UPLOAD = "https://androidpublisher.googleapis.com/upload/androidpublisher/v3"
IMG_TYPES = ["icon", "featureGraphic", "phoneScreenshots",
             "sevenInchScreenshots", "tenInchScreenshots"]


def die(ctx, r):
    print(f"ERREUR {ctx}: HTTP {r.status_code}\n{r.text[:800]}")
    sys.exit(1)


def main():
    key = os.environ["PLAY_SERVICE_ACCOUNT_JSON_PATH"]
    creds = service_account.Credentials.from_service_account_file(
        key, scopes=["https://www.googleapis.com/auth/androidpublisher"])
    creds.refresh(gr.Request())
    s = requests.Session()
    s.headers["Authorization"] = f"Bearer {creds.token}"

    r = s.post(f"{API}/applications/{PKG}/edits")
    if not r.ok:
        die("edits.insert", r)
    eid = r.json()["id"]
    base = f"{API}/applications/{PKG}/edits/{eid}"
    ubase = f"{UPLOAD}/applications/{PKG}/edits/{eid}"
    print(f"Edit {eid} créé.")

    def read(loc_dir, name):
        p = os.path.join(loc_dir, name)
        return open(p, encoding="utf-8").read().strip() if os.path.exists(p) else None

    for loc_dir in sorted(glob.glob(f"{META}/*")):
        loc = os.path.basename(loc_dir)
        title = read(loc_dir, "title.txt")
        short = read(loc_dir, "short_description.txt")
        full = read(loc_dir, "full_description.txt")
        if title or short or full:
            body = {"language": loc, "title": title or "",
                    "shortDescription": short or "", "fullDescription": full or ""}
            r = s.put(f"{base}/listings/{loc}", json=body)
            if not r.ok:
                die(f"listings.update {loc}", r)
            print(f"  texte {loc}: OK")

        imgdir = os.path.join(loc_dir, "images")
        for t in IMG_TYPES:
            single = os.path.join(imgdir, f"{t}.png")
            folder = os.path.join(imgdir, t)
            if os.path.exists(single):
                files = [single]
            elif os.path.isdir(folder):
                files = sorted(glob.glob(os.path.join(folder, "*.png")) +
                               glob.glob(os.path.join(folder, "*.jpg")))
            else:
                continue
            s.delete(f"{base}/listings/{loc}/{t}")  # remplace : purge puis ré-upload
            for f in files:
                ctype = "image/jpeg" if f.lower().endswith((".jpg", ".jpeg")) else "image/png"
                with open(f, "rb") as fh:
                    r = s.post(f"{ubase}/listings/{loc}/{t}?uploadType=media",
                               headers={"Content-Type": ctype}, data=fh.read())
                if not r.ok:
                    die(f"images.upload {loc}/{t}/{os.path.basename(f)}", r)
            print(f"  images {loc}/{t}: {len(files)}")

    # Commit. Une app neuve pas encore publiée exige changesNotSentForReview=true.
    r = s.post(f"{base}:commit")
    if not r.ok:
        r = s.post(f"{base}:commit?changesNotSentForReview=true")
    if not r.ok:
        die("edits.commit", r)
    print("FICHE PUBLIÉE ✅ (edit committé).")


if __name__ == "__main__":
    main()
