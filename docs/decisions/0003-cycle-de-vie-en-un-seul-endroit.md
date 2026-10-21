# 0003 : Un seul endroit décide des passages

- Date : 2026-10-13
- Statut : Accepté, par l'Académie

## Le problème

Une commande traverse plusieurs situations : en attente de paiement, envoyée
au restaurant, acceptée, prête, récupérée par le livreur, livrée, ou refusée,
ou annulée. Si plusieurs fichiers se permettent de changer cette situation,
chacun applique sa propre lecture des règles.

On voit alors un client qui annule une commande déjà en cuisine, ou un livreur
qui « récupère » un repas que personne n'a encore préparé, sans pouvoir dire
quel fichier en est la cause.

## La décision

**Les passages autorisés sont décrits dans un seul objet, et une seule méthode
les applique.** Elle lève une erreur quand le passage demandé n'est pas permis.
Aucun autre code ne modifie le statut d'une commande.

| Depuis | Vers |
| --- | --- |
| `PENDING_PAYMENT` | `PLACED`, `CANCELLED` |
| `PLACED` | `ACCEPTED`, `REJECTED`, `CANCELLED` |
| `ACCEPTED` | `READY` |
| `READY` | `PICKED_UP` |
| `PICKED_UP` | `DELIVERED` |
| `DELIVERED`, `REJECTED`, `CANCELLED` | aucun |

Une fois acceptée, une commande ne s'annule plus : la cuisine a commencé.

## Ce que ça coûte

Un détour : un service qui veut marquer une commande prête ne peut pas écrire
le nouveau statut directement, il doit passer par cette méthode.

## Ce qui a été écarté

**Un `if` à chaque endroit qui change l'état.** C'est plus rapide à écrire les
trois premières fois. Au dixième, plus personne ne sait quelles règles
s'appliquent réellement, et les corriger demande de toutes les retrouver.
