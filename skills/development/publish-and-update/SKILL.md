---
name: publish-and-update
description: Préparer une release du module et son adoption explicite par une application Creezio sans réinitialiser les données.
---

# Publication et mise à jour

Lire [AGENTS.md](../../../AGENTS.md), [prd.md](../../../prd.md), le [guide public de publication fixé à `e6763663`](https://github.com/creezio/Creezio-D1R2/blob/e67636635a526daa544ea3573b271e1822f3f4fe/skills/development/publish-and-update/SKILL.md) et les preuves propres au candidat. La source propre, les six suites, le SDK distribué, les archives et le paquet installé dans une application sont des vérifications distinctes. Un manifeste ou une CI verte ne publie pas le module.

Préparer l'origine, les versions et intégrités des archives, puis examiner le plan d'installation ou d'évolution centrale D1/R2. Une mise à jour conserve demandes, comptes et fichiers ; tout changement incompatible ou destructif bloque jusqu'à résolution explicite. Une application adopte sa version sélectionnée ; ne pas modifier un Site, un fork ou une composition d'un tiers par le seul fait qu'une release existe. Conserver le runtime précédent nécessaire au retour arrière.

La démo, le plugin ChatGPT et les cibles Sites/Cloudflare exigent leurs recettes réelles propres. Annoncer précisément ce qui est publié, installé et vérifié, avec SHA et limites ; ne pas déduire une publication de la seule présence des sources.
