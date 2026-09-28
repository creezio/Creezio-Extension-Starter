# Creezio Extension Starter

Ce dépôt fournit une extension complète de demandes d'achat : données, opérations, écran workspace/front et plusieurs widgets conversationnels. Il sert de point de départ pour développer un module installable dans une application Creezio. Le module fonctionne avec ou sans chat.

Versions publiées du module : **0.1.0**, **0.1.1** et **0.1.2**, sous leurs tags `module-v0.1.x`. Les modifications de ce checkout restent distinctes de leurs archives publiques immuables.

Ce checkout prépare **0.1.3** : les vues workspace/front conservent une nouvelle commande incertaine dans le journal public du SDK 1.2, avec sauvegarde de la clé avant l'envoi et vérification du statut sans replay. Les anciens panneaux 0.1.2 gardent leur pointeur de statut jusqu'au résultat confirmé. La route front `/purchase-requests/new` et le métier ne changent pas. La démo persistante reste épinglée à sa version installée.

Une demande appartient à son utilisateur et à son contexte. Elle peut être préparée, modifiée, soumise ou retirée, avec un montant proposé et des pièces jointes privées. Soumettre enregistre une demande ; cela ne réalise aucun achat et n'approuve aucune dépense. Les mêmes permissions sont appliquées aux écrans, API, MCP et widgets.

Le contrat métier `creezio.purchase-requests` 0.1.3 conserve les huit opérations de 0.1.0 : `request.create`, `request.list`, `request.get`, `request.update`, `request.submit`, `request.withdraw`, `attachment.link` et `attachment.list`. `request.create` produit un brouillon. La modification et l’ajout de pièce jointe ne sont possibles que sur un brouillon ; la soumission passe de `draft` à `submitted`, puis le retrait de `submitted` à `withdrawn`. Un brouillon n’a pas d’action de retrait ni de suppression dans cette tranche. Les commandes prennent une `requestKey` pour l’idempotence du moteur et les modifications prennent la révision attendue. Cette clé n’est pas stockée dans la fiche métier.

Les huit opérations sont exposées par API et MCP sous les mêmes contrôles serveur. Les widgets utilisent uniquement les outils de lecture `purchase_request_get` et `purchase_request_list` ; aucune action à l’affichage ou dans ces widgets ne soumet une demande.

Les fiches exposent `amountMinor` (entier en unités mineures), `currency` (trois lettres), `revision`, les dates et le statut. Listes et lectures restent limitées au principal et au contexte fournis par l’hôte ; les listes sont paginées par curseur, 50 éléments au plus par page. Les pièces jointes utilisent la catégorie privée `request-attachment` avec `ownerScope: principal` : un même principal peut les retrouver depuis `admin` et `app` lorsque les permissions et le contexte l'autorisent dans chaque audience. `attachment.link` déclare explicitement l'effet d'écriture de cette catégorie, exigé par le port de publication de l'hôte. Le fichier staged est publié et lié à la demande dans le même lot atomique que son changement de révision. Une réponse incertaine se vérifie par le statut de la même clé avant toute réémission.

Le paquet runtime inclut le module, ses interfaces et sa documentation de version. Les tests et instructions de développement forment un artefact de validation séparé. La démo utilise une version fixée du vrai Creezio et installe le paquet comme le ferait une autre application ; elle n'est pas un autre backend du module.

La candidate 0.1.3 exige le SDK 1.2 pour `@creezio/sdk/operations/command-journal` ; son pin public, sa dépendance de développement, son verrou et sa CI fixent maintenant l'archive [sdk-v1.2.0](https://github.com/creezio/Creezio-D1R2/releases/tag/sdk-v1.2.0), SHA-256 `34eb5e1a8ff5b2937cdc9e8fe0a41697705208e708f85a90e0308802b430eda8`. Le contrat pair de 0.1.3 est `^1.2.0`.

La CI télécharge le SDK 1.2.0 selon [`ci/sdk-pin.json`](ci/sdk-pin.json), vérifie son SHA-256 avant `npm ci`, puis exécute une seule fois `scripts/package.mjs`. Cette commande construit le module, vérifie ses contrats et ses six suites, puis produit le paquet runtime et le reçu de validation du commit courant. Le SDK reste une dépendance de développement locale à l'archive vérifiée.

Le SDK 1.2.0 public exporte le journal de commande en plus des ports de livraison. Le pin, la dépendance `file:` et le verrou npm du Starter sélectionnent les mêmes octets vérifiés. La version publiée 0.1.2 demeure disponible avec son ancien contrat SDK.

Pour reproduire ce parcours dans un checkout propre sous PowerShell, exécuter `node ci/bootstrap-sdk.mjs`, puis `npm ci --ignore-scripts --no-audit --no-fund`, définir `$env:CREEZIO_SDK_TARBALL='.creezio/ci/creezio-sdk-1.2.0.tgz'` et lancer `node scripts/package.mjs`. La dernière commande exige un commit source propre afin de lier le manifeste et les archives à son SHA exact. Pour 0.1.3, elle produit `creezio-purchase-requests-0.1.3.tgz`, `creezio-purchase-requests-0.1.3-validation.tgz`, `manifest-0.1.3.json` et `SHA512SUMS-0.1.3` sans remplacer les fichiers des versions précédentes.

Les tests locaux de la candidate ne valent pas une recette de mise à jour de l'application. Lab et sa version installée sur SDK 1.1 conservent 0.1.2 jusqu'à une évolution distincte de l'hôte.

La démo exige en plus un verrou Core/SDK réel décrivant la nouvelle archive ; son application persistante actuelle n'est pas mise à niveau par la seule adoption du SDK dans ce dépôt.

Voir le [PRD](prd.md) et le [journal de version](CHANGELOG.md). Le dépôt source contient aussi les décisions, le suivi et les instructions de contribution réservés au développement.
