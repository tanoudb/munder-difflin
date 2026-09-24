<div align="center">

<img src="./docs/logo.png" alt="Open Space" width="160">

# Open Space

### Votre bureau de clones IA, en local et en français

</div>

Open Space transforme l'agent de code en ligne de commande que vous utilisez déjà
(Claude Code, Codex, Gemini, un modèle local…) en une équipe d'agents qui travaillent
pour vous, même quand vous n'êtes pas là. Chaque agent a sa mémoire, sa boîte de
réception et son bureau sur un plateau en pixel art. Votre clone, le directeur,
répartit le travail et ne vous dérange que quand c'est nécessaire.

- **En français par défaut**, avec l'anglais en second choix (Paramètres → Général → Langue).
- **Aucun compte, rien à payer.** L'app n'a ni inscription, ni licence, ni offre payante.
- **Tout reste sur votre machine** : vos agents, leur mémoire, vos projets et vos réglages.
- **Aucune statistique d'usage envoyée.**

## Installer

Téléchargez la dernière version sur la page
[Releases](https://github.com/tanoudb/munder-difflin/releases/latest) :

| Système | Fichier |
| --- | --- |
| macOS (Apple Silicon et Intel) | `Open-Space-<version>-mac-universal.dmg` |
| Windows 10 et 11 (64 bits) | `Open-Space-<version>-win-x64-setup.exe` (ou la version `portable`) |

Les installateurs ne sont pas signés par Apple ni par Microsoft, donc le système vous
prévient au premier lancement :

- **macOS** : glissez Open Space dans Applications. Si macOS refuse de l'ouvrir, allez
  dans Réglages Système → Confidentialité et sécurité → « Ouvrir quand même ». S'il dit
  que l'app est endommagée, tapez dans le Terminal
  `xattr -cr "/Applications/Open Space.app"` puis relancez-la.
- **Windows** : sur « Windows a protégé votre ordinateur », cliquez sur « Informations
  complémentaires » puis « Exécuter quand même ».

Sur Mac, une app non signée ne peut pas se mettre à jour toute seule : quand une
nouvelle version sort, l'app vous la signale et vous téléchargez le nouveau `.dmg`.
Sur Windows, la mise à jour s'installe au redémarrage.

## Comptes et moteurs IA

Open Space ne demande aucun compte. Ce sont les agents qui ont besoin d'un **moteur IA**,
et chaque moteur utilise sa propre connexion :

- **Claude Code** : votre compte Anthropic (abonnement Claude Pro ou Max, ou clé API).
- **Codex** : votre compte OpenAI ou ChatGPT. Même principe pour Gemini, Grok, Kimi, Qwen, Copilot, Cursor…
- **Sans aucun compte** : un modèle local avec Ollama ou LM Studio (moteurs OpenCode,
  Crush, pi ou Qwen). C'est gratuit, mais il faut une machine avec beaucoup de mémoire vive.

Options facultatives : Slack (envoyer des tâches depuis un canal), intégrations (GitHub…),
dictée vocale Free Flow (clé Groq gratuite).

L'app ne se connecte d'elle-même qu'à ce dépôt GitHub : pour chercher les mises à jour
(désactivable dans Paramètres → Général) et pour la liste des modèles d'IA proposés.

## Fabriquer l'app vous-même

### Avec GitHub Actions (le plus simple)

1. Dans l'onglet **Actions** du dépôt, activez les workflows.
2. Choisissez le workflow **Release**, puis **Run workflow**. Quand le build est
   terminé, le `.dmg` et le `.exe` sont téléchargeables en bas de la page de
   l'exécution (section *Artifacts*).
3. Pour publier une vraie version : mettez à jour `version` dans `package.json` et les
   noms de fichiers dans `RELEASE.md`, puis poussez un tag `vX.Y.Z`. Le workflow crée la
   page de release avec les installateurs.

### Sur votre ordinateur

Prérequis : [Node.js](https://nodejs.org) 20 ou plus récent, Python 3, et les outils de
compilation de votre système (Xcode Command Line Tools sur Mac :
`xcode-select --install` ; « Visual Studio Build Tools » avec l'option C++ sur Windows).

```bash
npm install          # installe les dépendances et compile les modules natifs
npm run dev          # lance l'app en mode développement
npm run dist:mac     # fabrique le .dmg (sur un Mac)
npm run dist:win     # fabrique le .exe (sur Windows)
```

Les installateurs sont créés dans le dossier `dist/`.

Avant de proposer une modification : `npm run typecheck` et `npm run test:focused`.
L'architecture est décrite dans [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## Réglages du produit

- `src/shared/features.ts` : interrupteurs de fonctionnalités. La discussion vocale
  en temps réel (API Realtime d'OpenAI, payante à l'usage) y est désactivée ; il suffit
  de passer `REALTIME_VOICE` à `true` pour la réactiver.
- `src/renderer/src/i18n/locales/` : les textes de l'interface, en français (`fr.json`)
  et en anglais (`en.json`). Les deux fichiers doivent avoir exactement les mêmes clés.

## Crédits et licence

Open Space est basé sur **Munder Difflin** de Chaitanya Giri, distribué sous licence MIT.
Le code d'Open Space reste sous licence [MIT](./LICENSE), qui conserve la mention de
copyright d'origine.

Les décors en pixel art viennent de « Modern Interiors » de
[LimeZu](https://limezu.itch.io/), sous une licence séparée qui impose de créditer
l'auteur : voir [LICENSE-ASSETS](./LICENSE-ASSETS) et
[src/renderer/src/assets/ATTRIBUTION.md](./src/renderer/src/assets/ATTRIBUTION.md).
