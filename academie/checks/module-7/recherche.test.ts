/**
 * Module 7 : La recherche, les cuisines et les horaires.
 *
 * La recherche montre les restaurants qui correspondent à ce que la personne
 * cherche, les derniers arrivés d'abord, page par page. Elle est publique :
 * un visiteur non connecté cherche aussi.
 *
 * Contrat attendu, exporté par `src/academie/module-7.ts` :
 *
 *   export function createRestaurant(input?: {
 *     ownerId?: string                  // par défaut un restaurateur neuf
 *     name?: string                     // par défaut 'Restaurant de vérification'
 *     cuisine?: string                  // par défaut 'malgache'
 *     city?: string                     // par défaut 'Antananarivo'
 *     latitude?: number; longitude?: number     // par défaut le centre d'Antananarivo
 *     deliveryRadiusKm?: number         // par défaut 5
 *     hours?: { day: number; opens: string; closes: string }[]   // par défaut ouvert à toute heure
 *     dishes?: { name: string; price: number; section?: string; available?: boolean }[]
 *                                       // par défaut un plat à 10 000 Ar
 *     createdAt?: string                // un instant ISO 8601; par défaut maintenant
 *   }): Promise<{ restaurantId: string; ownerId: string; dishIds: string[] }>
 *                                       // dishIds dans l'ordre de `dishes`
 *
 *   export function search(input: {
 *     query?: string                    // des mots, cherchés dans le nom du restaurant et de ses plats
 *     cuisine?: string                  // le slug d'une cuisine
 *     city?: string
 *     openAt?: string                   // un instant ISO 8601 : ouverts à cet instant
 *     maxPrice?: number                 // en ariary : au moins un plat disponible à ce prix ou moins
 *     cursor?: string | null; limit?: number
 *   }): Promise<{
 *     items: {
 *       restaurantId: string; name: string
 *       cuisine: string; city: string
 *       minPrice: number | null         // le prix du plat disponible le moins cher
 *     }[]
 *     nextCursor: string | null
 *   }>
 *
 * Un restaurant apparaît quand :
 *   - chaque mot de la recherche figure dans son nom ou dans le nom de l'un de
 *     ses plats, sans tenir compte des majuscules ni des accents : « mofo »
 *     trouve « Mofo gasy »;
 *   - il est de la cuisine demandée, et dans la ville demandée, sans tenir
 *     compte des majuscules;
 *   - il est ouvert à l'instant `openAt`, selon ses horaires (module 2);
 *   - il a au moins un plat disponible au prix `maxPrice` ou moins.
 *
 * Un plat retiré de la carte ne compte plus. Les restaurants les plus récents
 * viennent d'abord. Un résultat ne contient ni le courriel ni le téléphone du
 * restaurateur. La pagination est par curseur, jamais par OFFSET : un
 * restaurant ouvert pendant qu'on feuillette ne doit ni décaler ni dupliquer
 * les résultats déjà vus.
 */
import { describe, expect, it } from 'vitest'
import { createRestaurant, search } from '../../../src/academie/module-7'
import { inMadagascar } from '../_support/horaires'

// Chaque test travaille dans sa propre ville : les suites ne se polluent pas.
function uniqueCity(label: string) {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Un instant d'il y a `minutes` minutes, pour ordonner les restaurants. */
function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

async function idsFound(input: Parameters<typeof search>[0]) {
  return (await search(input)).items.map((item) => item.restaurantId)
}

async function restaurant(input: Parameters<typeof createRestaurant>[0]) {
  return (await createRestaurant(input)).restaurantId
}

describe('les mots de la recherche', () => {
  it('trouve un mot dans le nom du restaurant ou dans le nom d’un plat', async () => {
    const city = uniqueCity('mots')
    const byName = await restaurant({ city, name: 'Pizzeria du Lac' })
    const byDish = await restaurant({ city, name: 'Le Coin', dishes: [{ name: 'Pizza aux trois fromages', price: 25_000 }] })
    await restaurant({ city, name: 'Grillades d’Isoraka', dishes: [{ name: 'Brochettes de zébu', price: 9_000 }] })

    expect((await idsFound({ city, query: 'pizza' })).sort()).toEqual([byDish].sort())
    expect((await idsFound({ city, query: 'pizzeria' })).sort()).toEqual([byName].sort())
  })

  it('ne tient compte ni des majuscules ni des accents', async () => {
    const city = uniqueCity('accents')
    const place = await restaurant({ city, name: 'GARGOTE DU MARCHÉ', dishes: [{ name: 'Mofo gasy', price: 500 }] })

    expect(await idsFound({ city, query: 'marche' })).toEqual([place])
    expect(await idsFound({ city, query: 'MOFO' })).toEqual([place])
  })

  it('exige chaque mot, dans le nom ou dans les plats', async () => {
    const city = uniqueCity('plusieurs-mots')
    const both = await restaurant({ city, name: 'Chez Lalao', dishes: [{ name: 'Ravitoto au porc', price: 14_000 }] })
    await restaurant({ city, name: 'Chez Rado', dishes: [{ name: 'Romazava', price: 12_000 }] })

    expect(await idsFound({ city, query: 'lalao ravitoto' })).toEqual([both])
  })

  it('trouve un restaurant qui n’a pas encore de carte, par son nom', async () => {
    const city = uniqueCity('sans-carte')
    const empty = await restaurant({ city, name: 'Snack de la gare', dishes: [] })

    const result = await search({ city, query: 'gare' })
    expect(result.items.map((item) => item.restaurantId)).toEqual([empty])
    expect(result.items[0]?.minPrice, 'sans plat disponible, il n’y a pas de prix').toBeNull()
  })
})

describe('les filtres', () => {
  it('ne montre que la cuisine demandée', async () => {
    const city = uniqueCity('cuisine')
    const pizza = await restaurant({ city, cuisine: 'pizza' })
    await restaurant({ city, cuisine: 'malgache' })

    expect(await idsFound({ city, cuisine: 'pizza' })).toEqual([pizza])
  })

  it('ne montre que la ville demandée, sans tenir compte des majuscules', async () => {
    const city = uniqueCity('ville')
    const here = await restaurant({ city })
    await restaurant({ city: uniqueCity('ailleurs') })

    expect(await idsFound({ city: city.toUpperCase() })).toEqual([here])
  })

  it('ne montre que les restaurants ouverts à l’instant demandé', async () => {
    const city = uniqueCity('horaires')
    const lunch = await restaurant({ city, hours: [{ day: 1, opens: '11:00', closes: '14:00' }] })
    const night = await restaurant({ city, hours: [{ day: 5, opens: '18:00', closes: '02:00' }] })

    // Le lundi 15 juillet 2030 et la nuit du vendredi 19 au samedi 20.
    expect(await idsFound({ city, openAt: inMadagascar('2030-07-15', '12:30') })).toEqual([lunch])
    expect(await idsFound({ city, openAt: inMadagascar('2030-07-15', '14:00') })).toEqual([])
    expect(await idsFound({ city, openAt: inMadagascar('2030-07-20', '01:30') })).toEqual([night])
    expect((await idsFound({ city })).sort(), 'sans openAt, les horaires ne filtrent rien').toEqual([lunch, night].sort())
  })

  it('lit le jour à Madagascar, pas en UTC', async () => {
    const city = uniqueCity('jour')
    // Mardi 0 h 30 à Antananarivo, c'est encore lundi 21 h 30 en UTC.
    const tuesday = await restaurant({ city, hours: [{ day: 2, opens: '00:00', closes: '06:00' }] })
    expect(await idsFound({ city, openAt: '2030-07-15T21:30:00.000Z' })).toEqual([tuesday])
  })

  it('ne retient que les plats disponibles pour le prix maximum', async () => {
    const city = uniqueCity('prix')
    const cheap = await restaurant({ city, dishes: [{ name: 'Mofo gasy', price: 500 }, { name: 'Romazava', price: 12_000 }] })
    const edge = await restaurant({ city, dishes: [{ name: 'Soupe', price: 8_000 }] })
    await restaurant({ city, dishes: [{ name: 'Langouste', price: 80_000 }] })
    await restaurant({ city, dishes: [{ name: 'Koba', price: 1_000, available: false }, { name: 'Steak', price: 30_000 }] })

    expect((await idsFound({ city, maxPrice: 8_000 })).sort()).toEqual([cheap, edge].sort())
  })

  it('combine les mots, la cuisine et le prix', async () => {
    const city = uniqueCity('combine')
    const match = await restaurant({ city, cuisine: 'pizza', dishes: [{ name: 'Pizza margherita', price: 18_000 }] })
    await restaurant({ city, cuisine: 'pizza', dishes: [{ name: 'Pizza royale', price: 40_000 }] })
    await restaurant({ city, cuisine: 'snack', dishes: [{ name: 'Pizza en part', price: 6_000 }] })
    await restaurant({ city, cuisine: 'pizza', dishes: [{ name: 'Calzone', price: 15_000 }] })

    expect(await idsFound({ city, query: 'pizza', cuisine: 'pizza', maxPrice: 20_000 })).toEqual([match])
  })
})

describe('ce qu’un résultat montre', () => {
  it('range les restaurants les plus récents d’abord', async () => {
    const city = uniqueCity('ordre')
    const old = await restaurant({ city, createdAt: minutesAgo(30) })
    const recent = await restaurant({ city, createdAt: minutesAgo(1) })
    const middle = await restaurant({ city, createdAt: minutesAgo(10) })

    expect(await idsFound({ city })).toEqual([recent, middle, old])
  })

  it('rend le nom, la cuisine, la ville et le prix du plat disponible le moins cher', async () => {
    const city = uniqueCity('resultat')
    await restaurant({
      city,
      name: 'Le Pavillon de Jade',
      cuisine: 'asiatique',
      dishes: [
        { name: 'Canard laqué', price: 35_000 },
        { name: 'Nems', price: 1_000, available: false },
        { name: 'Soupe chinoise', price: 7_000 },
      ],
    })

    const [item] = (await search({ city })).items
    expect(item).toMatchObject({ name: 'Le Pavillon de Jade', cuisine: 'asiatique', city, minPrice: 7_000 })
    expect(Object.keys(item ?? {}).join(' '), 'aucune donnée de contact dans un résultat').not.toMatch(
      /email|courriel|phone|telephone|mail/i,
    )
  })
})

describe('pagination par curseur', () => {
  it('parcourt tous les restaurants sans doublon ni oubli', async () => {
    const city = uniqueCity('pagination')
    const created = []
    for (let index = 0; index < 7; index += 1) created.push(await restaurant({ city }))

    const seen: string[] = []
    let cursor: string | null = null
    for (let page = 0; page < 20; page += 1) {
      const result: Awaited<ReturnType<typeof search>> = await search({ city, cursor, limit: 3 })
      seen.push(...result.items.map((item) => item.restaurantId))
      cursor = result.nextCursor
      if (!cursor) break
    }
    expect(seen).toHaveLength(created.length)
    expect([...seen].sort()).toEqual([...created].sort())
  })

  // Deux restaurants ouverts au même instant : le curseur doit savoir les départager.
  it('départage les restaurants créés au même instant', async () => {
    const city = uniqueCity('meme-instant')
    const instant = minutesAgo(5)
    const created = []
    for (let index = 0; index < 5; index += 1) created.push(await restaurant({ city, createdAt: instant }))

    const first = await search({ city, limit: 2 })
    const second = await search({ city, cursor: first.nextCursor, limit: 2 })
    const third = await search({ city, cursor: second.nextCursor, limit: 2 })
    const seen = [...first.items, ...second.items, ...third.items].map((item) => item.restaurantId)
    expect([...seen].sort()).toEqual([...created].sort())
  })

  // Le test que OFFSET ne passe pas : une ouverture décale toutes les pages.
  it('ne décale pas les pages déjà vues quand un restaurant arrive entre deux', async () => {
    const city = uniqueCity('insertion')
    for (let index = 0; index < 6; index += 1) await restaurant({ city, createdAt: minutesAgo(60 - index) })

    const first = await search({ city, limit: 3 })
    expect(first.nextCursor, 'six restaurants par pages de trois : il reste une page').toBeTruthy()

    await restaurant({ city })

    const second = await search({ city, cursor: first.nextCursor, limit: 3 })
    const overlap = second.items
      .map((item) => item.restaurantId)
      .filter((id) => first.items.some((item) => item.restaurantId === id))
    expect(overlap, 'aucun restaurant de la page 1 ne doit réapparaître page 2').toEqual([])
    expect(second.items).toHaveLength(3)
  })
})
