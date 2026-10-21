/**
 * Module 2 : Architecture, les montants d'une commande.
 *
 * Un montant est un entier en ariary, qui n'a pas de centimes (décision 0002).
 * Une commande additionne ses lignes, ajoute les frais de livraison et les
 * frais de service.
 *
 *   sous-total        la somme des lignes : prix unitaire × quantité
 *   frais de service  5 % du sous-total, arrondis à l'ariary inférieur
 *   total             sous-total + frais de livraison + frais de service
 *
 * Contrat attendu, exporté par `src/academie/module-2.ts` : la classe `Order`
 * décrite dans commande.test.ts.
 *
 * `Order.place` lève une erreur quand :
 *   - la commande n'a aucune ligne;
 *   - une quantité n'est pas un entier de 1 à 20;
 *   - un prix unitaire n'est pas un entier strictement positif;
 *   - les frais de livraison ne sont pas un entier positif ou nul.
 */
import { describe, expect, it } from 'vitest'
import { Order } from '../../../src/academie/module-2'

const base = {
  customerId: '11111111-1111-4111-8111-111111111111',
  restaurantId: '22222222-2222-4222-8222-222222222222',
}

function place(lines: { dishId: string; unitPrice: number; quantity: number }[], deliveryFee = 2_000) {
  return Order.place({ ...base, lines, deliveryFee })
}

describe('le calcul d’une commande', () => {
  it('additionne les lignes, les frais de livraison et les frais de service', () => {
    const order = place(
      [
        { dishId: 'romazava', unitPrice: 12_000, quantity: 2 },
        { dishId: 'mofo-gasy', unitPrice: 500, quantity: 3 },
      ],
      2_500,
    )
    expect(order.subtotal).toBe(25_500)
    expect(order.serviceFee).toBe(1_275)
    expect(order.total).toBe(29_275)
  })

  // 5 % de 12 345, c'est 617,25 : l'ariary n'a pas de centimes.
  it('arrondit les frais de service à l’ariary inférieur', () => {
    const order = place([{ dishId: 'plat', unitPrice: 12_345, quantity: 1 }], 0)
    expect(order.serviceFee).toBe(617)
    expect(order.total).toBe(12_962)
  })

  it('accepte une livraison offerte', () => {
    const order = place([{ dishId: 'plat', unitPrice: 10_000, quantity: 1 }], 0)
    expect(order.total).toBe(10_500)
  })

  it('rend des montants entiers', () => {
    const order = place([{ dishId: 'plat', unitPrice: 9_999, quantity: 3 }], 3_000)
    for (const amount of [order.subtotal, order.serviceFee, order.total]) {
      expect(Number.isInteger(amount), `${amount} doit être un entier`).toBe(true)
    }
  })
})

describe('les commandes refusées', () => {
  it('refuse une commande sans ligne', () => {
    expect(() => place([])).toThrow()
  })

  it('refuse une quantité nulle, à virgule ou supérieure à 20', () => {
    for (const quantity of [0, -1, 1.5, 21]) {
      expect(() => place([{ dishId: 'plat', unitPrice: 10_000, quantity }]), `quantité ${quantity}`).toThrow()
    }
  })

  it('accepte vingt fois le même plat', () => {
    expect(place([{ dishId: 'plat', unitPrice: 1_000, quantity: 20 }]).subtotal).toBe(20_000)
  })

  it('refuse un prix unitaire nul, négatif ou à virgule', () => {
    for (const unitPrice of [0, -500, 1_500.5]) {
      expect(() => place([{ dishId: 'plat', unitPrice, quantity: 1 }]), `prix ${unitPrice}`).toThrow()
    }
  })

  it('refuse des frais de livraison négatifs ou à virgule', () => {
    expect(() => place([{ dishId: 'plat', unitPrice: 10_000, quantity: 1 }], -1)).toThrow()
    expect(() => place([{ dishId: 'plat', unitPrice: 10_000, quantity: 1 }], 1_000.5)).toThrow()
  })
})
