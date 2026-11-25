#!/bin/sh
# Paquet pour le Chrome Web Store : dist/tarifping-extension-store.zip
# (sans les adresses locales de test, http://localhost:8080, présentes dans la version téléchargeable depuis le site)
# Usage (depuis la racine du projet) : sh extension/paquet-store.sh
set -e
cd "$(dirname "$0")/.."
export MSYS_NO_PATHCONV=1 # Git Bash sous Windows : ne pas réécrire les chemins du conteneur
ROOT=$(pwd -W 2>/dev/null || pwd)
mkdir -p dist
docker run --rm -v "$ROOT/extension:/src:ro" -v "$ROOT/dist:/dist" php:8.2-cli sh -c '
  rm -rf /tmp/x && cp -r /src /tmp/x && rm -f /tmp/x/paquet-store.sh /tmp/x/icons/logo.svg &&
  php -r "\$f = \"/tmp/x/manifest.json\"; \$s = file_get_contents(\$f);
    \$s = preg_replace(\"/,\s*\\\"http:\/\/localhost:8080[^\\\"]*\\\"/\", \"\", \$s);
    if (str_contains(\$s, \"localhost\") || json_decode(\$s) === null) exit(1); file_put_contents(\$f, \$s);" &&
  apt-get -qq update >/dev/null && apt-get -qq install -y zip >/dev/null && cd /tmp/x && rm -f /dist/tarifping-extension-store.zip && zip -qr /dist/tarifping-extension-store.zip .'
echo "Paquet prêt : dist/tarifping-extension-store.zip"
