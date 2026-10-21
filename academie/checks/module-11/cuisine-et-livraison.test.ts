/**
 * Module 11 : La cuisine et la livraison.
 *
 * Une commande payée arrive au restaurant. Le restaurateur l'accepte, ou la
 * refuse, et le client est alors remboursé. Acceptée, elle se prépare; un
 * livreur vérifié des environs la prend en charge, la récupère quand elle est
 * prête, et la remet au client contre le code de remise à quatre chiffres que
 * le client lui donne à la porte.
 *
 * Contrat attendu, exporté par `src/academie/module-11.ts` :
 *
 *   export function createAccount(input?: { ...ceux du module 6 }): Promise<string>
 *
 *   export function createPaidOrder(input?: {
 *     restaurantId?: string                    // par défaut un restaurant neuf…
 *     latitude?: number; longitude?: number    // …placé ici; par défaut le centre d'Antananarivo
 *     customerId?: string                      // par défaut un client neuf
 *   }): Promise<{
 *     orderId: string; customerId: string
 *     restaurantId: string; ownerId: string
 *     deliveryCode: string                     // quatre chiffres, que seul le client connaît
 *   }>                                         // une commande passée et payée (PLACED)
 *
 *   export function orderStatus(orderId: string): Promise<string>           // module 10
 *   export function cancelOrder(input: { orderId; customerId })            // module 10
 *   export function listRefunds(orderId: string)                           // module 10
 *
 *   export function restaurantQueue(input: { restaurantId: string; ownerId: string }): Promise<{
 *     status: number                           // 200, ou 403 pour un autre compte
 *     items: { orderId: string; status: string; lines: { name: string; quantity: number }[] }[]
 *   }>                                         // les commandes PLACED, ACCEPTED et READY
 *
 *   export function acceptOrder(input: { orderId: string; ownerId: string }): Promise<{ status: number }>
 *   export function rejectOrder(input: { orderId: string; ownerId: string; reason: string }): Promise<{ status: number }>
 *   export function markReady(input: { orderId: string; ownerId: string }): Promise<{ status: number }>
 *                                              // 200; 400 sans motif de refus; 403 pour un autre;
 *                                              // 409 si le passage est interdit
 *
 *   export function availableDeliveries(input: {
 *     courierId: string
 *     near: { latitude: number; longitude: number }   // la position du livreur
 *   }): Promise<{
 *     status: number                           // 200, ou 403 si ce n'est pas un livreur vérifié
 *     items: { orderId: string; restaurantName: string; distanceKm: number; deliveryFee: number }[]
 *   }>
 *
 *   export function claimDelivery(input: { orderId: string; courierId: string }):
 *     Promise<{ status: number; reason?: string }>   // 200; 403; 409 déjà prise, ou trop de courses
 *   export function assignedCourier(orderId: string): Promise<string | null>
 *   export function deliveryDetails(input: { orderId: string; courierId: string }): Promise<{
 *     status: number                           // 200 pour le livreur de la commande, 403 sinon
 *     address?: string; instructions?: string | null
 *   }>
 *   export function pickUp(input: { orderId: string; courierId: string }): Promise<{ status: number }>
 *   export function completeDelivery(input: { orderId: string; courierId: string; code: string }):
 *     Promise<{ status: number }>              // 200; 400 pour un mauvais code; 403; 409
 *
 * Les règles :
 *   - le restaurant ne voit dans sa file que les commandes payées, avec leurs
 *     plats; jamais l'adresse, le courriel ni le téléphone du client;
 *   - refuser une commande la rembourse en entier, une seule fois;
 *   - un livreur vérifié voit les commandes acceptées ou prêtes, sans livreur,
 *     des restaurants à 5 km de lui au plus, sans l'adresse du client;
 *   - un livreur prend une commande à la fois par commande, et porte deux
 *     commandes au plus en même temps : prises et pas encore livrées;
 *   - l'adresse du client n'est montrée qu'au livreur de la commande;
 *   - on ne récupère qu'une commande prête, et on ne la remet qu'avec le bon
 *     code.
 */
import { describe, expect, it } from 'vitest'
import {
  acceptOrder,
  assignedCourier,
  availableDeliveries,
  cancelOrder,
  claimDelivery,
  completeDelivery,
  createAccount,
  createPaidOrder,
  deliveryDetails,
  listRefunds,
  markReady,
  orderStatus,
  pickUp,
  rejectOrder,
  restaurantQueue,
} from '../../../src/academie/module-11'
import { north, somewhere } from '../_support/horaires'

function courier() {
  return createAccount({ name: 'Livreur', roles: ['CUSTOMER', 'COURIER'], courierStatus: 'APPROVED' })
}

/** Une commande payée et acceptée, dans un coin de l'île où personne d'autre n'essaie. */
async function accepted() {
  const spot = somewhere()
  const order = await createPaidOrder(spot)
  const result = await acceptOrder({ orderId: order.orderId, ownerId: order.ownerId })
  if (result.status !== 200) throw new Error(`acceptation refusée : ${result.status}`)
  return { ...order, spot }
}

async function claimedBy(courierId: string) {
  const order = await accepted()
  const result = await claimDelivery({ orderId: order.orderId, courierId })
  if (result.status !== 200) throw new Error(`prise en charge refusée : ${result.reason ?? result.status}`)
  return order
}

describe('la file du restaurant', () => {
  it('montre les commandes payées, avec leurs plats, sans rien du client', async () => {
    const { orderId, restaurantId, ownerId } = await createPaidOrder()
    const queue = await restaurantQueue({ restaurantId, ownerId })

    expect(queue.status).toBe(200)
    const item = queue.items.find((entry) => entry.orderId === orderId)
    expect(item?.status).toBe('PLACED')
    expect(item?.lines.length, 'la cuisine voit les plats à préparer').toBeGreaterThan(0)
    expect(JSON.stringify(queue), 'ni adresse ni contact du client en cuisine').not.toMatch(
      /address|adresse|email|courriel|phone|telephone|instructions/i,
    )
  })

  it('refuse la file à un autre compte, avec 403', async () => {
    const { restaurantId } = await createPaidOrder()
    const queue = await restaurantQueue({ restaurantId, ownerId: await createAccount({ roles: ['MERCHANT'] }) })
    expect(queue.status).toBe(403)
    expect(queue.items).toEqual([])
  })
})

describe('accepter, refuser, préparer', () => {
  it('accepte une commande, que le client ne peut plus annuler', async () => {
    const { orderId, ownerId, customerId } = await createPaidOrder()
    expect((await acceptOrder({ orderId, ownerId })).status).toBe(200)
    expect(await orderStatus(orderId)).toBe('ACCEPTED')

    expect((await cancelOrder({ orderId, customerId })).status, 'la cuisine a commencé').toBe(409)
    expect((await acceptOrder({ orderId, ownerId })).status, 'une seconde acceptation').toBe(409)
  })

  it('refuse à un autre restaurateur d’accepter, avec 403', async () => {
    const { orderId } = await createPaidOrder()
    const stranger = await createAccount({ roles: ['MERCHANT'] })
    expect((await acceptOrder({ orderId, ownerId: stranger })).status).toBe(403)
    expect(await orderStatus(orderId)).toBe('PLACED')
  })

  it('refuse une commande avec un motif, et rembourse le client une seule fois', async () => {
    const { orderId, ownerId } = await createPaidOrder()
    expect((await rejectOrder({ orderId, ownerId, reason: '  ' })).status, 'un refus sans motif').toBe(400)

    expect((await rejectOrder({ orderId, ownerId, reason: 'Plus de zébu ce soir' })).status).toBe(200)
    expect(await orderStatus(orderId)).toBe('REJECTED')
    expect((await rejectOrder({ orderId, ownerId, reason: 'Encore' })).status).toBe(409)
    expect(await listRefunds(orderId)).toHaveLength(1)
  })

  it('ne marque prête qu’une commande acceptée', async () => {
    const { orderId, ownerId } = await createPaidOrder()
    expect((await markReady({ orderId, ownerId })).status).toBe(409)
    await acceptOrder({ orderId, ownerId })
    expect((await markReady({ orderId, ownerId })).status).toBe(200)
    expect(await orderStatus(orderId)).toBe('READY')
  })
})

describe('les courses proposées aux livreurs', () => {
  it('montre à un livreur vérifié les commandes acceptées près de lui, sans l’adresse du client', async () => {
    const { orderId, spot } = await accepted()
    const courierId = await courier()
    const offers = await availableDeliveries({ courierId, near: north(2, spot) })

    expect(offers.status).toBe(200)
    const item = offers.items.find((entry) => entry.orderId === orderId)
    expect(item, 'une commande acceptée à 2 km doit être proposée').toBeDefined()
    expect(item?.restaurantName).toBeTruthy()
    expect(item?.distanceKm).toBeCloseTo(2, 0)
    expect(JSON.stringify(offers), 'l’adresse du client attend la prise en charge').not.toMatch(/Behoririka|address|adresse/i)
  })

  it('ne propose ni une commande trop loin, ni une commande pas encore acceptée', async () => {
    const far = await accepted()
    const spot = somewhere()
    const placed = await createPaidOrder(spot)
    const courierId = await courier()

    const fromFar = await availableDeliveries({ courierId, near: north(8, far.spot) })
    expect(fromFar.items.map((item) => item.orderId), 'une commande à 8 km').not.toContain(far.orderId)
    const nearPlaced = await availableDeliveries({ courierId, near: north(1, spot) })
    expect(nearPlaced.items.map((item) => item.orderId), 'une commande que la cuisine n’a pas acceptée').not.toContain(
      placed.orderId,
    )
  })

  it('refuse les courses à un livreur en attente de vérification, ou à un simple client, avec 403', async () => {
    const pending = await createAccount({ roles: ['CUSTOMER', 'COURIER'], courierStatus: 'PENDING' })
    const customer = await createAccount()
    for (const courierId of [pending, customer]) {
      const offers = await availableDeliveries({ courierId, near: north(1) })
      expect(offers.status).toBe(403)
      expect(offers.items).toEqual([])
      const { orderId } = await accepted()
      expect((await claimDelivery({ orderId, courierId })).status).toBe(403)
    }
  })
})

describe('prendre une course', () => {
  it('confie la commande à un seul livreur, et retire l’offre aux autres', async () => {
    const { orderId, spot } = await accepted()
    const first = await courier()
    const second = await courier()

    expect((await claimDelivery({ orderId, courierId: first })).status).toBe(200)
    expect(await assignedCourier(orderId)).toBe(first)
    expect((await claimDelivery({ orderId, courierId: second })).status, 'déjà prise').toBe(409)

    const offers = await availableDeliveries({ courierId: second, near: spot })
    expect(offers.items.map((item) => item.orderId)).not.toContain(orderId)
  })

  it('montre l’adresse au livreur de la commande, et à lui seul', async () => {
    const courierId = await courier()
    const { orderId } = await claimedBy(courierId)

    const details = await deliveryDetails({ orderId, courierId })
    expect(details.status).toBe(200)
    expect(details.address, 'le livreur a besoin de l’adresse').toBeTruthy()

    const other = await deliveryDetails({ orderId, courierId: await courier() })
    expect(other.status).toBe(403)
    expect(other.address).toBeUndefined()
  })

  it('refuse une troisième course à un livreur qui en porte déjà deux, avec 409 et un motif', async () => {
    const courierId = await courier()
    await claimedBy(courierId)
    await claimedBy(courierId)

    const { orderId } = await accepted()
    const third = await claimDelivery({ orderId, courierId })
    expect(third.status).toBe(409)
    expect(third.reason, 'le refus doit porter un motif lisible').toBeTruthy()
    expect(await assignedCourier(orderId)).toBeNull()
  })
})

describe('récupérer et remettre', () => {
  it('ne laisse récupérer qu’une commande prête, et par son livreur', async () => {
    const courierId = await courier()
    const { orderId, ownerId } = await claimedBy(courierId)

    expect((await pickUp({ orderId, courierId })).status, 'la cuisine n’a pas fini').toBe(409)
    await markReady({ orderId, ownerId })
    expect((await pickUp({ orderId, courierId: await courier() })).status, 'un autre livreur').toBe(403)
    expect((await pickUp({ orderId, courierId })).status).toBe(200)
    expect(await orderStatus(orderId)).toBe('PICKED_UP')
  })

  it('remet la commande contre le bon code, et libère le livreur', async () => {
    const courierId = await courier()
    const { orderId, ownerId, deliveryCode } = await claimedBy(courierId)
    await claimedBy(courierId)
    await markReady({ orderId, ownerId })
    await pickUp({ orderId, courierId })

    const wrong = deliveryCode === '0000' ? '1111' : '0000'
    expect((await completeDelivery({ orderId, courierId, code: wrong })).status).toBe(400)
    expect(await orderStatus(orderId), 'un mauvais code ne livre rien').toBe('PICKED_UP')

    expect((await completeDelivery({ orderId, courierId, code: deliveryCode })).status).toBe(200)
    expect(await orderStatus(orderId)).toBe('DELIVERED')

    const next = await accepted()
    expect((await claimDelivery({ orderId: next.orderId, courierId })).status, 'une course livrée ne compte plus').toBe(200)
  })

  it('refuse de remettre une commande qui n’a pas été récupérée, avec 409', async () => {
    const courierId = await courier()
    const { orderId, deliveryCode } = await claimedBy(courierId)
    expect((await completeDelivery({ orderId, courierId, code: deliveryCode })).status).toBe(409)
  })
})
