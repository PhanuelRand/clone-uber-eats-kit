/**
 * Module 17 : Les notes et les avis. Module Platine.
 *
 * Après une livraison, le client note le restaurant, de 1 à 5, avec un
 * commentaire, et peut lever ou baisser le pouce pour le livreur. Le
 * restaurant répond une fois à chaque avis. La note d'un restaurant aide les
 * suivants à choisir; elle n'est affichée qu'à partir de cinq avis, pour qu'un
 * seul client mécontent, ou un seul ami complaisant, ne la décide pas.
 *
 * Contrat attendu, exporté par `src/academie/module-17.ts` :
 *
 *   export function createAccount(input?: { ...ceux du module 6 }): Promise<string>
 *   export function createPaidOrder(input?: { ...ceux du module 11 })
 *
 *   export function createDeliveredOrder(input?: {
 *     restaurantId?: string        // par défaut un restaurant neuf
 *     courierId?: string           // par défaut un livreur neuf
 *     deliveredAt?: string         // un instant ISO 8601; par défaut maintenant
 *   }): Promise<{ orderId: string; restaurantId: string; ownerId: string; customerId: string; courierId: string }>
 *                                  // une commande passée, payée, acceptée, livrée à l'instant deliveredAt
 *
 *   export function reviewOrder(input: {
 *     orderId: string; authorId: string
 *     rating: number               // un entier de 1 à 5, pour le restaurant
 *     comment: string              // 500 caractères au plus, peut être vide
 *     courierThumb?: 'UP' | 'DOWN' // facultatif, pour le livreur
 *     now: string                  // un instant ISO 8601
 *   }): Promise<{ status: number }>
 *                                  // 201; 400 pour une note ou un pouce invalides, ou un commentaire trop long;
 *                                  // 403 si l'auteur n'est pas le client, ou si la commande n'est pas livrée;
 *                                  // 409 pour un second avis; 410 plus de sept jours après la livraison
 *
 *   export function restaurantRating(restaurantId: string): Promise<{
 *     average: number | null       // la moyenne, à un chiffre après la virgule; null sous cinq avis
 *     count: number                // le nombre d'avis
 *   }>
 *
 *   export function restaurantReviews(restaurantId: string): Promise<
 *     { rating: number; comment: string; reply: string | null }[]   // les plus récents d'abord
 *   >
 *
 *   export function replyToReview(input: {
 *     orderId: string; ownerId: string; body: string
 *   }): Promise<{ status: number }>   // 201; 400 vide; 403 pour un autre; 404 sans avis; 409 une seconde fois
 *
 *   export function courierApproval(courierId: string): Promise<{
 *     count: number                // le nombre de pouces reçus
 *     percent: number | null       // la part de pouces levés, en pourcentage entier; null sans pouce
 *   }>
 *
 * Un avis ne montre ni le nom ni les coordonnées de son auteur. Un livreur voit
 * sa part de pouces levés, jamais quel client a baissé le pouce.
 */
import { describe, expect, it } from 'vitest'
import {
  courierApproval,
  createAccount,
  createDeliveredOrder,
  createPaidOrder,
  replyToReview,
  restaurantRating,
  restaurantReviews,
  reviewOrder,
} from '../../../src/academie/module-17'

const deliveredAt = '2030-07-15T09:30:00.000Z'
const nextDay = '2030-07-16T09:30:00.000Z'

function review(orderId: string, authorId: string, rating: number, extra: Partial<Parameters<typeof reviewOrder>[0]> = {}) {
  return reviewOrder({ orderId, authorId, rating, comment: 'Chaud et bien emballé.', now: nextDay, ...extra })
}

describe('écrire un avis', () => {
  it('accepte l’avis du client, une seule fois', async () => {
    const { orderId, customerId } = await createDeliveredOrder({ deliveredAt })
    expect((await review(orderId, customerId, 5, { courierThumb: 'UP' })).status).toBe(201)
    expect((await review(orderId, customerId, 1)).status, 'un second avis sur la même commande').toBe(409)
  })

  it('refuse une note hors de 1 à 5 ou à virgule, un pouce inconnu, ou un commentaire trop long, avec 400', async () => {
    const { orderId, customerId } = await createDeliveredOrder({ deliveredAt })
    for (const rating of [0, 6, 3.5]) {
      expect((await review(orderId, customerId, rating)).status, `note ${rating}`).toBe(400)
    }
    expect((await review(orderId, customerId, 4, { courierThumb: 'BOF' as never })).status).toBe(400)
    expect((await review(orderId, customerId, 4, { comment: 'a'.repeat(501) })).status).toBe(400)
  })

  it('refuse l’avis du restaurateur, du livreur ou d’un tiers, avec 403', async () => {
    const { orderId, ownerId, courierId } = await createDeliveredOrder({ deliveredAt })
    for (const authorId of [ownerId, courierId, await createAccount()]) {
      expect((await review(orderId, authorId, 5)).status).toBe(403)
    }
  })

  it('refuse un avis sur une commande pas encore livrée, avec 403', async () => {
    const { orderId, customerId } = await createPaidOrder()
    expect((await review(orderId, customerId, 5, { now: new Date().toISOString() })).status).toBe(403)
  })

  it('accepte un avis jusqu’à sept jours après la livraison, et le refuse ensuite avec 410', async () => {
    const late = await createDeliveredOrder({ deliveredAt })
    expect((await review(late.orderId, late.customerId, 4, { now: '2030-07-22T09:31:00.000Z' })).status).toBe(410)

    const onTime = await createDeliveredOrder({ deliveredAt })
    expect((await review(onTime.orderId, onTime.customerId, 4, { now: '2030-07-22T09:30:00.000Z' })).status).toBe(201)
  })
})

describe('la note d’un restaurant', { timeout: 60_000 }, () => {
  async function rated(ratings: number[]) {
    const first = await createDeliveredOrder({ deliveredAt })
    const restaurantId = first.restaurantId
    const orders = [first, ...(await Promise.all(ratings.slice(1).map(() => createDeliveredOrder({ restaurantId, deliveredAt }))))]
    for (const [index, rating] of ratings.entries()) {
      const order = orders[index]
      if (order) await review(order.orderId, order.customerId, rating)
    }
    return { restaurantId, orders }
  }

  it('reste cachée sous cinq avis, mais compte les avis', async () => {
    const { restaurantId } = await rated([5, 5, 4, 5])
    expect(await restaurantRating(restaurantId)).toEqual({ average: null, count: 4 })
  })

  it('fait la moyenne à partir de cinq avis, arrondie à un chiffre après la virgule', async () => {
    const { restaurantId } = await rated([5, 4, 4, 5, 3])
    expect(await restaurantRating(restaurantId)).toEqual({ average: 4.2, count: 5 })
  })

  it('montre les avis les plus récents d’abord, sans rien de leur auteur', async () => {
    const restaurant = await createDeliveredOrder({ deliveredAt })
    const second = await createDeliveredOrder({ restaurantId: restaurant.restaurantId, deliveredAt })
    await review(restaurant.orderId, restaurant.customerId, 3, { comment: 'Un peu froid.' })
    await review(second.orderId, second.customerId, 5, { comment: 'Parfait.' })

    const items = await restaurantReviews(restaurant.restaurantId)
    expect(items).toEqual([
      { rating: 5, comment: 'Parfait.', reply: null },
      { rating: 3, comment: 'Un peu froid.', reply: null },
    ])
    expect(Object.keys(items[0] ?? {}).join(' '), 'un avis ne dit pas qui l’a écrit').not.toMatch(
      /author|auteur|customer|client|name|nom|email|phone/i,
    )
  })
})

describe('la réponse du restaurant', () => {
  it('laisse le restaurateur répondre une fois, et montre la réponse sous l’avis', async () => {
    const { orderId, customerId, ownerId, restaurantId } = await createDeliveredOrder({ deliveredAt })
    await review(orderId, customerId, 2, { comment: 'Livré sans les couverts.' })

    expect((await replyToReview({ orderId, ownerId, body: '  ' })).status).toBe(400)
    expect((await replyToReview({ orderId, ownerId, body: 'Toutes nos excuses, nous avons revu nos sacs.' })).status).toBe(201)
    expect((await replyToReview({ orderId, ownerId, body: 'Encore' })).status).toBe(409)
    expect((await restaurantReviews(restaurantId))[0]?.reply).toBe('Toutes nos excuses, nous avons revu nos sacs.')
  })

  it('refuse la réponse à un autre compte avec 403, et sans avis avec 404', async () => {
    const { orderId, customerId, ownerId } = await createDeliveredOrder({ deliveredAt })
    expect((await replyToReview({ orderId, ownerId, body: 'Merci !' })).status, 'aucun avis encore').toBe(404)
    await review(orderId, customerId, 4)
    expect((await replyToReview({ orderId, ownerId: await createAccount({ roles: ['MERCHANT'] }), body: 'Merci !' })).status).toBe(403)
  })
})

describe('les pouces du livreur', { timeout: 60_000 }, () => {
  it('donnent une part de pouces levés, en pourcentage entier', async () => {
    const first = await createDeliveredOrder({ deliveredAt })
    const courierId = first.courierId
    const others = await Promise.all([1, 2].map(() => createDeliveredOrder({ courierId, deliveredAt })))
    await review(first.orderId, first.customerId, 5, { courierThumb: 'UP' })
    await review(others[0]?.orderId ?? '', others[0]?.customerId ?? '', 4, { courierThumb: 'UP' })
    await review(others[1]?.orderId ?? '', others[1]?.customerId ?? '', 2, { courierThumb: 'DOWN' })

    expect(await courierApproval(courierId)).toEqual({ count: 3, percent: 67 })
  })

  it('ne comptent que les avis qui donnent un pouce', async () => {
    const { orderId, customerId, courierId } = await createDeliveredOrder({ deliveredAt })
    await review(orderId, customerId, 4)
    expect(await courierApproval(courierId)).toEqual({ count: 0, percent: null })
  })
})
