/**
 * Module 13 : Le suivi en temps réel.
 *
 * Le client suit sa commande sans recharger la page : acceptée, en cuisine,
 * prête, en route, livrée. Une fois la commande en route, il voit le livreur
 * avancer sur la carte. Deux règles font la différence entre un suivi et une
 * fuite de données :
 *
 * - seuls le client, le restaurateur et le livreur de la commande la suivent,
 *   et le serveur le vérifie à chaque lecture et à chaque abonnement;
 * - la position du livreur n'est montrée qu'au client, et seulement pendant
 *   que la commande est en route : ni avant qu'il ait récupéré le repas, ni
 *   après la remise. Le reste du temps, elle dirait où il habite et où il va.
 *
 * Contrat attendu, exporté par `src/academie/module-13.ts` :
 *
 *   export function createAccount(input?: { ...ceux du module 6 }): Promise<string>
 *   export function createPaidOrder(input?: { ...ceux du module 11 })
 *   export function acceptOrder, markReady, claimDelivery, pickUp, completeDelivery   // module 11
 *
 *   export function reportPosition(input: {
 *     courierId: string; latitude: number; longitude: number
 *   }): Promise<{ status: number }>   // 200, ou 403 si ce n'est pas un livreur vérifié
 *
 *   export function trackOrder(input: { orderId: string; viewerId: string }): Promise<{
 *     status: number                  // 200, ou 403 pour un tiers
 *     order?: {
 *       status: string                // le statut de la commande : 'ACCEPTED', 'PICKED_UP'…
 *       courierPosition: { latitude: number; longitude: number } | null
 *     }
 *   }>
 *
 *   export type TrackingEvent =
 *     | { seq: number; type: 'STATUS'; status: string }
 *     | { seq: number; type: 'POSITION'; latitude: number; longitude: number }
 *
 *   export function subscribe(input: {
 *     orderId: string; viewerId: string
 *     onEvent: (event: TrackingEvent) => void
 *   }): Promise<{ status: number; unsubscribe: () => void }>
 *
 *   export function applyEvent(
 *     state: { seq: number; status: string; courierPosition: { latitude: number; longitude: number } | null },
 *     event: TrackingEvent,
 *   ): typeof state
 *
 * Chaque événement d'une commande porte un numéro, `seq`, qui augmente. Un
 * changement de statut envoie un événement STATUS au client, au restaurateur
 * et au livreur abonnés. Une position envoie un événement POSITION au seul
 * client, et seulement quand la commande est en route.
 *
 * `applyEvent` est ce que l'interface fait d'un événement reçu : elle ignore un
 * numéro déjà appliqué ou plus ancien, et applique un événement plus récent.
 * Après une coupure, l'interface relit `trackOrder`, puis reprend les
 * événements. Un abonnement refusé rend quand même une fonction `unsubscribe`,
 * qui ne fait rien.
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  acceptOrder,
  applyEvent,
  claimDelivery,
  completeDelivery,
  createAccount,
  createPaidOrder,
  markReady,
  pickUp,
  reportPosition,
  subscribe,
  trackOrder,
  type TrackingEvent,
} from '../../../src/academie/module-13'
import { somewhere } from '../_support/horaires'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

function courier() {
  return createAccount({ name: 'Livreur', roles: ['CUSTOMER', 'COURIER'], courierStatus: 'APPROVED' })
}

/** Une commande acceptée et confiée à un livreur. */
async function onItsWay(step: 'claimed' | 'picked' = 'claimed') {
  const order = await createPaidOrder(somewhere())
  await acceptOrder({ orderId: order.orderId, ownerId: order.ownerId })
  const courierId = await courier()
  await claimDelivery({ orderId: order.orderId, courierId })
  if (step === 'picked') {
    await markReady({ orderId: order.orderId, ownerId: order.ownerId })
    await pickUp({ orderId: order.orderId, courierId })
  }
  return { ...order, courierId }
}

/** Enregistre les événements reçus par un abonné. */
async function listen(orderId: string, viewerId: string) {
  const events: TrackingEvent[] = []
  const subscription = await subscribe({ orderId, viewerId, onEvent: (event) => events.push(event) })
  cleanups.push(subscription.unsubscribe)
  // Laisse le temps à l'abonnement d'être en place.
  await new Promise((resolveWait) => setTimeout(resolveWait, 100))
  return { status: subscription.status, events }
}

/** Attend qu'une condition soit vraie, ou échoue au bout de trois secondes. */
async function eventually(check: () => boolean, message: string) {
  const deadline = Date.now() + 3_000
  while (!check()) {
    if (Date.now() > deadline) throw new Error(message)
    await new Promise((resolveWait) => setTimeout(resolveWait, 25))
  }
}

describe('qui suit une commande', () => {
  it('ouvre le suivi au client, au restaurateur et au livreur de la commande', async () => {
    const { orderId, customerId, ownerId, courierId } = await onItsWay()
    for (const viewerId of [customerId, ownerId, courierId]) {
      const tracked = await trackOrder({ orderId, viewerId })
      expect(tracked.status).toBe(200)
      expect(tracked.order?.status).toBe('ACCEPTED')
    }
  })

  it('refuse le suivi et l’abonnement à un tiers, et à un autre livreur, avec 403', async () => {
    const { orderId } = await onItsWay()
    for (const viewerId of [await createAccount(), await courier()]) {
      const tracked = await trackOrder({ orderId, viewerId })
      expect(tracked.status).toBe(403)
      expect(tracked.order).toBeUndefined()
      expect((await listen(orderId, viewerId)).status).toBe(403)
    }
  })
})

describe('les changements de statut, en temps réel', () => {
  it('préviennent le client dès que le restaurant accepte, puis quand la commande est prête', async () => {
    const { orderId, customerId, ownerId } = await createPaidOrder(somewhere())
    const client = await listen(orderId, customerId)
    expect(client.status).toBe(200)

    await acceptOrder({ orderId, ownerId })
    await markReady({ orderId, ownerId })
    await eventually(() => client.events.filter((event) => event.type === 'STATUS').length >= 2, 'aucun statut reçu en 3 s')

    const statuses = client.events.filter((event) => event.type === 'STATUS')
    expect(statuses.map((event) => (event.type === 'STATUS' ? event.status : ''))).toEqual(['ACCEPTED', 'READY'])
    expect(statuses[1]?.seq ?? 0, 'les numéros augmentent').toBeGreaterThan(statuses[0]?.seq ?? 0)
  })

  it('préviennent aussi le restaurateur', async () => {
    const { orderId, ownerId } = await createPaidOrder(somewhere())
    const kitchen = await listen(orderId, ownerId)
    await acceptOrder({ orderId, ownerId })
    await eventually(() => kitchen.events.some((event) => event.type === 'STATUS'), 'le restaurateur n’a rien reçu en 3 s')
  })
})

describe('la position du livreur', () => {
  it('reste cachée tant que le livreur n’a pas récupéré la commande', async () => {
    const { orderId, customerId, courierId } = await onItsWay('claimed')
    expect((await reportPosition({ courierId, latitude: -18.9, longitude: 47.52 })).status).toBe(200)

    expect((await trackOrder({ orderId, viewerId: customerId })).order?.courierPosition).toBeNull()
  })

  it('se montre au client pendant que la commande est en route, et à lui seul', async () => {
    const { orderId, customerId, ownerId, courierId } = await onItsWay('picked')
    await reportPosition({ courierId, latitude: -18.9012, longitude: 47.5234 })

    const forCustomer = await trackOrder({ orderId, viewerId: customerId })
    expect(forCustomer.order?.status).toBe('PICKED_UP')
    expect(forCustomer.order?.courierPosition).toEqual({ latitude: -18.9012, longitude: 47.5234 })
    expect((await trackOrder({ orderId, viewerId: ownerId })).order?.courierPosition, 'le restaurant n’en a pas besoin').toBeNull()
  })

  it('arrive en temps réel chez le client, pas chez le restaurateur', async () => {
    const { orderId, customerId, ownerId, courierId } = await onItsWay('picked')
    const client = await listen(orderId, customerId)
    const kitchen = await listen(orderId, ownerId)

    await reportPosition({ courierId, latitude: -18.905, longitude: 47.53 })
    await eventually(() => client.events.some((event) => event.type === 'POSITION'), 'aucune position reçue en 3 s')
    const position = client.events.find((event) => event.type === 'POSITION')
    expect(position).toMatchObject({ type: 'POSITION', latitude: -18.905, longitude: 47.53 })

    await new Promise((resolveWait) => setTimeout(resolveWait, 300))
    expect(kitchen.events.filter((event) => event.type === 'POSITION')).toEqual([])
  })

  it('disparaît une fois la commande livrée', async () => {
    const { orderId, customerId, courierId, deliveryCode } = await onItsWay('picked')
    await reportPosition({ courierId, latitude: -18.9, longitude: 47.52 })
    await completeDelivery({ orderId, courierId, code: deliveryCode })

    const tracked = await trackOrder({ orderId, viewerId: customerId })
    expect(tracked.order?.status).toBe('DELIVERED')
    expect(tracked.order?.courierPosition).toBeNull()
  })

  it('refuse une position envoyée par un compte qui n’est pas livreur, avec 403', async () => {
    expect((await reportPosition({ courierId: await createAccount(), latitude: -18.9, longitude: 47.5 })).status).toBe(403)
  })
})

describe('reprendre après une coupure', () => {
  const start = { seq: 4, status: 'PICKED_UP', courierPosition: { latitude: -18.9, longitude: 47.5 } }

  it('applique un événement plus récent', () => {
    expect(applyEvent(start, { seq: 5, type: 'POSITION', latitude: -18.91, longitude: 47.51 })).toEqual({
      seq: 5,
      status: 'PICKED_UP',
      courierPosition: { latitude: -18.91, longitude: 47.51 },
    })
    expect(applyEvent(start, { seq: 5, type: 'STATUS', status: 'DELIVERED' })).toMatchObject({ seq: 5, status: 'DELIVERED' })
  })

  it('ignore un événement déjà appliqué, ou plus ancien', () => {
    expect(applyEvent(start, { seq: 4, type: 'POSITION', latitude: 0, longitude: 0 })).toEqual(start)
    expect(applyEvent(start, { seq: 2, type: 'STATUS', status: 'ACCEPTED' })).toEqual(start)
  })
})
