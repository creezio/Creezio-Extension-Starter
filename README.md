# Creezio Extension Starter

Ce dépôt fournit une extension complète de demandes d'achat : données, opérations, écran workspace/front et plusieurs widgets conversationnels. Il sert de point de départ pour développer un module installable dans une application Creezio. Le module fonctionne avec ou sans chat.

Version publiée du module : **0.1.0**, tag [`module-v0.1.0`](https://github.com/creezio/Creezio-Extension-Starter/releases/tag/module-v0.1.0) depuis le commit `527a1bc1446a529ad6e560e3a25dea13a12001e9`. Les modifications de ce checkout restent distinctes des archives publiques immuables de cette release.

Une demande appartient à son utilisateur et à son contexte. Elle peut être préparée, modifiée, soumise ou retirée, avec un montant proposé et des pièces jointes privées. Soumettre enregistre une demande ; cela ne réalise aucun achat et n'approuve aucune dépense. Les mêmes permissions sont appliquées aux écrans, API, MCP et widgets.

Le contrat métier `creezio.purchase-requests` 0.1.0 fournit huit opérations : `request.create`, `request.list`, `request.get`, `request.update`, `request.submit`, `request.withdraw`, `attachment.link` et `attachment.list`. `request.create` produit un brouillon. La modification et l’ajout de pièce jointe ne sont possibles que sur un brouillon ; la soumission passe de `draft` à `submitted`, puis le retrait de `submitted` à `withdrawn`. Un brouillon n’a pas d’action de retrait ni de suppression dans cette tranche. Les commandes prennent une `requestKey` pour l’idempotence du moteur et les modifications prennent la révision attendue. Cette clé n’est pas stockée dans la fiche métier.

Les huit opérations sont exposées par API et MCP sous les mêmes contrôles serveur. Les widgets utilisent uniquement les outils de lecture `purchase_request_get` et `purchase_request_list` ; aucune action à l’affichage ou dans ces widgets ne soumet une demande.

Les fiches exposent `amountMinor` (entier en unités mineures), `currency` (trois lettres), `revision`, les dates et le statut. Listes et lectures restent limitées au principal et au contexte fournis par l’hôte ; les listes sont paginées par curseur, 50 éléments au plus par page. Les pièces jointes utilisent la catégorie privée `request-attachment` avec `ownerScope: principal` : un même principal peut les retrouver depuis `admin` et `app` lorsque les permissions et le contexte l'autorisent dans chaque audience. `attachment.link` déclare explicitement l'effet d'écriture de cette catégorie, exigé par le port de publication de l'hôte. Le fichier staged est publié et lié à la demande dans le même lot atomique que son changement de révision. Une réponse incertaine se vérifie par le statut de la même clé avant toute réémission.

Le paquet runtime inclut le module, ses interfaces et sa documentation de version. Les tests et instructions de développement forment un artefact de validation séparé. La démo utilise une version fixée du vrai Creezio et installe le paquet comme le ferait une autre application ; elle n'est pas un autre backend du module.

La CI télécharge le SDK 1.1.0 depuis sa [release publique](https://github.com/creezio/Creezio-D1R2/releases/tag/sdk-v1.1.0), fixée dans [`ci/sdk-pin.json`](ci/sdk-pin.json), vérifie son SHA-256 avant `npm ci`, puis exécute une seule fois `scripts/package.mjs`. Cette commande construit le module, vérifie ses contrats et ses six suites, puis produit le paquet runtime et le reçu de validation du commit courant. Le SDK reste une dépendance de développement locale à l'archive vérifiée ; le contrat pair du module reste `^1.0.0`.

Le SDK 1.1.0 public exporte `@creezio/sdk/delivery/context` et `@creezio/sdk/delivery/transport`. Le pin, la dépendance `file:` et le verrou npm du Starter sélectionnent les mêmes octets vérifiés (`sha256-f874f0ed29a41ec45b8f686884b5e2260b9600d9045588174fff8a7fcdd5eeec`). Le module métier 0.1.0 et son contrat pair `^1.0.0` ne changent pas ; l'application persistante de démonstration demande une transition Core/SDK distincte.

Pour reproduire ce parcours dans un checkout propre sous PowerShell, exécuter `node ci/bootstrap-sdk.mjs`, puis `npm ci --ignore-scripts --no-audit --no-fund`, définir `$env:CREEZIO_SDK_TARBALL='.creezio/ci/creezio-sdk-1.1.0.tgz'` et lancer `node scripts/package.mjs`. La dernière commande exige un commit source propre afin de lier le manifeste et les archives à son SHA exact. Elle ne doit pas remplacer les archives déjà publiées de 0.1.0.

La démo exige en plus un verrou Core/SDK réel décrivant la nouvelle archive ; son application persistante actuelle n'est pas mise à niveau par la seule adoption du SDK dans ce dépôt.

Voir le [PRD](prd.md) et le [journal de version](CHANGELOG.md). Le dépôt source contient aussi les décisions, le suivi et les instructions de contribution réservés au développement.
