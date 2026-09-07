# shell.nix — environnement de dev NixOS pour builder TwinLens
# (Expo SDK 57 / React Native 0.86, Android uniquement).
#
# Usage :
#   nix-shell            # entre dans le shell (SDK Android + JDK 17 + Node 20 prêts)
#   npx expo run:android # build + install du dev build sur l'appareil/emulateur
#
# Astuce direnv : créez un `.envrc` contenant `use nix` puis `direnv allow`.
#
# Versions calquées sur la CI et les défauts Expo SDK 57 / RN 0.86 :
#   Node 20 · JDK 17 (temurin) · compileSdk/targetSdk 36 · minSdk 24
#   NDK 27.1.12297006 · build-tools 36.0.0 · cmake 3.22.1 · Gradle wrapper 9.3.1
#
# Reproductibilité : par défaut on utilise le canal <nixpkgs> du système. Pour
# épingler une révision précise, décommentez le bloc `pinnedPkgs` plus bas.

{ pkgs ? import <nixpkgs> {
    config = {
      allowUnfree = true;                 # le SDK Android est "unfree"
      android_sdk.accept_license = true;  # accepte les licences SDK sans prompt
    };
  }
}:

let
  # --- (Option) nixpkgs épinglé pour une repro stricte -----------------------
  # pinnedPkgs = import (builtins.fetchTarball {
  #   # Choisissez un commit nixos-unstable récent (contient build-tools 36 /
  #   # NDK 27.1.12297006 / cmake 3.22.1). Récupérez le sha via :
  #   #   nix-prefetch-url --unpack https://github.com/NixOS/nixpkgs/archive/<rev>.tar.gz
  #   url = "https://github.com/NixOS/nixpkgs/archive/<REV>.tar.gz";
  #   sha256 = "<SHA256>";
  # }) { config = { allowUnfree = true; android_sdk.accept_license = true; }; };
  # pkgs = pinnedPkgs;  # puis remplacer `pkgs` ci-dessous par `pinnedPkgs`.

  # --- Composition du SDK Android -------------------------------------------
  androidComposition = pkgs.androidenv.composeAndroidPackages {
    cmdLineToolsVersion = "latest";
    # platformToolsVersion laissé par défaut (adb récent fourni par le canal).
    buildToolsVersions = [ "36.0.0" "35.0.0" ];
    platformVersions = [ "36" "35" ];
    includeNDK = true;
    ndkVersions = [ "27.1.12297006" ];      # imposé par RN 0.86
    cmakeVersions = [ "3.22.1" ];           # utilisé par l'externalNativeBuild RN
    includeEmulator = false;                # passez à true si vous voulez un AVD
    includeSystemImages = false;
  };

  androidSdk = "${androidComposition.androidsdk}/libexec/android-sdk";
  ndk = "${androidSdk}/ndk/27.1.12297006";
  jdk = pkgs.jdk17;

  # Dépendances runtime de « React Native DevTools » (app Electron/Chromium
  # récupérée à la volée par dotslash). Sur NixOS, ce binaire prébuilt ne trouve
  # pas ses libs → on les fournit via nix-ld (NIX_LD_LIBRARY_PATH). Liste dérivée
  # du `ldd` du binaire (set Electron classique). Non essentiel : sert au
  # debugger (touche `j`) ; sans ça, Metro et l'app fonctionnent quand même.
  electronDeps = with pkgs; [
    glib nss nspr atk at-spi2-atk at-spi2-core cairo pango gtk3 gdk-pixbuf
    cups dbus expat alsa-lib systemd libxkbcommon fontconfig freetype libdrm
    (pkgs.libgbm or pkgs.mesa) mesa
    libx11 libxcb libxcomposite libxdamage libxext
    libxfixes libxrandr libxrender libxtst libxi
  ];
in
pkgs.mkShell {
  name = "twinlens-android";

  buildInputs = [
    jdk
    # La CI tourne sur Node 20 ; en local on prend le LTS 22 (Node 20 est marqué
    # "insecure" dans nixpkgs). Expo SDK 57 / RN 0.86 supportent Node 20.19+/22+.
    pkgs.nodejs_22
    androidComposition.androidsdk
    pkgs.watchman      # accélère/évite les soucis de file-watching de Metro
    pkgs.git
    pkgs.unzip
    pkgs.python3       # requis par certains scripts de build node (node-gyp)
  ];

  # --- Variables d'environnement --------------------------------------------
  JAVA_HOME = "${jdk}";
  ANDROID_HOME = androidSdk;          # legacy, encore lu par Expo/RN
  ANDROID_SDK_ROOT = androidSdk;      # variable canonique
  ANDROID_NDK_ROOT = ndk;
  ANDROID_NDK_HOME = ndk;

  # aapt2 : AGP télécharge par défaut un binaire dynamiquement lié qui NE
  # fonctionne PAS sur NixOS. On force celui (patchelf'd) du SDK Nix. La syntaxe
  # `-Dorg.gradle.project.X=Y` définit la propriété de projet Gradle `X`.
  GRADLE_OPTS = "-Dorg.gradle.project.android.aapt2FromMavenOverride=${androidSdk}/build-tools/36.0.0/aapt2";

  shellHook = ''
    # adb, sdkmanager, avdmanager sur le PATH.
    export PATH="${androidSdk}/platform-tools:${androidSdk}/cmdline-tools/latest/bin:$PATH"

    # React Native DevTools (Electron via dotslash) : libs fournies à nix-ld.
    # On préfixe la valeur système existante (ne l'écrase pas).
    export NIX_LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath electronDeps}''${NIX_LD_LIBRARY_PATH:+:''$NIX_LD_LIBRARY_PATH}"

    echo "──────────────────────────────────────────────"
    echo " TwinLens · dev shell Android (NixOS)"
    echo "  node        $(node -v)"
    echo "  java        $(java -version 2>&1 | head -n1)"
    echo "  ANDROID_HOME=$ANDROID_HOME"
    echo "  NDK         27.1.12297006"
    echo ""
    echo "  → npx expo run:android   (build + install du dev build)"
    echo "──────────────────────────────────────────────"
  '';
}
