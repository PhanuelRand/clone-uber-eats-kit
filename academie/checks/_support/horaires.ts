/**
 * Des horaires et des instants pour les suites qui interrogent les restaurants.
 *
 * Les suites passent des instants de la semaine du lundi 15 juillet 2030, ou
 * des restaurants ouverts à toute heure : un restaurant d'essai ne doit pas
 * être fermé parce que la vérification tourne un dimanche à 3 heures du matin.
 *
 * Ce fichier fait partie du harnais.
 */

/** Ouvert tous les jours, de minuit à minuit (décision 0006). */
export const ALWAYS_OPEN = [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, opens: '00:00', closes: '24:00' }))

/**
 * L'instant, en UTC, qui correspond à cette date et à cette heure à
 * Madagascar. Madagascar a trois heures d'avance sur UTC, sans heure d'été.
 *
 *   inMadagascar('2030-07-15', '12:00')  ->  '2030-07-15T09:00:00.000Z'
 */
export function inMadagascar(date: string, time: string) {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number)
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  return new Date(Date.UTC(year, month - 1, day, hours - 3, minutes)).toISOString()
}

/** Le centre d'Antananarivo. Un degré de latitude vaut environ 111,2 km. */
export const TANA = { latitude: -18.9137, longitude: 47.5361 }

/** Une position à `km` kilomètres au nord de `from`. */
export function north(km: number, from = TANA) {
  return { latitude: from.latitude + km / 111.19493, longitude: from.longitude }
}

/**
 * Un point au hasard dans l'intérieur de Madagascar, loin des autres essais :
 * les livreurs d'une suite ne voient pas les commandes d'une autre.
 */
export function somewhere() {
  return {
    latitude: -14 - Math.random() * 8,
    longitude: 45 + Math.random() * 3,
  }
}
