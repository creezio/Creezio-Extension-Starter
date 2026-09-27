---
name: data-and-permissions
description: Modifier les modèles, opérations ou fichiers de demandes d'achat en conservant portée serveur, idempotence et lot D1/R2.
---

# Données et permissions

Lire [AGENTS.md](../../../AGENTS.md), les [modèles](../../../module/models.ts), les [opérations](../../../module/operations.ts) et le [guide public fixé à `8736c340`](https://github.com/creezio/Creezio-D1R2/blob/8736c3407981c29acd637a86b669c8f72fc09b10/skills/development/data-and-permissions/SKILL.md).

La demande et son lien de fichier portent `context_id` et `owner_id` issus de l'hôte. Le DataPort d'un modèle `scope:context` ajoute et filtre `context_id` lui-même ; le handler ne le fournit pas dans `values`, `key`, `where` ou `after`. Un `id` ou curseur client ne donne jamais accès à un autre propriétaire. Les listes utilisent les index déclarés, un tri stable et une limite de 50. Les commandes utilisent la `requestKey` que le moteur journalise ; modifier, soumettre, retirer ou lier un fichier exige la révision exacte. Le retrait part de `submitted`, jamais d'un brouillon. Une lecture ou un rendu ne produit aucun plan d'écriture.

Pour `attachment.link`, vérifier la référence staged avec le port fichiers, puis réunir publication, garde de la demande, lien et changement de révision dans un seul lot de plans. Aucun identifiant R2, SQL, credential ou outil de migration ne rejoint l'entrée publique. Tester refus inter-principal/inter-contexte, état invalide, révision périmée et réponse de mutation incertaine ; ne jamais déduire d'un timeout que l'effet n'a pas eu lieu.
