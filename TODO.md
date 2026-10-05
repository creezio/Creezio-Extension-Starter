# Suivi — première tranche T30

Statuts historiques au 28 septembre 2026 : le SDK 1.1.0 et les modules 0.1.0, 0.1.1 et 0.1.2 ont été publiés. Le module 0.1.3 et le SDK 1.2.0 sont désormais publics ; ce checkout prépare 0.1.4 pour corriger le budget de `attachment.list`. La démo et Lab conservent leur version et leurs données jusqu'à une transition explicite de l'hôte.

| Travail | Responsable | État |
|---|---|---|
| Contrat JSON, modèles et opérations autorisées | Agent backend | Implémenté ; tests ciblés passés |
| Écrans et conservation des états | Agent UI | Implémentés ; parcours admin/app observés sur la démo, boutons dans l'iframe du navigateur intégré non qualifiés |
| Widgets et partie plugin | Agent UI | Deux widgets rendus, sélection et rechargement observés dans la démo ; interactions externes à qualifier séparément |
| SDK autonome et validation détachée du socle | Agent API/SDK | SDK 1.1.0 public épinglé dans CI ; validation du module séparée |
| Instructions, six suites et distribution | Root | Modules 0.1.0 et 0.1.1 publics ; candidate 0.1.2 à qualifier avec sorties versionnées |
| Installation réelle et démo locale indépendante | Root | Candidat Core `5a5d3c9` + Starter `6d682f0` installé et qualifié localement ; adoption d'un paquet final distincte |
| Revue, CI GitHub et publication du starter | Root et relecteurs | Releases `module-v0.1.0` et `module-v0.1.1` publiques ; candidate 0.1.2 à relire avant publication |
| Démo Cloudflare et mise à jour dans le fork | T32/T38 | À faire séparément |

Le catalogue complet, les dépendances interéditeurs de démonstration et la validation budgétaire ne conditionnent pas cette première tranche.

## Transition T32 — SDK 1.1.0 et nouvelle archive Core

Le pin public SDK 1.1.0, la dépendance et le verrou npm du Starter sont adoptés. Pour la démo persistante, il reste à confirmer le SHA et l'intégrité de l'archive Core finale, puis à adopter les trois archives/reçu publics du module 0.1.0 sans les reconstruire. Cette mise à niveau se fait en place après revue du delta source et conservation des données ; aucune commande de préparation ne remplace automatiquement une provenance différente. Publication Cloudflare et recette fonctionnelle de la démo restent distinctes.

## Candidate — module 0.1.2

Vérifier la route `/purchase-requests/new` dans le manifeste, la contribution front et la navigation du SDK public, y compris le refus de l'ancien chemin ambigu avec `/requests/{id}`. Passer les six suites, la revue et le build de provenance depuis un commit propre. Installer ensuite 0.1.2 sur l'hôte de recette en conservant les données ; la démo existante n'est pas modifiée par ce checkout. Enregistrer séparément dans le standard Starter le besoin de détecter les chevauchements entre chemins littéraux et paramétrés.

## Candidate — module 0.1.3

L'adoption du journal SDK 1.2 concerne uniquement les vues workspace/front. Les anciennes commandes incertaines restent consultables par leur statut sans nouveau scope inféré ni replay. Le SDK 1.2 **public** est fixé dans `ci/sdk-pin.json`, `package.json` et `package-lock.json` ; ses octets installés doivent être comparés à l'archive avant packaging. Produire un commit source propre, exécuter les six suites et qualifier l'archive fermée. La recette de mise à jour et de conservation des données de la démo est séparée ; aucun runtime, D1 ou R2 n'est modifié par cette branche.

## Candidate — module 0.1.4

Qualifier la frontière `attachment.list` à 50 pièces et le refus de 51 sans élargir son entrée ni sa pagination. Générer le manifeste et les archives depuis un commit source propre, puis vérifier les six suites et la provenance. L'adoption par Lab est une transition distincte qui préserve ses données et son paquet antérieur jusqu'à qualification.
