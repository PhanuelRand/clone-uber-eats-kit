// Approuve un livreur, ou lui retire son approbation (module 11).
//
// Usage :
//   node --env-file=.env scripts/approuver-livreur.mjs courriel@example.org
//   node --env-file=.env scripts/approuver-livreur.mjs courriel@example.org --retirer
//
// Un livreur s'inscrit depuis l'application : son compte passe « en attente ».
// La vérification de ses papiers (pièce d'identité, permis, carte grise de sa
// moto) se fait hors de l'application. Une fois les papiers vus, ce script
// l'approuve, et il peut prendre des courses.
//
// En production, donnez l'adresse de la base de production pour cette seule
// commande, comme pour `npm run migrate` au module 15.
//
// Ce fichier vous appartient. Remplacez les noms ci-dessous par ceux de vos
// tables et de vos colonnes : le script ne les devine pas.

import pg from 'pg'

const TABLE_DES_COMPTES = 'comptes'
const COLONNE_COURRIEL = 'courriel'
const COLONNE_STATUT_LIVREUR = 'statut_livreur' // 'NONE', 'PENDING' ou 'APPROVED'

const [courriel, option] = process.argv.slice(2)
if (!courriel) {
  console.error('Indiquez le courriel du compte, puis --retirer pour retirer l’approbation.')
  process.exit(2)
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL est vide. Lancez le script avec --env-file=.env.')
  process.exit(2)
}

const retirer = option === '--retirer'
const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
try {
  // On n'approuve qu'un compte qui a demandé à livrer.
  const { rowCount } = await client.query(
    `update ${TABLE_DES_COMPTES}
        set ${COLONNE_STATUT_LIVREUR} = $2
      where lower(${COLONNE_COURRIEL}) = lower($1)
        and ${COLONNE_STATUT_LIVREUR} = $3`,
    retirer ? [courriel, 'PENDING', 'APPROVED'] : [courriel, 'APPROVED', 'PENDING'],
  )
  if (rowCount === 0) {
    console.log(
      retirer
        ? 'Aucun livreur approuvé avec ce courriel.'
        : 'Aucun livreur en attente avec ce courriel. A-t-il bien demandé à livrer ?',
    )
  } else {
    console.log(retirer ? 'Approbation retirée : le livreur est de nouveau en attente.' : 'Ce livreur est approuvé.')
  }
} finally {
  await client.end()
}
