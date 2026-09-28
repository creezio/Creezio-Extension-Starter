# Suivi — première tranche T30

Statuts factuels au 28 septembre 2026. Le SDK 1.1.0 est public depuis Core `f8dc03c` et le module 0.1.0 depuis Starter `527a1bc`. La démo indépendante contient encore le candidat Starter `6d682f0` sur Core `5a5d3c9` et conserve ses données ; l'adoption des archives publiques exige une transition en place distincte.

| Travail | Responsable | État |
|---|---|---|
| Contrat JSON, modèles et opérations autorisées | Agent backend | Implémenté ; tests ciblés passés |
| Écrans et conservation des états | Agent UI | Implémentés ; parcours admin/app observés sur la démo, boutons dans l'iframe du navigateur intégré non qualifiés |
| Widgets et partie plugin | Agent UI | Deux widgets rendus, sélection et rechargement observés dans la démo ; interactions externes à qualifier séparément |
| SDK autonome et validation détachée du socle | Agent API/SDK | SDK 1.1.0 public épinglé dans CI ; validation du module séparée |
| Instructions, six suites et distribution | Root | Module 0.1.0 public depuis `527a1bc` ; branche d'adoption SDK 1.1.0 à qualifier sans remplacer cette release |
| Installation réelle et démo locale indépendante | Root | Candidat Core `5a5d3c9` + Starter `6d682f0` installé et qualifié localement ; adoption d'un paquet final distincte |
| Revue, CI GitHub et publication du starter | Root et relecteurs | Release `module-v0.1.0` publique ; revue et CI de l'adoption SDK 1.1.0 distinctes |
| Démo Cloudflare et mise à jour dans le fork | T32/T38 | À faire séparément |

Le catalogue complet, les dépendances interéditeurs de démonstration et la validation budgétaire ne conditionnent pas cette première tranche.

## Transition T32 — SDK 1.1.0 et nouvelle archive Core

Le pin public SDK 1.1.0, la dépendance et le verrou npm du Starter sont adoptés ; les six suites et la CI de cette branche restent à qualifier. Pour la démo persistante, il reste à confirmer le SHA et l'intégrité de l'archive Core finale, puis à adopter les trois archives/reçu publics du module 0.1.0 sans les reconstruire. Cette mise à niveau se fait en place après revue du delta source et conservation des données ; aucune commande de préparation ne remplace automatiquement une provenance différente. Publication Cloudflare et recette fonctionnelle de la démo restent distinctes.
