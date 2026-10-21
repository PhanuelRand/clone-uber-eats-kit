# 0002 : Un montant est un entier en ariary, frais compris

- Date : 2026-10-13
- Statut : Accepté, par l'Académie

## Le problème

Une commande additionne des prix, ajoute des frais de livraison, puis des frais
de service calculés en pourcentage. Chaque calcul est une occasion de perdre ou
d'inventer quelques ariary, et le client, le restaurant et le livreur doivent
tous lire le même total.

## La décision

**Tout montant est un entier, en ariary**, qui n'a pas de centimes :
12 000 Ar se stockent `12000`. Les colonnes sont de type `integer` ou `bigint`,
jamais `numeric`, `real` ni `money`.

Une commande se calcule toujours de la même façon :

| Montant | Calcul |
| --- | --- |
| Sous-total | la somme des lignes : prix unitaire × quantité |
| Frais de livraison | selon la distance (module 8) : 2 000 Ar jusqu'à 3 km, puis 500 Ar par kilomètre entamé |
| Frais de service | 5 % du sous-total, **arrondis à l'ariary inférieur** |
| Total | sous-total + frais de livraison + frais de service |

Le pourcentage se calcule en entiers : `Math.floor(sousTotal * 5 / 100)`, sans
passer par `0.05`.

**Une ligne de commande garde son propre prix unitaire**, copié au moment de la
commande. Le prix d'un plat peut changer demain; ce que le client a payé hier
ne change pas.

## Ce que ça coûte

Une colonne de prix dans la table des plats, une autre dans les lignes de
commande, qui semblent faire double emploi. Elles ne disent pas la même chose :
le prix d'aujourd'hui, et le prix de cette commande-là.

## Ce qui a été écarté

**Un nombre à virgule.** `0.1 + 0.2` ne vaut pas `0.3` en virgule flottante, et
`14500 * 0.07` vaut `1015.0000000000001`. Une somme d'argent ne tolère aucune
approximation.

**Recalculer la commande à partir de la carte du jour.** Un client qui relit sa
commande de la semaine dernière y verrait les prix de cette semaine.

**Croire le prix envoyé par le navigateur.** N'importe qui peut modifier une
demande avant de l'envoyer. Le serveur relit les prix dans sa base, et
recalcule tout.
