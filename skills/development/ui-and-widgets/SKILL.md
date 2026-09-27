---
name: ui-and-widgets
description: Développer les vues workspace/front et widgets MCP Apps du starter depuis les opérations publiques du module.
---

# Vues et widgets

Lire [AGENTS.md](../../../AGENTS.md), le [contrat public](../../../module/public-contract.ts) et le [guide public des widgets fixé à `8736c340`](https://github.com/creezio/Creezio-D1R2/blob/8736c3407981c29acd637a86b669c8f72fc09b10/docs/INTERACTIONS-WIDGETS.md). Les vues consomment `@creezio/sdk/workspace`, `@creezio/sdk/ui`, `@creezio/sdk/operations/client` et `@creezio/sdk/files/client`, sans contexte privé d'hôte. La même contribution fonctionne sur workspace et front avec les droits de l'audience effective. Préserver brouillon, révision, panneau actif et clé d'une commande incertaine ; ne pas remplacer une saisie par une réponse ancienne.

Les ressources `request-card` et `request-picker` utilisent le pont officiel MCP Apps. L'affichage n'appelle pas une opération. Les boutons directs ne lancent que `purchase_request_get` ou `purchase_request_list` ; les autres commandes MCP ne sont pas des actions widget. Un message est d'abord proposé puis envoyé volontairement, sans retry automatique après issue inconnue. Le contexte transmis contient seulement `{id,title,revision}`, se retire explicitement et ne lance ni tour IA ni mutation métier.

Vérifier rendu, refus au clic, changement de sélection, longues descriptions, hôte sans capacité, rechargement et ancienne fiche. Une recette locale n'établit pas à elle seule la compatibilité ChatGPT ; qualifier séparément l'hôte externe avant de l'annoncer.
