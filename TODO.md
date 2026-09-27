# Suivi — première tranche T30

Statuts factuels au 27 septembre 2026. Le SDK 1.0.0 est publié depuis le commit Core `e6763663`. La démo indépendante a installé le candidat Starter `6d682f0` sur Core `5a5d3c9` et conservé ses données ; le paquet Starter d'un commit ultérieur exige son propre reçu et son adoption explicite.

| Travail | Responsable | État |
|---|---|---|
| Contrat JSON, modèles et opérations autorisées | Agent backend | Implémenté ; tests ciblés passés |
| Écrans et conservation des états | Agent UI | Implémentés ; parcours admin/app observés sur la démo, boutons dans l'iframe du navigateur intégré non qualifiés |
| Widgets et partie plugin | Agent UI | Deux widgets rendus, sélection et rechargement observés dans la démo ; interactions externes à qualifier séparément |
| SDK autonome et validation détachée du socle | Agent API/SDK | SDK 1.0.0 publié, archive publique épinglée et validation du module séparée |
| Instructions, six suites et distribution | Root | Packaging du commit CI `954a041` passé sur l'archive SDK publique ; reçu à renouveler après ce commit documentaire |
| Installation réelle et démo locale indépendante | Root | Candidat Core `5a5d3c9` + Starter `6d682f0` installé et qualifié localement ; adoption d'un paquet final distincte |
| Revue, CI GitHub et publication du starter | Root et relecteurs | CI PR/push verte sur `954a041` ; revue indépendante, ready, fusion et publication du module restantes |
| Démo Cloudflare et mise à jour dans le fork | T32/T38 | À faire séparément |

Le catalogue complet, les dépendances interéditeurs de démonstration et la validation budgétaire ne conditionnent pas cette première tranche.
