# Changelog

## En cours — adoption du SDK 1.1.0 public

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
