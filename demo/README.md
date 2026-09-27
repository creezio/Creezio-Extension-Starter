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

Avant la release SDK, omettre `sdk.url` et passer `--sdk-archive`. Les trois archives/reçu du module proviennent du paquet produit par `node scripts/package.mjs` dans `.creezio/packages/` ; leurs empreintes doivent correspondre au verrou. L’archive SDK n’est jamais copiée dans Git.

La préparation vérifie les octets de l’archive source publique avant extraction, refuse les liens et chemins sortants, réutilise `demo/app/` si sa provenance correspond, installe les archives vérifiées, puis compare les fichiers installés aux tarballs. Elle choisit le module via `source.kind=package` dans la composition de l’application réelle, avec les widgets fiche et sélection, et demande au verrou central son reçu de validation détaché. Le build passe par les commandes du socle. L’état local D1/R2 reste dans cette application ; il n’est ni exporté ni réinitialisé par la préparation.

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
