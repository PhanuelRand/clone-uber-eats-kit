# 0001 : Une liste fixe de cuisines, une carte en rubriques

- Date : 2026-10-13
- Statut : Accepté, par l'Académie

## Le problème

Un client affamé cherche « une pizza » ou « quelque chose de malgache », pas un
nom de restaurant. Si chaque restaurateur écrit sa cuisine à sa façon,
« Malgache », « cuisine malagasy », « plats du pays », la recherche par cuisine
ne retrouve plus rien.

À l'intérieur d'un restaurant, le problème est inverse : chaque carte a ses
propres rubriques, « Entrées », « Soupes », « Spécialités du chef », et aucune
liste commune ne peut les prévoir.

## La décision

**La cuisine d'un restaurant se choisit dans une liste fixe**, rangée dans une
table et remplie par une migration. Chaque cuisine a un identifiant court et
lisible, le *slug*. Les vérifications emploient ceux-ci :

| Slug | Nom affiché |
| --- | --- |
| `malgache` | Malgache |
| `pizza` | Pizza |
| `burger` | Burgers |
| `asiatique` | Asiatique |
| `grillades` | Grillades |
| `patisserie` | Pâtisserie |
| `snack` | Snack |
| `vegetarien` | Végétarien |

Vous pouvez en ajouter d'autres, à condition de garder celles-ci.

**Les rubriques de la carte sont libres.** Le restaurateur les écrit lui-même.
Elles s'affichent dans l'ordre où leur premier plat a été ajouté, et les plats
dans l'ordre d'ajout.

## Ce que ça coûte

Une table de plus, et un restaurateur qui ne trouve pas sa cuisine dans la liste
doit choisir la plus proche, ou demander qu'on en ajoute une.

Garder l'ordre d'ajout demande de le ranger : une colonne de position, plutôt
que de compter sur l'ordre dans lequel la base rend les lignes, qui n'est
garanti par rien.

## Ce qui a été écarté

**Une cuisine en texte libre.** Plus simple à écrire, mais la recherche par
cuisine devient une recherche par mots, et les fautes de frappe la cassent.

**Des rubriques imposées** (Entrées, Plats, Desserts, Boissons). Elles ne
conviennent ni à une pâtisserie, ni à une gargote qui ne sert que trois plats.
