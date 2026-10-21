# 0006 : Un instant se range en UTC, les horaires se lisent à Madagascar

- Date : 2026-10-13
- Statut : Accepté, par l'Académie

## Le problème

Un restaurant d'Antananarivo ouvre à 11 h 00, heure de Madagascar. Votre
serveur tournera peut-être en Europe ou aux États-Unis, et l'heure de son
horloge n'est pas celle du restaurant. Un serveur qui compare « 11 h 00 » à son
heure à lui ouvrirait le restaurant trois heures trop tôt, ou trop tard.

La nuit pose un second problème : une gargote ouverte le vendredi de 18 h 00 à
2 h 00 du matin est encore ouverte le samedi à 1 h 30.

## La décision

**Un instant se range dans une colonne `timestamptz`**, qui garde un point
précis dans le temps, quel que soit le fuseau du serveur : le moment d'une
commande, d'un paiement, d'une livraison.

**Un horaire d'ouverture est une heure locale, de type `time`.** « 11 h 00 au
restaurant », sans fuseau, parce que c'est ainsi que le restaurateur le pense.

**On compare en ramenant l'instant à l'heure de Madagascar**, le fuseau
`Indian/Antananarivo`, soit UTC+3, sans heure d'été.

Un créneau a un jour, une heure d'ouverture et une heure de fermeture :

- les jours sont numérotés comme dans la norme ISO, de 1 pour le lundi à 7
  pour le dimanche;
- l'heure de fermeture n'est pas comprise : ouvert de 11 h 00 à 14 h 00,
  fermé à 14 h 00 pile;
- `24:00` désigne la fin de la journée;
- un créneau dont la fermeture vient avant l'ouverture passe minuit : le
  vendredi de 18 h 00 à 02 h 00 couvre la nuit du vendredi au samedi.

L'instant présent est passé en paramètre au lieu d'être lu sur l'horloge, pour
qu'un lundi midi se vérifie sans attendre lundi midi.

## Ce que ça coûte

Il faut convertir avant de comparer, et ne jamais découper un instant avec
`toISOString()`, qui donne la date et l'heure en UTC : la veille, entre minuit
et 3 heures du matin à Madagascar.

Un créneau qui passe minuit demande deux comparaisons : la fin de soirée le
jour du créneau, et le début de nuit le lendemain.

## Ce qui a été écarté

**Ranger les horaires en `timestamptz`.** Un horaire revient chaque semaine;
un instant n'arrive qu'une fois.

**Couper un créneau de nuit en deux créneaux** (vendredi 18 h 00 à 24 h 00,
samedi 00 h 00 à 02 h 00). Juste pour la recherche, mais le restaurateur ne
pense pas ainsi, et l'écran des horaires devient illisible.
