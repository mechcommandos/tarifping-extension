# Extension TarifPing pour Safari

Même extension que Chrome/Edge (dossier `extension/`, Manifest V3), empaquetée pour Safari sur
**macOS, iPhone et iPad**. Safari accepte les extensions web (API `chrome.*` comprise) mais exige
qu'elles soient livrées **dans une app** construite avec Xcode et distribuée par l'App Store.
Il n'y a donc pas de code à part : toute modification se fait dans `extension/`, puis on reconstruit.

## Ce qu'il faut

- Un Mac avec **Xcode 15 ou plus** (gratuit sur le Mac App Store) et `xcode-select --install`.
- Un compte **Apple Developer** (99 $/an) pour signer et publier. Sans compte, on peut quand même
  tester sur son propre Mac (voir « Tester sans compte »).
- Safari 16.4 ou plus (macOS 13.3, iOS/iPadOS 16.4).

## 1. Construire le projet Xcode

Copier le projet sur le Mac (au minimum `extension/` et `safari/`), puis depuis la racine :

```sh
sh safari/build-safari.sh
```

Le script copie `extension/` dans `build/safari/extension`, retire les adresses `localhost` du
manifeste, ajoute `browser_specific_settings.safari`, puis lance `xcrun safari-web-extension-converter`.
Résultat : `build/safari/TarifPing/TarifPing.xcodeproj`, avec 4 cibles (app + extension, pour macOS et pour iOS).

Identifiant d'app par défaut : `com.tarifping.extension` (l'extension sera
`com.tarifping.extension.Extension`). Pour en changer : `TP_BUNDLE_ID=com.autre.id sh safari/build-safari.sh`.

## 2. Tester sur le Mac

1. Dans Xcode, choisir le schéma **TarifPing (macOS)**. Dans *Signing & Capabilities*, sélectionner
   votre équipe (Team) pour les deux cibles macOS.
2. *Product › Run* : l'app TarifPing s'ouvre (elle sert juste à activer l'extension).
3. Safari › Réglages › Extensions : cocher **TarifPing**.
4. Cliquer sur l'icône TarifPing dans la barre d'outils, puis **Autoriser sur tous les sites web**
   (ou au moins sur tarifping.com et les boutiques). Sans cela, Safari demande l'autorisation site par site
   et l'extension ne voit pas les pages produit.
5. Ouvrir https://tarifping.com/app/extension en étant connecté : l'extension se relie au compte
   automatiquement, comme sous Chrome.

### Tester sans compte développeur

Safari › Réglages › Avancé › cocher « Afficher les fonctionnalités pour les développeurs web »,
puis menu Développement › **Autoriser les extensions non signées** (à refaire à chaque lancement de Safari).
Lancer ensuite l'app depuis Xcode avec « Sign to Run Locally ».

## 3. Tester sur iPhone / iPad

Schéma **TarifPing (iOS)**, brancher l'appareil, *Run*. Puis sur l'appareil : Réglages › Apps › Safari ›
Extensions › TarifPing › activer et autoriser « Tous les sites web ». Dans Safari, l'extension est dans
le menu **aA** de la barre d'adresse.

## 4. Publier sur l'App Store

1. Sur https://developer.apple.com/account › Identifiers : créer les identifiants
   `com.tarifping.extension` et `com.tarifping.extension.Extension` (si Xcode ne le fait pas tout seul).
2. Sur App Store Connect : *Mes apps › +* › nouvelle app **TarifPing**, plateformes macOS et iOS,
   même identifiant. Catégorie : Productivité ou Shopping. Prix : gratuit.
3. Dans Xcode : *Product › Archive* (une fois pour macOS, une fois pour iOS), puis *Distribute App ›
   App Store Connect*.
4. Remplir la fiche (textes et captures : reprendre `store-listing/`). Pour la confidentialité,
   déclarer les mêmes données que pour le Chrome Web Store : adresse et prix des pages produit
   suivies, envoyés au compte TarifPing de l'utilisateur. URL de confidentialité :
   https://tarifping.com/confidentialite
5. Soumettre à la vérification. Apple refuse souvent une app « vide » : la petite app générée affiche
   déjà comment activer l'extension, c'est accepté en général pour les extensions Safari.

Une fois en ligne, mettre l'adresse App Store dans `priceradar-web/src/api.js` (à côté de
`CHROME_STORE_URL` / `EDGE_STORE_URL`) pour afficher un bouton Safari sur la page Extension.

## Construire sans Mac (GitHub Actions)

Le fichier `.github/workflows/safari.yml` fait tout sur un Mac loué par GitHub : génération du projet Xcode, signature,
archive et envoi sur App Store Connect (TestFlight), pour macOS et iOS. Rien à installer sur Windows.

### 1. Clé API App Store Connect (une seule fois)

1. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) > **Utilisateurs et accès** > **Intégrations** >
   **Clés d'API App Store Connect** > **+**, nom `GitHub TarifPing`, rôle **Admin** (nécessaire pour créer les
   certificats et profils automatiquement).
2. Téléchargez le fichier `AuthKey_XXXXXXXXXX.p8` : **Apple ne le propose qu'une fois**, gardez-le en lieu sûr (jamais dans le dépôt).
3. Notez l'**Issuer ID** (en haut de la page) et le **Key ID** (colonne de la clé).
4. Notez le **Team ID** : [developer.apple.com/account](https://developer.apple.com/account) > Membership details.

Les identifiants d'app et la fiche App Store Connect doivent exister (voir section 4 ci-dessus).

### 2. Secrets GitHub

Dépôt GitHub > **Settings** > **Secrets and variables** > **Actions** > **New repository secret** :

| Secret | Contenu |
|---|---|
| `APPLE_TEAM_ID` | Team ID (10 caractères) |
| `ASC_KEY_ID` | Key ID de la clé API |
| `ASC_ISSUER_ID` | Issuer ID |
| `ASC_KEY_P8` | contenu du fichier `.p8` (collé tel quel, BEGIN/END compris), ou sa version base64 |
| `APPLE_CERT_P12_BASE64` | *facultatif* : certificat de distribution exporté en `.p12`, en base64 |
| `APPLE_CERT_PASSWORD` | *facultatif* : mot de passe de ce `.p12` |

Pour copier un fichier en base64 sous Windows (PowerShell) :

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("AuthKey_XXXXXXXXXX.p8")) | Set-Clipboard
```

Sans certificat `.p12`, la clé API suffit : Xcode crée lui-même certificat et profils. Pour un autre identifiant que
`com.tarifping.extension`, ajoutez une **variable** (onglet *Variables*) `TP_BUNDLE_ID`.

### 3. Dépôt

Les minutes Mac comptent **10 fois** sur un dépôt privé (quota gratuit vite épuisé) et sont **gratuites sur un dépôt public**.
Le plus simple : un dépôt public qui ne contient que `extension/`, `safari/`, `.github/` et `.gitignore` (aucun secret
dedans : le code de l'extension est de toute façon lisible par quiconque l'installe). Ne publiez jamais `tarifping-php/`
(`api/config.php` contient les clés de production).

### 4. Lancer

- **À la main** : onglet **Actions** > **Safari (macOS + iOS)** > **Run workflow** (choix des plateformes, envoi ou non).
- **Automatiquement** : `git tag safari-v1.2.3` puis `git push --tags`.

Comptez 10 à 20 minutes par plateforme, puis 10 à 30 minutes de traitement chez Apple avant que le build apparaisse dans
**TestFlight**. Les journaux (et les fichiers `.pkg` / `.ipa` si l'envoi est désactivé) restent 14 jours dans
**Artifacts** de l'exécution. Ensuite, soumission à la vérification comme à la section 4.

## Mises à jour

- **Avec GitHub Actions** : changer `version` dans `extension/manifest.json` et relancer le workflow. Le numéro de build
  augmente tout seul (numéro d'exécution).
- **Avec un Mac** : changer `version` dans `extension/manifest.json`, relancer `sh safari/build-safari.sh`, puis dans Xcode
  augmenter aussi *Version* / *Build* des cibles avant *Archive*.

## Différences avec Chrome connues

- **Autorisations** : Safari laisse l'utilisateur choisir les sites. Tant que tarifping.com n'est pas
  autorisé, les appels à l'API passent par le CORS : le serveur répond donc aux origines
  `safari-web-extension://` sur `/api/ext/*` (voir `tarifping-php/www/api/index.php`).
- **Badge** : sur iOS, la couleur du badge n'est pas toujours gérée (l'appel est protégé, le texte reste).
- **Service worker** : Safari l'arrête plus vite que Chrome. L'extension ne garde rien en mémoire
  d'important (le compte et le jeton sont dans `chrome.storage.local`), donc ce n'est pas un problème.
