# Contribuer

Toute évolution se rattache à un besoin et à une tâche. Créer une branche courte `module/purchase-requests/<travail>` depuis le main vérifié, réaliser code, documentation et tests concernés, puis proposer une PR. Les corrections d'une branche publiée utilisent de nouveaux commits ; pas de push forcé ni direct sur main. La revue technique porte sur le commit final et ses preuves. L'intégration utilise un squash GitHub, puis le nouveau main est vérifié avant distribution.

Le module et l'hôte utilisent les mêmes opérations, droits et modèles dans tous les hébergements. Un composant interne au CMS ne devient pas public parce qu'un import relatif fonctionne localement. Utiliser le SDK, déclarer les dépendances et les contributions, et proposer les capacités communes manquantes au socle.

Maintenir PRD, décisions, TODO, changelog et FILES selon l'impact réel. Chaque famille de contrôles doit exécuter ses cas applicables. Une limite ou recette non réalisée reste visible ; un test ignoré ne remplace pas une preuve. Les protections du dépôt et la disponibilité de la CI seront contrôlées à la création du dépôt distant, sans présumer leur héritage.
