---
name: create-module
description: Créer ou modifier le module de demandes d'achat du starter, son contrat complet et ses six suites.
---

# Créer ou modifier le module

Lire [AGENTS.md](../../../AGENTS.md), [prd.md](../../../prd.md), [module/public-contract.ts](../../../module/public-contract.ts) et le [standard public de module fixé à `8736c340`](https://github.com/creezio/Creezio-D1R2/blob/8736c3407981c29acd637a86b669c8f72fc09b10/docs/STANDARD-MODULE.md). Vérifier le périmètre T30 avant d'ajouter une fonction : la demande d'achat ne paie, ne commande et n'approuve rien.

Déclarer ensemble modèles, fichiers, permissions, opérations, API/MCP, vues et widgets dans `module/generate-manifest.mjs`. Les implémentations restent dans le module et importent le SDK distribué. Une même opération sert les canaux autorisés ; le plugin ne recrée ni backend ni données. Vérifier que l'inventaire runtime contient seulement le JS et les déclarations compilés, assets, plugin et documentation installée ; les sources TS, tests, scripts et guides de développement vont dans l'artefact de validation.

Mettre à jour les documents affectés et les six suites pertinentes. Une nouvelle capacité n'est complète qu'après vérification de son contrat, de son archive réelle et de son installation indépendante. L'évolution D1 est préparée par la chaîne centrale de Creezio : aucun script de migration ne vit dans ce module.
