/**
 * Module 10 : Le paiement par Mobile Money, et le remboursement.
 *
 * Le client paie sa commande. Payée, elle part au restaurant (PLACED). Il peut
 * encore l'annuler tant que le restaurant ne l'a pas acceptée : si elle était
 * payée, il est remboursé en entier.
 *
 * Le prestataire de paiement est simulé : vous l'écrivez vous-même, dans votre
 * API. Il confirme les paiements et signe ses webhooks comme le ferait un vrai
 * prestataire de Mobile Money. Aucun compte chez un prestataire n'est
 * nécessaire, et aucune carte bancaire.
 *
 * Contrat attendu, exporté par `src/academie/module-10.ts` :
 *
 *   export function createAccount(input?: { ...ceux du module 6 }): Promise<string>
 *
 *   export function createOrder(input?: {
 *     customerId?: string          // par défaut un client neuf
 *   }): Promise<{
 *     orderId: string; customerId: string
 *     restaurantId: string; ownerId: string
 *     total: number
 *   }>                             // une commande en attente de paiement, passée par placeOrder
 *                                  // chez un restaurant neuf, ouvert à toute heure
 *
 *   export function capturePayment(input: {
 *     orderId: string; customerId: string
 *     amount: number; idempotencyKey: string
 *   }): Promise<{
 *     status: number               // 201, ou 200 pour une clé déjà vue;
 *                                  // 400 si le montant n'est pas le total de la commande;
 *                                  // 403 si ce n'est pas le client;
 *                                  // 409 si la commande n'attend plus de paiement
 *     chargeId?: string
 *   }>
 *
 *   export function listCharges(orderId: string): Promise<{ chargeId: string; amount: number }[]>
 *   export function listRefunds(orderId: string): Promise<{ refundId: string; amount: number }[]>
 *   export function orderStatus(orderId: string): Promise<string>
 *
 *   export function cancelOrder(input: { orderId: string; customerId: string }):
 *     Promise<{ status: number }>  // 200; 403 pour un autre compte; 409 si elle n'est plus annulable
 *
 *   export function signWebhook(payload: string): string
 *   export function handleWebhook(input: {
 *     payload: string; signature: string
 *   }): Promise<{ status: number }>
 *
 * `signWebhook` n'existe que pour permettre à cette suite de fabriquer une
 * signature valide. Votre serveur, lui, vérifie celle du prestataire.
 *
 * Un événement porte `{ id, type, orderId, customerId, amount, idempotencyKey,
 * paidAt }`. Un événement `payment.succeeded` correctement signé enregistre le
 * débit sous sa clé d'idempotence, exactement comme `capturePayment`. Un débit
 * déjà enregistré sous cette clé ne se dédouble pas. Un paiement qui arrive
 * pour une commande déjà annulée est enregistré, puis remboursé aussitôt : la
 * commande reste annulée.
 */
import { describe, expect, it } from 'vitest'
import {
  cancelOrder,
  capturePayment,
  createAccount,
  createOrder,
  handleWebhook,
  listCharges,
  listRefunds,
  orderStatus,
  signWebhook,
} from '../../../src/academie/module-10'

async function order() {
  return createOrder()
}

function pay(orderId: string, customerId: string, amount: number, key = `${orderId}-1`) {
  return capturePayment({ orderId, customerId, amount, idempotencyKey: key })
}

describe('l’encaissement', () => {
  it('débite une fois le total, et transmet la commande au restaurant', async () => {
    const { orderId, customerId, total } = await order()
    const charge = await pay(orderId, customerId, total)

    expect(charge.status).toBe(201)
    expect(charge.chargeId, 'un débit porte un identifiant').toBeTruthy()
    expect(await listCharges(orderId)).toEqual([{ chargeId: charge.chargeId, amount: total }])
    expect(await orderStatus(orderId)).toBe('PLACED')
  })

  // Un appel réseau qui échoue ne veut pas dire que rien ne s'est passé.
  it('ne double pas le débit quand la même clé est rejouée', async () => {
    const { orderId, customerId, total } = await order()
    const first = await pay(orderId, customerId, total)
    const replay = await pay(orderId, customerId, total)

    expect(replay.status).toBe(200)
    expect(replay.chargeId).toBe(first.chargeId)
    expect(await listCharges(orderId)).toHaveLength(1)
  })

  it('ne double pas le débit sous appels simultanés', async () => {
    const { orderId, customerId, total } = await order()
    await Promise.all(Array.from({ length: 4 }, () => pay(orderId, customerId, total)))
    expect(await listCharges(orderId)).toHaveLength(1)
  })

  it('refuse de faire payer deux fois la même commande sous une autre clé, avec 409', async () => {
    const { orderId, customerId, total } = await order()
    await pay(orderId, customerId, total)
    expect((await pay(orderId, customerId, total, `${orderId}-2`)).status).toBe(409)
    expect(await listCharges(orderId)).toHaveLength(1)
  })

  // Le montant vient de la commande, pas du navigateur.
  it('refuse un montant qui n’est pas le total, avec 400', async () => {
    const { orderId, customerId, total } = await order()
    expect((await pay(orderId, customerId, total - 1_000)).status).toBe(400)
    expect(await listCharges(orderId)).toEqual([])
    expect(await orderStatus(orderId)).toBe('PENDING_PAYMENT')
  })

  it('refuse de payer la commande d’un autre, avec 403', async () => {
    const { orderId, total } = await order()
    expect((await pay(orderId, await createAccount(), total)).status).toBe(403)
    expect(await listCharges(orderId)).toEqual([])
  })
})

describe('l’annulation et le remboursement', () => {
  it('annule une commande impayée, sans rien rembourser', async () => {
    const { orderId, customerId, total } = await order()
    expect((await cancelOrder({ orderId, customerId })).status).toBe(200)
    expect(await orderStatus(orderId)).toBe('CANCELLED')
    expect(await listRefunds(orderId)).toEqual([])

    expect((await pay(orderId, customerId, total)).status, 'une commande annulée ne se paie plus').toBe(409)
  })

  it('rembourse en entier une commande payée que le client annule', async () => {
    const { orderId, customerId, total } = await order()
    await pay(orderId, customerId, total)

    expect((await cancelOrder({ orderId, customerId })).status).toBe(200)
    expect(await orderStatus(orderId)).toBe('CANCELLED')
    const refunds = await listRefunds(orderId)
    expect(refunds.map((refund) => refund.amount)).toEqual([total])
    expect(refunds[0]?.refundId, 'un remboursement porte un identifiant').toBeTruthy()
  })

  it('ne rembourse qu’une fois, et refuse une seconde annulation avec 409', async () => {
    const { orderId, customerId, total } = await order()
    await pay(orderId, customerId, total)
    await cancelOrder({ orderId, customerId })

    expect((await cancelOrder({ orderId, customerId })).status).toBe(409)
    expect(await listRefunds(orderId)).toHaveLength(1)
  })

  it('refuse l’annulation à un autre compte, avec 403', async () => {
    const { orderId } = await order()
    expect((await cancelOrder({ orderId, customerId: await createAccount() })).status).toBe(403)
    expect(await orderStatus(orderId)).toBe('PENDING_PAYMENT')
  })
})

describe('les webhooks du prestataire', () => {
  function event(id: string, orderId: string, customerId: string, amount: number, key = `${orderId}-1`) {
    return JSON.stringify({
      id,
      type: 'payment.succeeded',
      orderId,
      customerId,
      amount,
      idempotencyKey: key,
      paidAt: new Date().toISOString(),
    })
  }

  it('refuse un événement dont la signature est invalide', async () => {
    const { orderId, customerId, total } = await order()
    const response = await handleWebhook({ payload: event(`evt-${orderId}`, orderId, customerId, total), signature: 'inventee' })

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.status).toBeLessThan(500)
    expect(await listCharges(orderId)).toEqual([])
    expect(await orderStatus(orderId)).toBe('PENDING_PAYMENT')
  })

  it('enregistre le débit et transmet la commande pour un événement correctement signé', async () => {
    const { orderId, customerId, total } = await order()
    const payload = event(`evt-${orderId}`, orderId, customerId, total)
    const response = await handleWebhook({ payload, signature: signWebhook(payload) })

    expect(response.status).toBeGreaterThanOrEqual(200)
    expect(response.status).toBeLessThan(300)
    expect(await listCharges(orderId)).toHaveLength(1)
    expect(await orderStatus(orderId)).toBe('PLACED')
  })

  // Un prestataire redélivre ses événements : c'est normal, pas une anomalie.
  it('absorbe la redélivrance du même événement sans second effet', async () => {
    const { orderId, customerId, total } = await order()
    const payload = event(`evt-${orderId}`, orderId, customerId, total)
    const signature = signWebhook(payload)
    await handleWebhook({ payload, signature })
    await handleWebhook({ payload, signature })

    expect(await listCharges(orderId)).toHaveLength(1)
  })

  it('ne dédouble pas un paiement déjà encaissé sous la même clé', async () => {
    const { orderId, customerId, total } = await order()
    await pay(orderId, customerId, total)
    const payload = event(`evt-${orderId}`, orderId, customerId, total)
    await handleWebhook({ payload, signature: signWebhook(payload) })

    expect(await listCharges(orderId)).toHaveLength(1)
  })

  // Le client a annulé pendant que l'opérateur traitait son paiement.
  it('rembourse aussitôt un paiement arrivé après l’annulation', async () => {
    const { orderId, customerId, total } = await order()
    await cancelOrder({ orderId, customerId })
    const payload = event(`evt-${orderId}`, orderId, customerId, total)
    const response = await handleWebhook({ payload, signature: signWebhook(payload) })

    expect(response.status).toBeLessThan(300)
    expect(await listCharges(orderId)).toHaveLength(1)
    expect((await listRefunds(orderId)).map((refund) => refund.amount)).toEqual([total])
    expect(await orderStatus(orderId), 'un paiement tardif ne réveille pas la commande').toBe('CANCELLED')
  })
})
