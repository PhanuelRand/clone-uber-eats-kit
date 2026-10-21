/**
 * Module 9 : Le panier, le devis et la commande.
 *
 * Le client remplit son panier chez un restaurant, voit le devis, puis passe
 * commande. Le serveur recalcule tout : il ne croit jamais un prix envoyé par
 * le navigateur. La commande garde les prix et les noms du moment : si le
 * restaurant change sa carte le lendemain, la commande d'hier ne change pas.
 *
 * Contrat attendu, exporté par `src/academie/module-9.ts` :
 *
 *   export function createAccount(input?: { ...ceux du module 6 }): Promise<string>
 *   export function createRestaurant(input?: { ...ceux du module 7 })
 *   export function updateDish(input: { ...ceux du module 6 })
 *
 *   export function quote(input: {
 *     customerId: string; restaurantId: string
 *     lines: { dishId: string; quantity: number }[]
 *     deliverTo: { latitude: number; longitude: number }
 *     now: string                  // un instant ISO 8601
 *   }): Promise<{
 *     status: number               // 200, 400 ou 409
 *     subtotal?: number; deliveryFee?: number; serviceFee?: number; total?: number
 *     reason?: string              // présent quand status n'est pas 200
 *   }>
 *
 *   export function placeOrder(input: {
 *     ...ceux de quote
 *     address: string              // l'adresse lisible : « Lot IVG 45, Behoririka »
 *     instructions?: string        // pour le livreur, 300 caractères au plus
 *     idempotencyKey: string       // choisie par l'interface, une par validation du panier
 *   }): Promise<{
 *     status: number               // 201; 200 pour une clé déjà vue; 400 ou 409
 *     orderId?: string; total?: number; reason?: string
 *   }>
 *
 *   export function getOrder(input: { orderId: string; viewerId: string }): Promise<{
 *     status: number               // 200, ou 403 pour un autre compte que le client
 *     order?: {
 *       orderId: string; status: string; restaurantId: string
 *       lines: { dishId: string; name: string; unitPrice: number; quantity: number }[]
 *       subtotal: number; deliveryFee: number; serviceFee: number; total: number
 *     }
 *   }>
 *
 *   export function ordersOf(customerId: string): Promise<{ orderId: string; status: string; total: number }[]>
 *
 * Le devis suit les règles du module 2 pour les montants, et celles du
 * module 8 pour les frais de livraison, calculés entre le restaurant et
 * l'adresse de livraison. Il est refusé :
 *   - avec 400 : sans ligne, pour une quantité qui n'est pas un entier de 1 à
 *     20, un plat inconnu ou d'un autre restaurant, une adresse hors de la zone
 *     de livraison, ou un sous-total sous le minimum de commande de 5 000 Ar;
 *   - avec 409 : pour un plat épuisé, ou un restaurant fermé à l'instant `now`.
 *
 * Une commande passée est en attente de paiement (PENDING_PAYMENT). La même clé
 * d'idempotence, rejouée avec le même panier, rend la même commande avec 200 :
 * un double clic ne commande pas deux fois. Rejouée avec un autre panier, elle
 * est refusée avec 409.
 */
import { describe, expect, it } from 'vitest'
import { createAccount, createRestaurant, getOrder, ordersOf, placeOrder, quote, updateDish } from '../../../src/academie/module-9'
import { TANA, inMadagascar, north } from '../_support/horaires'

const now = inMadagascar('2030-07-15', '12:30') // un lundi midi
const home = north(2)

async function kitchen(extra: Parameters<typeof createRestaurant>[0] = {}) {
  const { restaurantId, ownerId, dishIds } = await createRestaurant({
    ...TANA,
    deliveryRadiusKm: 5,
    dishes: [
      { name: 'Romazava', price: 12_000 },
      { name: 'Ranonapango', price: 3_000 },
      { name: 'Mofo gasy', price: 500 },
    ],
    ...extra,
  })
  const [romazava = '', drink = '', mofo = ''] = dishIds
  return { restaurantId, ownerId, romazava, drink, mofo }
}

function key() {
  return `panier-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

describe('le devis', () => {
  it('additionne les plats, les frais de livraison et les frais de service', async () => {
    const { restaurantId, romazava, drink } = await kitchen()
    const customerId = await createAccount()
    const result = await quote({
      customerId,
      restaurantId,
      lines: [
        { dishId: romazava, quantity: 2 },
        { dishId: drink, quantity: 1 },
      ],
      deliverTo: home,
      now,
    })

    expect(result).toMatchObject({ status: 200, subtotal: 27_000, deliveryFee: 2_000, serviceFee: 1_350, total: 30_350 })
  })

  it('compte les frais de livraison selon la distance au restaurant', async () => {
    const { restaurantId, romazava } = await kitchen({ deliveryRadiusKm: 10 })
    const result = await quote({
      customerId: await createAccount(),
      restaurantId,
      lines: [{ dishId: romazava, quantity: 1 }],
      deliverTo: north(5.5),
      now,
    })
    expect(result.deliveryFee).toBe(3_500)
  })

  it('refuse un panier vide, une quantité hors de 1 à 20, ou un plat d’un autre restaurant, avec 400', async () => {
    const { restaurantId, romazava } = await kitchen()
    const other = await kitchen()
    const customerId = await createAccount()
    const cases = [
      [],
      [{ dishId: romazava, quantity: 0 }],
      [{ dishId: romazava, quantity: 2.5 }],
      [{ dishId: romazava, quantity: 21 }],
      [{ dishId: other.romazava, quantity: 1 }],
      [{ dishId: '00000000-0000-4000-8000-000000000000', quantity: 1 }],
    ]
    for (const lines of cases) {
      const result = await quote({ customerId, restaurantId, lines, deliverTo: home, now })
      expect(result.status, JSON.stringify(lines)).toBe(400)
      expect(result.reason, 'le refus doit porter un motif lisible').toBeTruthy()
    }
  })

  it('refuse une adresse hors de la zone de livraison, avec 400 et un motif', async () => {
    const { restaurantId, romazava } = await kitchen({ deliveryRadiusKm: 3 })
    const result = await quote({
      customerId: await createAccount(),
      restaurantId,
      lines: [{ dishId: romazava, quantity: 1 }],
      deliverTo: north(4),
      now,
    })
    expect(result.status).toBe(400)
    expect(result.reason).toBeTruthy()
  })

  it('refuse un panier sous le minimum de 5 000 Ar, avec 400 et un motif', async () => {
    const { restaurantId, mofo } = await kitchen()
    const customerId = await createAccount()
    const below = await quote({ customerId, restaurantId, lines: [{ dishId: mofo, quantity: 9 }], deliverTo: home, now })
    expect(below.status).toBe(400)
    expect(below.reason).toBeTruthy()

    const exact = await quote({ customerId, restaurantId, lines: [{ dishId: mofo, quantity: 10 }], deliverTo: home, now })
    expect(exact.status, '5 000 Ar tout juste suffisent').toBe(200)
  })

  it('refuse un plat épuisé, avec 409 et un motif', async () => {
    const { restaurantId, ownerId, romazava } = await kitchen()
    await updateDish({ dishId: romazava, memberId: ownerId, available: false })

    const result = await quote({
      customerId: await createAccount(),
      restaurantId,
      lines: [{ dishId: romazava, quantity: 1 }],
      deliverTo: home,
      now,
    })
    expect(result.status).toBe(409)
    expect(result.reason).toBeTruthy()
  })

  it('refuse un restaurant fermé à cet instant, avec 409 et un motif', async () => {
    const { restaurantId, romazava } = await kitchen({ hours: [{ day: 1, opens: '18:00', closes: '22:00' }] })
    const result = await quote({
      customerId: await createAccount(),
      restaurantId,
      lines: [{ dishId: romazava, quantity: 1 }],
      deliverTo: home,
      now,
    })
    expect(result.status).toBe(409)
    expect(result.reason).toBeTruthy()
  })
})

describe('passer commande', () => {
  async function ordered() {
    const restaurant = await kitchen()
    const customerId = await createAccount()
    const lines = [{ dishId: restaurant.romazava, quantity: 2 }]
    const result = await placeOrder({
      customerId,
      restaurantId: restaurant.restaurantId,
      lines,
      deliverTo: home,
      address: 'Lot IVG 45, Behoririka',
      instructions: 'Portail vert, deuxième étage',
      now,
      idempotencyKey: key(),
    })
    if (!result.orderId) throw new Error(`commande refusée : ${result.reason ?? result.status}`)
    return { ...restaurant, customerId, orderId: result.orderId, result }
  }

  it('crée une commande en attente de paiement, au total du devis', async () => {
    const { customerId, orderId, result, restaurantId, romazava } = await ordered()
    expect(result.status).toBe(201)
    expect(result.total).toBe(27_200)

    const read = await getOrder({ orderId, viewerId: customerId })
    expect(read.status).toBe(200)
    expect(read.order).toMatchObject({
      orderId,
      status: 'PENDING_PAYMENT',
      restaurantId,
      lines: [{ dishId: romazava, name: 'Romazava', unitPrice: 12_000, quantity: 2 }],
      subtotal: 24_000,
      deliveryFee: 2_000,
      serviceFee: 1_200,
      total: 27_200,
    })
  })

  // Le prix figé : ce que le client a accepté, pas ce que la carte dit aujourd'hui.
  it('garde le prix et le nom du moment, même si la carte change ensuite', async () => {
    const { customerId, orderId, ownerId, romazava } = await ordered()
    await updateDish({ dishId: romazava, memberId: ownerId, price: 15_000, name: 'Romazava de zébu' })

    const read = await getOrder({ orderId, viewerId: customerId })
    expect(read.order?.lines).toEqual([{ dishId: romazava, name: 'Romazava', unitPrice: 12_000, quantity: 2 }])
    expect(read.order?.total).toBe(27_200)
  })

  it('refuse une commande sans adresse lisible, avec 400', async () => {
    const { restaurantId, romazava } = await kitchen()
    const result = await placeOrder({
      customerId: await createAccount(),
      restaurantId,
      lines: [{ dishId: romazava, quantity: 1 }],
      deliverTo: home,
      address: '   ',
      now,
      idempotencyKey: key(),
    })
    expect(result.status).toBe(400)
  })

  it('refuse à un autre compte de lire la commande, avec 403', async () => {
    const { orderId } = await ordered()
    const read = await getOrder({ orderId, viewerId: await createAccount() })
    expect(read.status).toBe(403)
    expect(read.order, 'un tiers ne voit rien de la commande').toBeUndefined()
  })

  it('range la commande dans « Mes commandes »', async () => {
    const { customerId, orderId } = await ordered()
    expect(await ordersOf(customerId)).toEqual([{ orderId, status: 'PENDING_PAYMENT', total: 27_200 }])
  })
})

describe('la clé d’idempotence', () => {
  it('rend la même commande quand la même validation est rejouée', async () => {
    const { restaurantId, romazava } = await kitchen()
    const customerId = await createAccount()
    const input = {
      customerId,
      restaurantId,
      lines: [{ dishId: romazava, quantity: 1 }],
      deliverTo: home,
      address: 'Lot IVG 45, Behoririka',
      now,
      idempotencyKey: key(),
    }
    const first = await placeOrder(input)
    const replay = await placeOrder(input)

    expect(first.status).toBe(201)
    expect(replay.status).toBe(200)
    expect(replay.orderId).toBe(first.orderId)
    expect(await ordersOf(customerId), 'un double clic ne commande pas deux fois').toHaveLength(1)
  })

  it('refuse la même clé pour un autre panier, avec 409', async () => {
    const { restaurantId, romazava, drink } = await kitchen()
    const customerId = await createAccount()
    const base = { customerId, restaurantId, deliverTo: home, address: 'Lot IVG 45, Behoririka', now, idempotencyKey: key() }
    await placeOrder({ ...base, lines: [{ dishId: romazava, quantity: 1 }] })

    const other = await placeOrder({ ...base, lines: [{ dishId: romazava, quantity: 1 }, { dishId: drink, quantity: 2 }] })
    expect(other.status).toBe(409)
    expect(other.reason).toBeTruthy()
    expect(await ordersOf(customerId)).toHaveLength(1)
  })
})
