# Changelog

## 0.1.3 — candidate, non publiée

- Les vues workspace et front réutilisent le journal public du SDK 1.2 pour persister la clé d'une nouvelle commande avant son envoi, consulter un résultat incertain par statut et ne jamais rejouer la commande automatiquement.
- Les panneaux 0.1.2 qui portent une ancienne commande incertaine restent consultables par leur pointeur de statut existant. Ils bloquent tout nouvel envoi jusqu'à confirmation ; aucune identité de session n'est déduite de leur seul contenu.
- Les brouillons, onglets et pièces jointes restent liés au panneau et au scope vérifiés ; une réponse tardive d'un ancien scope ne remplace pas la fiche courante.
- Le schéma de sortie précise qu'`amountMinor=12345` avec `EUR` représente 123,45 EUR. Cette annotation ne qualifie pas à elle seule la prose du chat interne.
- Le pin, le verrou npm et la CI fixent l'archive publique SDK 1.2.0 à son SHA-256 vérifié. Aucun paquet 0.1.3 n'est publié par ce candidat.

## 0.1.2 — publiée

- La vue de création front passe de `/requests/new` à `/purchase-requests/new` pour éliminer le chevauchement avec `/requests/{id}`.
- Un test de navigation par le composant public `Workspace` du SDK constate l'ambiguïté de l'ancien chemin et valide le nouveau chemin et la fiche.
- Les huit opérations, les modèles et le contrat pair SDK restent identiques ; les sorties de packaging sont nommées 0.1.2.

## 0.1.1 — publié le 28 septembre 2026

- Version de module et de plugin préparée pour tester la mise à jour individuelle depuis 0.1.0, sans nouvelle opération ni changement de modèle métier.
- Les sorties de packaging prennent toutes un nom lié à la version : archives runtime/validation, reçu et sommes SHA-512. Les fichiers publics de 0.1.0 conservent leurs noms et octets.
- La démo persistante reste fixée aux archives publiques 0.1.0 jusqu'à sa transition explicite.
- Le pin CI, la dépendance npm et le workflow sélectionnent le SDK public `sdk-v1.1.0` depuis Core `f8dc03c6076109479ad87facedc55234a343dcc4`, SHA-256 `f874f0ed29a41ec45b8f686884b5e2260b9600d9045588174fff8a7fcdd5eeec`.
- Les scripts de build, packaging, bootstrap CI et démo vérifient les exports `delivery/context` et `delivery/transport`, l'identité du tarball et la version de la composition Core. Le contrat pair `^1.0.0` reste compatible ; les archives publiques du module 0.1.0 et l'application persistante de démo ne sont pas remplacées par cette adoption.

## 0.1.0 — publié le 27 septembre 2026

- Première extension de demandes d'achat avec données privées, pièces jointes et opérations communes aux interfaces et MCP.
- Vue workspace/front et plusieurs widgets du même module.
- Paquet installable et validation détachée publiés depuis `527a1bc1446a529ad6e560e3a25dea13a12001e9` ; démonstration locale qualifiée sur un candidat antérieur, publication Cloudflare distincte encore ouverte.
- Pièces jointes du même propriétaire partagées entre workspace et front sous les droits de chaque audience ; installation réelle des archives SDK et module dans la démo.
- `attachment.link` déclare l'effet d'écriture du fichier privé exigé par le port de publication de l'hôte ; une régression couvre les effets exacts des huit opérations.
- La CI de cette release a installé le SDK 1.0.0 depuis une archive publique épinglée par SHA-256, puis construit, testé et préparé les deux archives du module depuis le commit exact.

Le tag `module-v0.1.0` et ses archives publiques restent inchangés pendant les travaux ultérieurs.
