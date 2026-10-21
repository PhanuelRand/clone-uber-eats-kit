/**
 * Module 8 : La distance, la zone et les frais de livraison.
 *
 * Un restaurant ne livre pas toute l'île : il livre dans un rayon autour de
 * lui, que le restaurateur a choisi. La recherche apprend à ne montrer que les
 * restaurants qui livrent jusqu'au client, les plus proches d'abord, avec le
 * prix de la livraison.
 *
 * Contrat attendu, exporté par `src/academie/module-8.ts` :
 *
 *   export function deliveryFee(distanceKm: number): number
 *
 *   export function createRestaurant(input?: { ...ceux du module 7 })
 *
 *   export function search(input: {
 *     ...les champs du module 7
 *     near?: { latitude: number; longitude: number }   // l'adresse de livraison du client
 *   }): Promise<{
 *     items: {
 *       restaurantId: string; ...
 *       distanceKm?: number      // présent quand `near` est donné
 *       deliveryFee?: number     // présent quand `near` est donné
 *     }[]
 *     nextCursor: string | null
 *   }>
 *
 * La distance se mesure sur la Terre, en suivant sa courbure : la formule de
 * haversine, avec un rayon terrestre de 6 371 km. Un degré de longitude ne
 * vaut pas un degré de latitude, et Madagascar est dans l'hémisphère sud : ses
 * latitudes sont négatives.
 *
 * Quand `near` est donné :
 *   - seuls les restaurants dont le rayon de livraison atteint `near`
 *     apparaissent, rayon compris;
 *   - les plus proches viennent d'abord, et la pagination par curseur suit cet
 *     ordre;
 *   - `distanceKm` est arrondie au dixième de kilomètre;
 *   - `deliveryFee` se calcule sur la distance exacte, pas sur l'arrondi.
 *
 * Les frais de livraison, en ariary : 2 000 Ar jusqu'à 3 km compris, puis
 * 500 Ar de plus par kilomètre entamé au-delà. À 3,2 km, 2 500 Ar; à 4 km,
 * 2 500 Ar; à 4,2 km, 3 000 Ar.
 *
 * L'adresse du client n'est jamais renvoyée, ni rangée par la recherche.
 */
import { describe, expect, it } from 'vitest'
import { createRestaurant, deliveryFee, search } from '../../../src/academie/module-8'
import { TANA, north } from '../_support/horaires'

function uniqueCity(label: string) {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function restaurantAt(city: string, position: { latitude: number; longitude: number }, extra: Parameters<typeof createRestaurant>[0] = {}) {
  return (await createRestaurant({ city, ...position, ...extra })).restaurantId
}

async function found(city: string, extra: Partial<Parameters<typeof search>[0]> = {}) {
  return (await search({ city, near: TANA, ...extra })).items
}

describe('les frais de livraison', () => {
  it('coûtent 2 000 Ar jusqu’à 3 km compris', () => {
    expect(deliveryFee(0.4)).toBe(2_000)
    expect(deliveryFee(3)).toBe(2_000)
  })

  it('ajoutent 500 Ar par kilomètre entamé au-delà de 3 km', () => {
    expect(deliveryFee(3.01)).toBe(2_500)
    expect(deliveryFee(4)).toBe(2_500)
    expect(deliveryFee(4.2)).toBe(3_000)
    expect(deliveryFee(10)).toBe(5_500)
  })
})

describe('la zone de livraison', () => {
  it('montre un restaurant qui livre jusqu’au client, et cache celui dont le rayon est trop court', async () => {
    const city = uniqueCity('rayon')
    const reaches = await restaurantAt(city, north(4), { deliveryRadiusKm: 5 })
    await restaurantAt(city, north(4), { deliveryRadiusKm: 3 })
    const wide = await restaurantAt(city, north(9), { deliveryRadiusKm: 10 })

    expect((await found(city)).map((item) => item.restaurantId).sort()).toEqual([reaches, wide].sort())
  })

  // Le piège classique : multiplier les degrés par 111 dans les deux directions.
  it('mesure la distance sur la Terre, pas en degrés', async () => {
    const city = uniqueCity('courbure')
    // 0,0935 degré vers l'est : 9,8 km à cette latitude, et non 10,4 km.
    const east = await restaurantAt(city, { latitude: TANA.latitude, longitude: TANA.longitude + 0.0935 }, { deliveryRadiusKm: 10 })

    const items = await found(city)
    expect(items.map((item) => item.restaurantId)).toEqual([east])
    expect(items[0]?.distanceKm).toBe(9.8)
  })

  it('montre tous les restaurants de la ville sans adresse de livraison', async () => {
    const city = uniqueCity('sans-adresse')
    await restaurantAt(city, north(40), { deliveryRadiusKm: 5 })
    await restaurantAt(city, north(2), { deliveryRadiusKm: 5 })

    const items = (await search({ city })).items
    expect(items).toHaveLength(2)
    expect(items.every((item) => item.distanceKm === undefined), 'sans near, aucune distance').toBe(true)
  })

  it('combine la zone avec la cuisine et le prix', async () => {
    const city = uniqueCity('zone-et-prix')
    const match = await restaurantAt(city, north(2), { cuisine: 'pizza', dishes: [{ name: 'Margherita', price: 18_000 }] })
    await restaurantAt(city, north(2), { cuisine: 'pizza', dishes: [{ name: 'Royale', price: 40_000 }] })
    await restaurantAt(city, north(2), { cuisine: 'burger', dishes: [{ name: 'Cheese', price: 15_000 }] })
    await restaurantAt(city, north(8), { cuisine: 'pizza', dishes: [{ name: 'Reine', price: 15_000 }] })

    const items = await found(city, { cuisine: 'pizza', maxPrice: 20_000 })
    expect(items.map((item) => item.restaurantId)).toEqual([match])
  })
})

describe('l’ordre et la distance affichée', () => {
  it('range les restaurants du plus proche au plus loin', async () => {
    const city = uniqueCity('ordre')
    const far = await restaurantAt(city, north(6), { deliveryRadiusKm: 10 })
    const close = await restaurantAt(city, north(2), { deliveryRadiusKm: 10 })
    const middle = await restaurantAt(city, north(4), { deliveryRadiusKm: 10 })

    expect((await found(city)).map((item) => item.restaurantId)).toEqual([close, middle, far])
  })

  it('arrondit la distance au dixième, et calcule les frais sur la distance exacte', async () => {
    const city = uniqueCity('arrondi')
    await restaurantAt(city, north(2.44), { deliveryRadiusKm: 10 })
    await restaurantAt(city, north(3.2), { deliveryRadiusKm: 10 })
    await restaurantAt(city, north(5.5), { deliveryRadiusKm: 10 })

    const items = await found(city)
    expect(items.map((item) => item.distanceKm)).toEqual([2.4, 3.2, 5.5])
    expect(items.map((item) => item.deliveryFee)).toEqual([2_000, 2_500, 3_500])
  })

  it('parcourt les pages dans l’ordre des distances, sans doublon ni oubli', async () => {
    const city = uniqueCity('pages')
    const created: string[] = []
    for (const km of [1, 2, 3, 4, 5]) created.push(await restaurantAt(city, north(km), { deliveryRadiusKm: 10 }))

    const seen: string[] = []
    let cursor: string | null = null
    for (let page = 0; page < 10; page += 1) {
      const result: Awaited<ReturnType<typeof search>> = await search({ city, near: TANA, cursor, limit: 2 })
      seen.push(...result.items.map((item) => item.restaurantId))
      cursor = result.nextCursor
      if (!cursor) break
    }
    expect(seen).toEqual(created)
  })

  it('ne rend jamais l’adresse de livraison du client', async () => {
    const city = uniqueCity('vie-privee')
    await restaurantAt(city, north(3), { deliveryRadiusKm: 10 })
    const home = north(0.7)

    const items = (await search({ city, near: home })).items
    expect(items).toHaveLength(1)
    expect(JSON.stringify(items), 'la position du client ne quitte pas le serveur').not.toContain(home.latitude.toFixed(4))
  })
})
