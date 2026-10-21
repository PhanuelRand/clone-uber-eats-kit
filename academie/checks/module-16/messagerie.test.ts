/**
 * Module 16 : La messagerie entre le client et le livreur. Module Platine.
 *
 * « Je suis devant le portail vert », « Le code est au deuxième étage » : le
 * client et le livreur se parlent pendant la course, sans jamais échanger leurs
 * numéros. La conversation s'ouvre quand un livreur prend la commande, et se
 * ferme une heure après la remise. Trois règles :
 *
 * - seuls le client et le livreur de la commande lisent et écrivent, et le
 *   serveur le vérifie à chaque lecture, à chaque envoi et à chaque abonnement;
 * - un numéro de téléphone écrit dans un message est masqué avant d'être
 *   rangé : la messagerie remplace l'échange de numéros, elle ne le permet pas;
 * - soixante minutes après la remise, on ne peut plus écrire : l'historique se
 *   relit, mais la conversation est close.
 *
 * Contrat attendu, exporté par `src/academie/module-16.ts` :
 *
 *   export function createAccount(input?: { ...ceux du module 6 }): Promise<string>
 *   export function createPaidOrder(input?: { ...ceux du module 11 })
 *   export function acceptOrder, markReady, claimDelivery, pickUp, completeDelivery   // module 11
 *
 *   export function openChat(input: { orderId: string; memberId: string }): Promise<{
 *     status: number               // 201, ou 200 si elle existe déjà; 403 pour un tiers;
 *                                  // 409 tant qu'aucun livreur n'a pris la commande
 *     conversationId?: string      // la même pour le client et pour le livreur
 *   }>
 *
 *   export function sendMessage(input: {
 *     conversationId: string; senderId: string; body: string
 *     now: string                  // un instant ISO 8601
 *   }): Promise<{ status: number }>   // 201; 400 vide ou de plus de 500 caractères;
 *                                     // 403 pour un tiers; 410 conversation close
 *
 *   export function readConversation(input: { conversationId: string; readerId: string }): Promise<{
 *     status: number
 *     messages: { senderId: string; body: string }[]   // dans l'ordre d'envoi
 *   }>
 *
 *   export function subscribe(input: {
 *     conversationId: string; readerId: string
 *     onMessage: (message: { senderId: string; body: string }) => void
 *   }): Promise<{ status: number; unsubscribe: () => void }>
 *
 * Un numéro masqué devient le texte « [numéro masqué] ». Sont masqués les
 * numéros de téléphone mobile de Madagascar, sous toutes les écritures du
 * module 4 : « 034 12 345 67 », « 0341234567 », « +261 34 12 345 67 ».
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  acceptOrder,
  claimDelivery,
  completeDelivery,
  createAccount,
  createPaidOrder,
  markReady,
  openChat,
  pickUp,
  readConversation,
  sendMessage,
  subscribe,
} from '../../../src/academie/module-16'
import { somewhere } from '../_support/horaires'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

function courier() {
  return createAccount({ name: 'Livreur', roles: ['CUSTOMER', 'COURIER'], courierStatus: 'APPROVED' })
}

function inMinutes(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString()
}

/** Une commande prise par un livreur, et la conversation ouverte par le client. */
async function chat() {
  const order = await createPaidOrder(somewhere())
  await acceptOrder({ orderId: order.orderId, ownerId: order.ownerId })
  const courierId = await courier()
  await claimDelivery({ orderId: order.orderId, courierId })
  const opened = await openChat({ orderId: order.orderId, memberId: order.customerId })
  if (!opened.conversationId) throw new Error(`conversation refusée : ${opened.status}`)
  return { ...order, courierId, conversationId: opened.conversationId }
}

describe('ouvrir la conversation', () => {
  it('attend qu’un livreur ait pris la commande', async () => {
    const order = await createPaidOrder(somewhere())
    expect((await openChat({ orderId: order.orderId, memberId: order.customerId })).status).toBe(409)
  })

  it('ouvre une seule conversation, la même pour le client et le livreur', async () => {
    const { orderId, customerId, courierId, conversationId } = await chat()
    const again = await openChat({ orderId, memberId: customerId })
    const forCourier = await openChat({ orderId, memberId: courierId })

    expect(again.status).toBe(200)
    expect(again.conversationId).toBe(conversationId)
    expect(forCourier.conversationId).toBe(conversationId)
  })

  it('refuse la conversation au restaurateur, à un tiers et à un autre livreur, avec 403', async () => {
    const { orderId, ownerId } = await chat()
    for (const memberId of [ownerId, await createAccount(), await courier()]) {
      expect((await openChat({ orderId, memberId })).status).toBe(403)
    }
  })
})

describe('entre le client et le livreur', () => {
  it('rend les messages aux deux, dans l’ordre d’envoi', async () => {
    const { conversationId, customerId, courierId } = await chat()
    expect((await sendMessage({ conversationId, senderId: courierId, body: 'Je suis devant le portail.', now: inMinutes(0) })).status).toBe(201)
    await sendMessage({ conversationId, senderId: customerId, body: 'J’arrive, deux minutes.', now: inMinutes(0) })

    for (const readerId of [customerId, courierId]) {
      const result = await readConversation({ conversationId, readerId })
      expect(result.status).toBe(200)
      expect(result.messages).toEqual([
        { senderId: courierId, body: 'Je suis devant le portail.' },
        { senderId: customerId, body: 'J’arrive, deux minutes.' },
      ])
    }
  })

  it('refuse un message vide, ou de plus de 500 caractères, avec 400', async () => {
    const { conversationId, customerId } = await chat()
    expect((await sendMessage({ conversationId, senderId: customerId, body: '  ', now: inMinutes(0) })).status).toBe(400)
    expect((await sendMessage({ conversationId, senderId: customerId, body: 'a'.repeat(501), now: inMinutes(0) })).status).toBe(400)
    expect((await readConversation({ conversationId, readerId: customerId })).messages).toEqual([])
  })

  it('diffuse un message à l’autre dès son envoi', async () => {
    const { conversationId, customerId, courierId } = await chat()
    const received = new Promise<{ senderId: string; body: string }>((resolveMessage, reject) => {
      const timer = setTimeout(() => reject(new Error('aucun message reçu en 3 s')), 3_000)
      void subscribe({
        conversationId,
        readerId: customerId,
        onMessage: (message) => {
          clearTimeout(timer)
          resolveMessage(message)
        },
      }).then((subscription) => cleanups.push(subscription.unsubscribe))
    })
    await new Promise((resolveWait) => setTimeout(resolveWait, 100))

    await sendMessage({ conversationId, senderId: courierId, body: 'Je suis en bas.', now: inMinutes(0) })
    expect((await received).body).toBe('Je suis en bas.')
  })
})

describe('les numéros de téléphone', () => {
  it('masque un numéro écrit dans un message, sous toutes ses écritures', async () => {
    const { conversationId, customerId } = await chat()
    for (const body of [
      'Appelez-moi au 034 12 345 67 en arrivant',
      'Mon numéro : 0341234567',
      'Sinon le +261 34 12 345 67',
    ]) {
      expect((await sendMessage({ conversationId, senderId: customerId, body, now: inMinutes(0) })).status).toBe(201)
    }

    const messages = (await readConversation({ conversationId, readerId: customerId })).messages
    for (const message of messages) {
      expect(message.body, 'le numéro ne doit pas être rangé').not.toMatch(/12\s?345\s?67|1234567/)
      expect(message.body).toContain('[numéro masqué]')
    }
    expect(messages[0]?.body).toBe('Appelez-moi au [numéro masqué] en arrivant')
  })

  it('laisse passer les autres nombres', async () => {
    const { conversationId, customerId } = await chat()
    await sendMessage({ conversationId, senderId: customerId, body: 'Lot IVG 45, porte 12, code 2024', now: inMinutes(0) })
    expect((await readConversation({ conversationId, readerId: customerId })).messages[0]?.body).toBe('Lot IVG 45, porte 12, code 2024')
  })
})

describe('fermée aux tiers', () => {
  it('refuse la lecture, l’envoi et l’abonnement à un tiers, avec 403', async () => {
    const { conversationId, customerId } = await chat()
    await sendMessage({ conversationId, senderId: customerId, body: 'Deuxième étage, à gauche.', now: inMinutes(0) })
    const stranger = await createAccount()

    const read = await readConversation({ conversationId, readerId: stranger })
    expect(read.status).toBe(403)
    expect(read.messages).toEqual([])
    expect((await sendMessage({ conversationId, senderId: stranger, body: 'Intrus', now: inMinutes(0) })).status).toBe(403)
    const subscription = await subscribe({ conversationId, readerId: stranger, onMessage: () => undefined })
    cleanups.push(subscription.unsubscribe)
    expect(subscription.status).toBe(403)
  })
})

describe('la fin de la conversation', () => {
  async function delivered() {
    const conversation = await chat()
    await markReady({ orderId: conversation.orderId, ownerId: conversation.ownerId })
    await pickUp({ orderId: conversation.orderId, courierId: conversation.courierId })
    await completeDelivery({ orderId: conversation.orderId, courierId: conversation.courierId, code: conversation.deliveryCode })
    return conversation
  }

  it('reste ouverte pendant l’heure qui suit la remise', async () => {
    const { conversationId, customerId } = await delivered()
    expect((await sendMessage({ conversationId, senderId: customerId, body: 'Merci, tout est bien arrivé.', now: inMinutes(59) })).status).toBe(201)
  })

  it('se ferme soixante minutes après la remise, avec 410, mais se relit encore', async () => {
    const { conversationId, customerId, courierId } = await delivered()
    await sendMessage({ conversationId, senderId: courierId, body: 'Bon appétit.', now: inMinutes(1) })

    expect((await sendMessage({ conversationId, senderId: customerId, body: 'Encore là ?', now: inMinutes(61) })).status).toBe(410)
    const read = await readConversation({ conversationId, readerId: customerId })
    expect(read.status).toBe(200)
    expect(read.messages.map((message) => message.body)).toEqual(['Bon appétit.'])
  })
})
