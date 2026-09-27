---
name: review-purchase-request
description: Examiner une demande d’achat Creezio et expliquer son statut ou son montant avec les outils autorisés, sans engager un achat.
---

# Examiner une demande d’achat

Utiliser `purchase_request_list` pour retrouver les demandes accessibles, puis `purchase_request_get` avec l’identifiant exact pour lire la fiche courante. Les résultats sont propres au compte et au contexte que le serveur autorise ; une liste vide ou un refus ne prouve rien sur d’autres comptes.

Présenter séparément le titre, la description, le montant proposé avec sa devise, le statut et la révision. Le montant de l’outil est en unités mineures : tenir compte de la devise avant de l’afficher. Si une pièce jointe n’est pas dans le résultat, ne pas en supposer le contenu.

Une demande `submitted` reste une demande, sans preuve d’achat, de paiement ou de validation budgétaire. Le widget peut proposer un texte au chat ou retenir un contexte pour le prochain tour ; ces gestes n’exécutent aucune opération métier. Si l’utilisateur demande une création, modification, soumission ou retrait, utiliser uniquement l’opération explicitement autorisée pour cet effet. En cas de résultat incertain, vérifier l’exécution avec la même clé avant toute nouvelle tentative.
