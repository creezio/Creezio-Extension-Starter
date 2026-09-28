# Fichiers

- `module/public-contract.ts` : IDs des huit opérations et types JSON partagés ; `requestKey` appartient à l'idempotence du moteur.
- `module/models.ts` : modèles `request`, `file_metadata`, `request_attachment`, sans SQL ni migration dans le paquet.
- `module/operations.ts` : handlers SDK publics, contrôle de propriétaire/contexte, révision attendue et plans D1/R2.
- `module/generate-manifest.mjs` et `module/manifest.json` : déclaration complète générée avec provenance Git/intégrité réelles ; la catégorie privée `request-attachment` partage son propriétaire principal entre audiences autorisées.
- `ui/` : vues workspace/front, états de formulaire, journal public SDK 1.2 et composants publics ; la création front utilise `/purchase-requests/new`. Les anciens pointeurs de commandes incertaines restent lisibles sans replay.
- `plugin/` : manifeste, configuration MCP, contribution et skill de lecture des demandes ; les ressources/widgets HTML sont dans `ui/widgets/`.
- `tests/` : six familles de contrôles backend/ui/api-mcp/widgets/package/docs ; la suite UI vérifie la navigation réelle via le composant public `Workspace` du SDK.
- `ci/bootstrap-sdk.mjs`, `ci/bootstrap-sdk.test.mjs` et `ci/sdk-pin.json` : téléchargement borné de la release publique SDK 1.2.0, vérification SHA-256 et tests de refus ; `ci/run-suite.mjs` contrôle les six familles.
- `.github/workflows/package.yml` et `package-lock.json` : CI sur le head exact de PR ou push, dépendances npm figées et empaquetage unique.
- `skills/development/` : cinq guides locaux de développement liés à la révision publique `e6763663` du socle ; distincts du skill conversationnel distribué.
- `scripts/` : préparation et vérification des distributions et de la démo ; `scripts/package.mjs` nomme chaque sortie selon la version du module pour conserver les releases antérieures ; `scripts/sdk-version.mjs` borne les versions SDK et exige l'export public du journal en 1.2.0 ; `scripts/demo.mjs` lie version, reçu, archives, dépendances installées et composition du module sans remplacer l'application persistante d'une autre provenance. `module/generate-manifest.mjs` inclut ces contrôles dans la suite package et l'archive de validation.
- `demo/` : configuration de l'application de démonstration ; son état local n'est pas distribué.
- `README.md`, `prd.md`, `CHANGELOG.md`, `LICENSE` : documentation installée liée à la version.
- `AGENTS.md`, `interview.md`, `TODO.md`, `CONTRIBUTING.md` : instructions, décisions et suivi de développement.
