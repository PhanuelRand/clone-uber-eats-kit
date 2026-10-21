/**
 * Module 2 : Architecture, le cycle de vie d'une commande.
 *
 * Suite de conformité écrite par l'Académie. Elle appelle VOTRE code à travers
 * le fichier traducteur du module. Ces fichiers font partie du harnais : les
 * modifier confie votre remise à un mentor.
 *
 * Contrat attendu, exporté par `src/academie/module-2.ts` :
 *
 *   export type OrderStatus =
 *     | 'PENDING_PAYMENT' | 'PLACED' | 'ACCEPTED' | 'READY'
 *     | 'PICKED_UP' | 'DELIVERED' | 'REJECTED' | 'CANCELLED'
 *
 *   export class Order {
 *     static place(input: {
 *       customerId: string
 *       restaurantId: string
 *       lines: { dishId: string; unitPrice: number; quantity: number }[]
 *       deliveryFee: number
 *     }): Order                    // lève si la commande n'est pas valide (voir montants.test.ts)
 *     readonly status: OrderStatus
 *     readonly subtotal: number
 *     readonly serviceFee: number
 *     readonly total: number
 *     transitionTo(next: OrderStatus): void   // lève si le passage est interdit
 *   }
 *
 * Une commande naît en attente de paiement (PENDING_PAYMENT). Payée, elle est
 * transmise au restaurant (PLACED), qui l'accepte (ACCEPTED) ou la refuse
 * (REJECTED). Le client peut l'annuler (CANCELLED) tant que le restaurant ne
 * l'a pas acceptée. Acceptée, elle se prépare jusqu'à être prête (READY), puis
 * le livreur la récupère (PICKED_UP) et la livre (DELIVERED).
 *
 *   PENDING_PAYMENT -> PLACED, CANCELLED
 *   PLACED          -> ACCEPTED, REJECTED, CANCELLED
 *   ACCEPTED        -> READY
 *   READY           -> PICKED_UP
 *   PICKED_UP       -> DELIVERED
 *   DELIVERED, REJECTED, CANCELLED -> rien
 *
 * Tout autre passage lève une erreur, y compris rester dans le même statut.
 */
import { describe, expect, it } from 'vitest'
import { Order } from '../../../src/academie/module-2'

const customer = '11111111-1111-4111-8111-111111111111'
const restaurant = '22222222-2222-4222-8222-222222222222'

function placed() {
  return Order.place({
    customerId: customer,
    restaurantId: restaurant,
    lines: [{ dishId: 'romazava', unitPrice: 12_000, quantity: 2 }],
    deliveryFee: 2_000,
  })
}

function advanceTo(order: Order, steps: string[]) {
  for (const step of steps) order.transitionTo(step as never)
  return order
}

const ALLOWED: Record<string, string[]> = {
  PENDING_PAYMENT: ['PLACED', 'CANCELLED'],
  PLACED: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['READY'],
  READY: ['PICKED_UP'],
  PICKED_UP: ['DELIVERED'],
  DELIVERED: [],
  REJECTED: [],
  CANCELLED: [],
}

/** Le chemin le plus court pour amener une commande neuve à ce statut. */
const PATH_TO: Record<string, string[]> = {
  PENDING_PAYMENT: [],
  PLACED: ['PLACED'],
  ACCEPTED: ['PLACED', 'ACCEPTED'],
  READY: ['PLACED', 'ACCEPTED', 'READY'],
  PICKED_UP: ['PLACED', 'ACCEPTED', 'READY', 'PICKED_UP'],
  DELIVERED: ['PLACED', 'ACCEPTED', 'READY', 'PICKED_UP', 'DELIVERED'],
  REJECTED: ['PLACED', 'REJECTED'],
  CANCELLED: ['CANCELLED'],
}

const STATUSES = Object.keys(ALLOWED)

describe('cycle de vie d’une commande', () => {
  it('naît en attente de paiement', () => {
    expect(placed().status).toBe('PENDING_PAYMENT')
  })

  it('va du paiement jusqu’à la livraison', () => {
    const order = advanceTo(placed(), ['PLACED', 'ACCEPTED', 'READY', 'PICKED_UP', 'DELIVERED'])
    expect(order.status).toBe('DELIVERED')
  })

  it('se laisse refuser par le restaurant une fois payée', () => {
    expect(advanceTo(placed(), ['PLACED', 'REJECTED']).status).toBe('REJECTED')
  })

  it('se laisse annuler avant le paiement, et avant que le restaurant l’accepte', () => {
    expect(advanceTo(placed(), ['CANCELLED']).status).toBe('CANCELLED')
    expect(advanceTo(placed(), ['PLACED', 'CANCELLED']).status).toBe('CANCELLED')
  })

  // Le restaurant a commencé à cuisiner : on ne revient plus en arrière.
  it('refuse d’annuler une commande acceptée', () => {
    const order = advanceTo(placed(), ['PLACED', 'ACCEPTED'])
    expect(() => order.transitionTo('CANCELLED' as never)).toThrow()
  })

  it('refuse de transmettre au restaurant une commande impayée qu’on accepterait directement', () => {
    expect(() => placed().transitionTo('ACCEPTED' as never)).toThrow()
  })

  it('ne laisse rien sortir d’une commande livrée', () => {
    for (const next of STATUSES) {
      const order = advanceTo(placed(), PATH_TO.DELIVERED ?? [])
      expect(() => order.transitionTo(next as never), `DELIVERED vers ${next}`).toThrow()
    }
  })
})

describe('le tableau complet des passages', () => {
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      const allowed = ALLOWED[from]?.includes(to) ?? false
      it(`${allowed ? 'permet' : 'refuse'} ${from} vers ${to}`, () => {
        const order = advanceTo(placed(), PATH_TO[from] ?? [])
        if (allowed) {
          order.transitionTo(to as never)
          expect(order.status).toBe(to)
        } else {
          expect(() => order.transitionTo(to as never)).toThrow()
          expect(order.status, 'un passage refusé ne change pas le statut').toBe(from)
        }
      })
    }
  }
})
