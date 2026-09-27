# Fichiers

- `module/public-contract.ts` : IDs des huit opérations et types JSON partagés ; `requestKey` appartient à l'idempotence du moteur.
- `module/models.ts` : modèles `request`, `file_metadata`, `request_attachment`, sans SQL ni migration dans le paquet.
- `module/operations.ts` : handlers SDK publics, contrôle de propriétaire/contexte, révision attendue et plans D1/R2.
- `module/generate-manifest.mjs` et `module/manifest.json` : déclaration complète générée avec provenance Git/intégrité réelles.
- `ui/` : vues workspace/front, états de formulaire et composants publics.
- `plugin/` : manifeste, configuration MCP, contribution et skill de lecture des demandes ; les ressources/widgets HTML sont dans `ui/widgets/`.
- `tests/` et `ci/` : six familles de contrôles backend/ui/api-mcp/widgets/package/docs.
- `skills/development/` : cinq guides locaux de développement liés à la révision publique `8736c340` du socle ; distincts du skill conversationnel distribué.
- `scripts/` : préparation et vérification des distributions et de la démo.
- `demo/` : configuration de l'application de démonstration ; son état local n'est pas distribué.
- `README.md`, `prd.md`, `CHANGELOG.md`, `LICENSE` : documentation installée liée à la version.
- `AGENTS.md`, `interview.md`, `TODO.md`, `CONTRIBUTING.md` : instructions, décisions et suivi de développement.
