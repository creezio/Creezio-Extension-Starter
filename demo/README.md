# Démo avec une vraie application Creezio

`node scripts/demo.mjs prepare` prépare une seule application persistante dans `demo/app/`. Le script exige `demo/source-lock.json`, produit au gel de la révision publique du socle. Pour qualifier un candidat avant sa release, fournir `--source-lock` avec un chemin absolu vers un JSON réel hors du dépôt et `--sdk-archive` avec le chemin absolu de l’archive SDK construite. `CREEZIO_SDK_TARBALL` peut remplacer ce dernier argument. Aucun champ de provenance ne doit être inventé pour faire passer la commande.

Le verrou source a ce format :

```json
{
  "schemaVersion": 1,
  "core": {
    "repository": "https://github.com/creezio/Creezio-D1R2",
    "revision": "<SHA Git complet réel>",
    "url": "https://codeload.github.com/creezio/Creezio-D1R2/tar.gz/<même SHA>",
    "integrity": "sha256-<digest réel de cette archive>"
  },
  "sdk": {
    "version": "<1.0.0, 1.1.0 ou 1.2.0 selon la release réelle>",
    "url": "<URL réelle de l’archive GitHub Release, après publication>",
    "integrity": "sha256-<digest réel de l’archive SDK>"
  },
  "module": {
    "runtimeIntegrity": "sha256-<digest du paquet runtime>",
    "validationIntegrity": "sha256-<digest de la validation détachée>",
    "receiptIntegrity": "sha256-<digest du reçu manifest.json>"
  }
}
```

Pour qualifier un SDK candidat non publié, omettre `sdk.url` et passer `--sdk-archive`. Les SDK 1.1.0 et 1.2.0 sont publics ; leur URL de release doit correspondre à la version et à l'empreinte vérifiées dans le verrou. Les archives runtime, validation et reçu publics du module 0.1.0 dans `.creezio/packages/` proviennent de `module-v0.1.0` ; leur adoption ne les reconstruit pas. Leurs empreintes doivent correspondre au verrou. L’archive SDK n’est jamais copiée dans Git.

La version SDK du verrou détermine exactement le nom `creezio-sdk-<version>.tgz`, la dépendance npm locale et la version attendue dans le paquet installé. Les anciens verrous T30 sans ce champ ne sont acceptés qu'avec une archive locale dont le manifeste prouve `1.0.0` ; une URL de release sans version explicite est refusée. Pour 1.1.0 et 1.2.0, le paquet doit exposer `delivery/context` et `delivery/transport` ; 1.2.0 doit aussi exposer `operations/command-journal`. La composition de l'archive Core doit déclarer cette même version. Renseigner le SHA public final du Core et le SHA-256 de son archive après intégration ; la révision de la PR n'est pas automatiquement celle de `main`. Une application `demo/app/` déjà épinglée à une autre révision est refusée et doit suivre une transition en place revue séparément, qui conserve ses D1/R2 et ses fichiers.

La préparation vérifie les octets de l’archive source publique avant extraction, refuse les liens et chemins sortants, réutilise `demo/app/` si sa provenance correspond, installe les archives vérifiées, puis compare les fichiers installés aux tarballs. Elle choisit le module via `source.kind=package` dans la composition de l’application réelle, avec les widgets fiche et sélection, et demande au verrou central son reçu de validation détaché. Le build passe par les commandes du socle. L’état local D1/R2 reste dans cette application ; il n’est ni exporté ni réinitialisé par la préparation.

Dans `demo/app/` uniquement, la préparation remplace la déclaration npm du workspace SDK par deux dépendances `file:` relatives vers les archives SDK et module vérifiées. Le verrou npm de cette application fixe leurs intégrités et le SDK installé doit être un répertoire ordinaire dont les fichiers correspondent octet pour octet à son tarball. Après une installation interrompue, la préparation réutilise les dépendances déjà présentes et répare l’installation sans répéter `npm ci` ; une reprise validée relit le verrou et les fichiers installés avant le build.

Après `prepare`, ouvrir un terminal PowerShell dans `demo/app/` et conserver la même sélection pour l’installation, le build et le démarrage :

```powershell
$env:CREEZIO_COMPOSITION='configuration/composition.t30-demo.json'
$env:CREEZIO_COMPOSITION_LOCK='configuration/composition.t30-demo.lock.json'
npm run access:inspect
npm run access:install
npm start
```

`access:install` demande interactivement le premier compte et applique le schéma D1 composé central avant le bootstrap natif. Il ne préconfigure aucun droit métier : attribuer ensuite les permissions du module au principal et à l’audience voulus depuis l’administration native des accès. `npm start` utilise la D1 et le R2 locaux persistants de cette seule application et le relais statique des widgets.

La création du compte est une opération distincte et interactive, sans identifiants prédéfinis. La recette fonctionnelle doit d’abord vérifier l’initialisation du schéma D1 composé par l’installateur officiel de Creezio, puis tester workspace, front, API, MCP, pièces jointes R2 et les deux widgets avec de vrais droits. Un build réussi ou la seule présence du paquet ne prouve pas ces parcours. Ne pas démarrer le serveur ou publier cette démo avant d’avoir vérifié l’état D1 et les droits de l’application.

Si `demo/app/` existe avec une autre provenance ou sans marqueur, la commande s’arrête pour conserver cette application. Un verrou local actif bloque aussi la préparation. Examiner l’état avant toute reprise ; ne pas supprimer la base ou les fichiers R2 pour résoudre un échec d’installation.
