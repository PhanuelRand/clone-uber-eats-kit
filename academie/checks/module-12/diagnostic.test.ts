/**
 * Module 12 : Diagnostic, la course prise deux fois.
 *
 * Aux modules 9 et 11, vos commandes et vos courses ont passé toutes leurs
 * vérifications. Elles envoyaient les demandes une par une. Celles-ci les
 * envoient en même temps.
 *
 * Une implémentation qui lit puis écrit laisse une fenêtre entre les deux :
 *
 * - deux livreurs qui touchent « Accepter la course » à la même seconde voient
 *   les deux demandes lire « sans livreur », et partent tous les deux chercher
 *   le même repas;
 * - la même validation du panier envoyée cinq fois, par un double clic ou un
 *   réseau qui réessaie, peut créer plusieurs commandes;
 * - un livreur qui accepte six courses d'un coup peut les voir toutes passer :
 *   chaque demande a lu « il porte moins de deux commandes » avant que les
 *   autres n'écrivent.
 *
 * Aucun test séquentiel ne voit ces défauts. La garantie doit venir de la base :
 * une mise à jour conditionnelle, une contrainte d'unicité, et un verrou sur le
 * livreur pendant la transaction de prise en charge.
 *
 * Contrat attendu, exporté par `src/academie/module-12.ts` : les fonctions des
 * modules 9 et 11, que vous réexportez.
 *
 *   export function createAccount(input?: { ...ceux du module 6 }): Promise<string>
 *   export function createRestaurant(input?: { ...ceux du module 7 })
 *   export function placeOrder(input: { ...ceux du module 9 })
 *   export function ordersOf(customerId: string)                              // module 9
 *   export function createPaidOrder(input?: { ...ceux du module 11 })
 *   export function acceptOrder(input: { orderId; ownerId })                  // module 11
 *   export function claimDelivery(input: { orderId; courierId })              // module 11
 *   export function assignedCourier(orderId: string): Promise<string | null>  // module 11
 */
import { describe, expect, it } from 'vitest'
import {
  acceptOrder,
  assignedCourier,
  claimDelivery,
  createAccount,
  createPaidOrder,
  createRestaurant,
  ordersOf,
  placeOrder,
} from '../../../src/academie/module-12'
import { TANA, north, somewhere } from '../_support/horaires'

function courier() {
  return createAccount({ name: 'Livreur', roles: ['CUSTOMER', 'COURIER'], courierStatus: 'APPROVED' })
}

async function acceptedOrder() {
  const order = await createPaidOrder(somewhere())
  await acceptOrder({ orderId: order.orderId, ownerId: order.ownerId })
  return order.orderId
}

describe('demandes simultanées', { timeout: 60_000 }, () => {
  // Le test que seule une garantie de la base fait passer de façon fiable.
  it('ne confie une course qu’à un livreur quand deux l’acceptent au même instant', async () => {
    const races = await Promise.all(
      Array.from({ length: 8 }, async () => ({
        orderId: await acceptedOrder(),
        couriers: [await courier(), await courier()],
      })),
    )

    const responses = await Promise.all(
      races.flatMap(({ orderId, couriers }) =>
        couriers.map(async (courierId) => ({ orderId, courierId, ...(await claimDelivery({ orderId, courierId })) })),
      ),
    )

    const winners = responses.filter((response) => response.status === 200)
    expect(winners, 'une prise en charge réussie par commande, pas deux').toHaveLength(races.length)
    for (const { orderId } of races) {
      const winner = winners.filter((response) => response.orderId === orderId)
      expect(winner, 'ni zéro livreur, ni deux : exactement un par commande').toHaveLength(1)
      expect(await assignedCourier(orderId), 'le livreur enregistré est celui qui a reçu 200').toBe(winner[0]?.courierId)
    }
  })

  it('ne crée qu’une commande quand la même validation arrive cinq fois', async () => {
    const { restaurantId, dishIds } = await createRestaurant({ ...TANA, dishes: [{ name: 'Romazava', price: 12_000 }] })
    const customerId = await createAccount()
    const input = {
      customerId,
      restaurantId,
      lines: [{ dishId: dishIds[0] ?? '', quantity: 1 }],
      deliverTo: north(2),
      address: 'Lot IVG 45, Behoririka',
      now: new Date().toISOString(),
      idempotencyKey: `double-clic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    }

    const results = await Promise.all(Array.from({ length: 5 }, () => placeOrder(input)))

    expect(new Set(results.map((result) => result.orderId)).size, 'les cinq réponses désignent la même commande').toBe(1)
    expect(await ordersOf(customerId), 'une seule commande enregistrée').toHaveLength(1)
  })

  it('ne laisse un livreur prendre que deux courses sur six acceptées en même temps', async () => {
    const courierId = await courier()
    const orders = await Promise.all(Array.from({ length: 6 }, () => acceptedOrder()))

    const results = await Promise.all(orders.map((orderId) => claimDelivery({ orderId, courierId })))

    expect(results.filter((result) => result.status === 200)).toHaveLength(2)
    const carried = (await Promise.all(orders.map((orderId) => assignedCourier(orderId)))).filter((id) => id === courierId)
    expect(carried, 'deux commandes au plus en même temps').toHaveLength(2)
  })
})
