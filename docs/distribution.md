# Distribution Marcel'IA

Ce document décrit les 3 modes de distribution de l'extension Marcel'IA pour VS Code.

## Prérequis

- Node.js >= 20.0.0
- npm installé
- `@vscode/vsce` (inclus dans les devDependencies)

## 1. Marketplace (privé ou public)

### Publication

```bash
# Définir le Personal Access Token (Azure DevOps)
export VSCE_PAT="votre-token"

# Build + publish en une commande
./scripts/deploy-extension.sh --publish
```

### Marketplace privé (Azure DevOps)

1. Créer un publisher sur https://marketplace.visualstudio.com/manage
2. Configurer la visibilité en "Private"
3. Ajouter les organisations autorisées dans les paramètres du publisher
4. Les développeurs installent via VS Code : Extensions > chercher "Marcel'IA"

### Open VSX (alternative)

```bash
npx ovsx publish marcelia.vsix -p <token>
```

## 2. Lien VSIX direct

### Générer le VSIX

```bash
cd packages/extension
npm run package:vsix
# Produit : packages/extension/marcelia.vsix
```

### Héberger le fichier

Copier `marcelia.vsix` sur un serveur HTTP interne ou un partage réseau :

```bash
./scripts/deploy-extension.sh --copy-to /chemin/partage/reseau
```

### Installation par un développeur

```bash
code --install-extension https://serveur-interne/marcelia.vsix
# ou depuis un fichier local
code --install-extension /chemin/vers/marcelia.vsix
```

## 3. Déploiement automatique

### Via script de login AD (GPO)

Créer un script PowerShell distribué par GPO :

```powershell
# deploy-marcelia.ps1
$vsixUrl = "https://serveur-interne/marcelia.vsix"
$vsixLocal = "$env:TEMP\marcelia.vsix"
$codePath = "C:\Program Files\Microsoft VS Code\bin\code.cmd"

# Vérifier si VS Code est installé
if (Test-Path $codePath) {
    # Télécharger le VSIX
    Invoke-WebRequest -Uri $vsixUrl -OutFile $vsixLocal

    # Installer silencieusement
    & $codePath --install-extension $vsixLocal --force

    # Nettoyer
    Remove-Item $vsixLocal
}
```

### Via SCCM/Intune

1. Packager le script PowerShell ci-dessus comme application SCCM
2. Cibler le groupe d'utilisateurs "Développeurs"
3. Méthode de détection : vérifier l'existence de `%USERPROFILE%\.vscode\extensions\eranove-gs2e.marcelia-vscode-*`

### Via script bash (macOS/Linux)

```bash
#!/bin/bash
VSIX_URL="https://serveur-interne/marcelia.vsix"
VSIX_LOCAL="/tmp/marcelia.vsix"

if command -v code &> /dev/null; then
    curl -sL "$VSIX_URL" -o "$VSIX_LOCAL"
    code --install-extension "$VSIX_LOCAL" --force
    rm -f "$VSIX_LOCAL"
fi
```

## Sécurité

- Seuls les utilisateurs avec un compte Azure AD ERANOVE peuvent utiliser Marcel'IA
- L'extension exige une authentification avant d'accéder au chat
- Le proxy vérifie le token JWT sur chaque requête API
- En production, `REQUIRE_AUTH=true` force l'authentification même en mode dev
