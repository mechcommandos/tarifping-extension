#!/bin/sh
# Extension TarifPing pour Safari (macOS + iOS/iPadOS), construite à partir du même code que Chrome/Edge (extension/).
# À lancer SUR UN MAC avec Xcode installé, depuis la racine du projet :
#   sh safari/build-safari.sh            -> projet Xcode dans build/safari/TarifPing (s'ouvre ensuite dans Xcode)
#   sh safari/build-safari.sh --no-open  -> même chose, sans ouvrir Xcode
# Rien n'est dupliqué : on copie extension/, on adapte le manifeste pour Safari, puis on lance le convertisseur d'Apple.
set -e
cd "$(dirname "$0")/.."

BUNDLE_ID="${TP_BUNDLE_ID:-com.tarifping.extension}"   # identifiant d'app (doit correspondre à celui créé sur developer.apple.com)
APP_NAME="TarifPing"
OUT="build/safari"
SRC="$OUT/extension"

command -v xcrun >/dev/null 2>&1 || { echo "xcrun introuvable : ce script doit tourner sur un Mac avec Xcode." >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "python3 introuvable (installé avec les outils de ligne de commande Xcode : xcode-select --install)." >&2; exit 1; }

rm -rf "$OUT"
mkdir -p "$OUT"
cp -R extension "$SRC"
rm -f "$SRC/paquet-store.sh" "$SRC/icons/logo.svg"

# Manifeste Safari : sans localhost, version minimale de Safari indiquée.
python3 - "$SRC/manifest.json" <<'PY'
import json, sys
p = sys.argv[1]
m = json.load(open(p, encoding="utf-8"))
m["host_permissions"] = [h for h in m["host_permissions"] if "localhost" not in h]
for cs in m.get("content_scripts", []):
    cs["matches"] = [u for u in cs["matches"] if "localhost" not in u]
# Service worker MV3 + API "action" : Safari 16.4 et plus (macOS 13.3 / iOS 16.4).
m["browser_specific_settings"] = {"safari": {"strict_min_version": "16.4"}}
json.dump(m, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
assert "localhost" not in open(p, encoding="utf-8").read()
PY

OPEN_FLAG=""
[ "$1" = "--no-open" ] && OPEN_FLAG="--no-open"

# Génère un projet Xcode avec deux cibles (app macOS + app iOS) qui embarquent l'extension.
xcrun safari-web-extension-converter "$SRC" \
  --project-location "$OUT" \
  --app-name "$APP_NAME" \
  --bundle-identifier "$BUNDLE_ID" \
  --swift \
  --copy-resources \
  --force \
  $OPEN_FLAG

PROJ_DIR="$OUT/$APP_NAME"

# --- Icônes de l'app (exigées par l'App Store) : générées depuis extension/icons/logo.svg -------------------------
# iOS : une icône 1024 sans transparence ; macOS : 16 à 512 en @1x et @2x. Fond blanc, aucune couche alpha.
ICON_TMP="$OUT/icons-tmp"
mkdir -p "$ICON_TMP"
ICON_SRC=""
if command -v rsvg-convert >/dev/null 2>&1; then
  rsvg-convert -w 1024 -h 1024 extension/icons/logo.svg -o "$ICON_TMP/source.png" && ICON_SRC="$ICON_TMP/source.png"
fi
if [ -z "$ICON_SRC" ] && command -v qlmanage >/dev/null 2>&1; then
  qlmanage -t -s 1024 -o "$ICON_TMP" extension/icons/logo.svg >/dev/null 2>&1 || true
  [ -f "$ICON_TMP/logo.svg.png" ] && ICON_SRC="$ICON_TMP/logo.svg.png"
fi
if [ -z "$ICON_SRC" ]; then
  echo "Attention : logo.svg non converti, icône agrandie depuis icon128.png (floue)." >&2
  ICON_SRC="extension/icons/icon128.png"
fi

cat > "$ICON_TMP/flatten.swift" <<'SWIFT'
import AppKit
let a = CommandLine.arguments   // source, dossier de sortie, tailles...
guard let img = NSImage(contentsOfFile: a[1]),
      let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
  FileHandle.standardError.write("image illisible : \(a[1])\n".data(using: .utf8)!); exit(1)
}
for s in a[3...] {
  let n = Int(s)!
  let ctx = CGContext(data: nil, width: n, height: n, bitsPerComponent: 8, bytesPerRow: 0,
                      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
  ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
  ctx.fill(CGRect(x: 0, y: 0, width: n, height: n))
  ctx.interpolationQuality = .high
  ctx.draw(cg, in: CGRect(x: 0, y: 0, width: n, height: n))
  let png = NSBitmapImageRep(cgImage: ctx.makeImage()!).representation(using: .png, properties: [:])!
  try! png.write(to: URL(fileURLWithPath: "\(a[2])/icon-\(n).png"))
}
SWIFT
xcrun swift "$ICON_TMP/flatten.swift" "$ICON_SRC" "$ICON_TMP" 16 32 64 128 256 512 1024

python3 - "$PROJ_DIR" "$ICON_TMP" <<'PY'
import json, os, shutil, sys
root, icons = sys.argv[1], sys.argv[2]
ios = [{"idiom": "universal", "platform": "ios", "size": "1024x1024", "filename": "icon-1024.png"}]
mac = []
for pt in (16, 32, 128, 256, 512):
    for scale in (1, 2):
        mac.append({"idiom": "mac", "size": f"{pt}x{pt}", "scale": f"{scale}x", "filename": f"icon-{pt * scale}.png"})
found = 0
for d, _, _ in os.walk(root):
    if not d.endswith("AppIcon.appiconset"):
        continue
    images = ios if "iOS" in d and "macOS" not in d else mac if "macOS" in d else ios + mac
    for f in os.listdir(d):
        if f.endswith(".png"):
            os.remove(os.path.join(d, f))
    for im in images:
        shutil.copy(os.path.join(icons, im["filename"]), d)
    json.dump({"images": images, "info": {"author": "xcode", "version": 1}}, open(os.path.join(d, "Contents.json"), "w"), indent=2)
    found += 1
    print("Icônes :", d)
if not found:
    sys.exit("Aucun dossier AppIcon.appiconset trouvé dans le projet généré")
PY
rm -rf "$ICON_TMP"

# --- Info.plist des apps : chiffrement standard uniquement (évite la question à chaque envoi) et catégorie Mac App Store
PB=/usr/libexec/PlistBuddy
find "$PROJ_DIR" -path "*(App)/Info.plist" | while read -r plist; do
  $PB -c "Delete :ITSAppUsesNonExemptEncryption" "$plist" >/dev/null 2>&1 || true
  $PB -c "Add :ITSAppUsesNonExemptEncryption bool false" "$plist"
  case "$plist" in
    *macOS*)
      $PB -c "Delete :LSApplicationCategoryType" "$plist" >/dev/null 2>&1 || true
      $PB -c "Add :LSApplicationCategoryType string public.app-category.productivity" "$plist" ;;
  esac
  echo "Info.plist complété : $plist"
done

echo "Projet Xcode prêt : $OUT/$APP_NAME/$APP_NAME.xcodeproj"
echo "Suite : voir safari/README.md (signature, test dans Safari, envoi sur l'App Store)."
