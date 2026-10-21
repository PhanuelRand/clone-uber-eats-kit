/**
 * Module 2 : Architecture, les horaires d'ouverture.
 *
 * Un restaurant ouvre par créneaux, jour par jour, à l'heure de Madagascar
 * (décision 0006). Un créneau a un jour, une heure d'ouverture et une heure de
 * fermeture. L'heure de fermeture n'est pas comprise : un restaurant ouvert de
 * 11 h 00 à 14 h 00 est fermé à 14 h 00 pile.
 *
 * Les jours sont numérotés comme dans la norme ISO : 1 pour le lundi, 7 pour le
 * dimanche. '24:00' désigne la fin de la journée. Un créneau dont l'heure de
 * fermeture vient avant l'heure d'ouverture passe minuit : vendredi de 18 h 00
 * à 02 h 00 couvre la nuit du vendredi au samedi. Le dimanche soir déborde sur
 * le lundi.
 *
 * L'instant demandé est en UTC, ou porte son décalage. Il se lit à l'heure de
 * Madagascar, UTC+3, sans heure d'été : 21 h 30 UTC le lundi, c'est 0 h 30 le
 * mardi à Antananarivo.
 *
 * Contrat attendu, exporté par `src/academie/module-2.ts` :
 *
 *   export function isOpen(input: {
 *     hours: { day: number; opens: string; closes: string }[]   // 'HH:MM'
 *     at: string                                               // un instant ISO 8601
 *   }): boolean
 *
 * Le calcul ne dépend pas du fuseau de la machine qui l'exécute.
 */
import { describe, expect, it } from 'vitest'
import { isOpen } from '../../../src/academie/module-2'

// Le lundi 15 juillet 2030. Madagascar a trois heures d'avance sur UTC.
const lunch = [{ day: 1, opens: '11:00', closes: '14:00' }]

describe('un créneau dans la journée', () => {
  it('ouvre à l’heure d’ouverture, heure de Madagascar', () => {
    expect(isOpen({ hours: lunch, at: '2030-07-15T07:59:00.000Z' }), '10 h 59 à Antananarivo').toBe(false)
    expect(isOpen({ hours: lunch, at: '2030-07-15T08:00:00.000Z' }), '11 h 00 à Antananarivo').toBe(true)
  })

  it('ferme à l’heure de fermeture, qui n’est pas comprise', () => {
    expect(isOpen({ hours: lunch, at: '2030-07-15T10:59:00.000Z' }), '13 h 59').toBe(true)
    expect(isOpen({ hours: lunch, at: '2030-07-15T11:00:00.000Z' }), '14 h 00').toBe(false)
  })

  it('ne vaut que pour son jour', () => {
    expect(isOpen({ hours: lunch, at: '2030-07-16T09:00:00.000Z' }), 'le mardi à midi').toBe(false)
  })

  it('combine plusieurs créneaux du même jour', () => {
    const hours = [...lunch, { day: 1, opens: '18:00', closes: '22:00' }]
    expect(isOpen({ hours, at: '2030-07-15T13:00:00.000Z' }), '16 h 00, entre les services').toBe(false)
    expect(isOpen({ hours, at: '2030-07-15T16:00:00.000Z' }), '19 h 00').toBe(true)
  })

  it('lit un instant écrit avec un autre décalage horaire', () => {
    expect(isOpen({ hours: lunch, at: '2030-07-15T11:30:00+03:00' })).toBe(true)
  })

  it('reste fermé sans aucun créneau', () => {
    expect(isOpen({ hours: [], at: '2030-07-15T09:00:00.000Z' })).toBe(false)
  })
})

describe('le jour de Madagascar', () => {
  // 21 h 30 UTC le lundi : à Antananarivo, c'est déjà mardi, 0 h 30.
  it('compte le jour à Madagascar, pas en UTC', () => {
    const tuesdayNight = [{ day: 2, opens: '00:00', closes: '06:00' }]
    expect(isOpen({ hours: tuesdayNight, at: '2030-07-15T21:30:00.000Z' })).toBe(true)

    const mondayNight = [{ day: 1, opens: '20:00', closes: '24:00' }]
    expect(isOpen({ hours: mondayNight, at: '2030-07-15T21:30:00.000Z' })).toBe(false)
  })

  it('lit 24:00 comme la fin de la journée', () => {
    const sunday = [{ day: 7, opens: '00:00', closes: '24:00' }]
    expect(isOpen({ hours: sunday, at: '2030-07-21T20:59:00.000Z' }), 'dimanche 23 h 59').toBe(true)
    expect(isOpen({ hours: sunday, at: '2030-07-21T21:00:00.000Z' }), 'lundi 0 h 00').toBe(false)
  })
})

describe('un créneau qui passe minuit', () => {
  const fridayNight = [{ day: 5, opens: '18:00', closes: '02:00' }]

  it('ouvre le vendredi soir', () => {
    expect(isOpen({ hours: fridayNight, at: '2030-07-19T14:59:00.000Z' }), 'vendredi 17 h 59').toBe(false)
    expect(isOpen({ hours: fridayNight, at: '2030-07-19T20:00:00.000Z' }), 'vendredi 23 h 00').toBe(true)
  })

  it('reste ouvert la nuit, jusqu’à l’heure de fermeture du samedi matin', () => {
    expect(isOpen({ hours: fridayNight, at: '2030-07-19T22:30:00.000Z' }), 'samedi 1 h 30').toBe(true)
    expect(isOpen({ hours: fridayNight, at: '2030-07-19T23:00:00.000Z' }), 'samedi 2 h 00').toBe(false)
  })

  it('n’ouvre pas le samedi soir pour autant', () => {
    expect(isOpen({ hours: fridayNight, at: '2030-07-20T16:00:00.000Z' }), 'samedi 19 h 00').toBe(false)
  })

  it('passe du dimanche au lundi', () => {
    const sundayNight = [{ day: 7, opens: '20:00', closes: '01:00' }]
    expect(isOpen({ hours: sundayNight, at: '2030-07-21T21:30:00.000Z' }), 'lundi 0 h 30').toBe(true)
    expect(isOpen({ hours: sundayNight, at: '2030-07-21T22:00:00.000Z' }), 'lundi 1 h 00').toBe(false)
  })
})
