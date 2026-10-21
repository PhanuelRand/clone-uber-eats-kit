# 0007 : Un numéro de téléphone se range sous une seule forme

- Date : 2026-10-13
- Statut : Accepté, par l'Académie

## Le problème

Le même numéro s'écrit de dix façons : `034 12 345 67`, `0341234567`,
`+261 34 12 345 67`, `261-34-12-345-67`. Rangé tel quel, il ne se compare plus :
la base croit tenir deux comptes différents, et un livreur suspendu revient avec
le même numéro écrit autrement.

## La décision

**Un numéro se range sous la forme internationale, `+261` suivi des neuf
chiffres, sans espace** : `+261341234567`. Le serveur la calcule à
l'inscription, quelle que soit la saisie, et refuse un numéro qu'il ne sait pas
ramener à cette forme.

Le parcours accepte les numéros de téléphone mobile de Madagascar, ceux qui
commencent par 032, 033, 034, 037 ou 038. Le numéro est facultatif, et il n'est
jamais montré à un autre compte : ni au restaurant, ni au livreur. Le client et
le livreur se parlent par la messagerie de l'application, et la remise se fait
avec un code à quatre chiffres.

## Ce que ça coûte

Une fonction de plus, testée sur tous les formats qu'on rencontre. Et une
personne qui tape un numéro étranger reçoit un refus.

## Ce qui a été écarté

**Ranger la saisie telle quelle, et nettoyer à l'affichage.** Chaque requête
qui compare deux numéros devrait alors refaire le nettoyage, et une seule
oubliée suffit à laisser passer un doublon.

**Donner le numéro du client au livreur.** Plus simple pour trouver une porte,
mais le livreur garde ensuite le numéro de chaque personne qu'il a livrée.
