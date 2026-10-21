/**
 * Module 4 : Mots de passe, comptes et droits.
 *
 * Trois sortes de personnes se servent de l'application : le client qui
 * commande, le restaurateur qui tient un restaurant, et le livreur qui porte
 * les commandes. Un même compte peut tenir plusieurs rôles : un livreur
 * commande aussi son repas.
 *
 * Contrat attendu, exporté par `src/academie/module-4.ts`, à côté de
 * `normalizePhone` :
 *
 *   export class Account {
 *     static register(input: {
 *       email: string; name: string
 *       phone?: string           // facultatif; tel que la personne l'a tapé
 *     }): Account                // lève si le numéro est donné mais invalide
 *     readonly roles: Role[]     // ['CUSTOMER'] à l'inscription
 *     readonly phone: string | null   // la forme unique, '+261…', ou null
 *     readonly status: 'ACTIVE' | 'SUSPENDED'
 *     readonly suspensionReason: string | null
 *     readonly courierStatus: 'NONE' | 'PENDING' | 'APPROVED'
 *     suspend(reason: string): void      // lève si le motif est vide
 *     reinstate(): void
 *     applyAsCourier(): void             // ajoute le rôle COURIER, en attente de vérification
 *     approveCourier(): void             // lève si le compte n'a pas demandé à livrer
 *     canDeliver(): boolean              // livreur vérifié, compte actif
 *   }
 *
 *   export function hashPassword(plain: string): Promise<string>
 *   export function verifyPassword(plain: string, hash: string): Promise<boolean>
 *
 *   export type Role = 'CUSTOMER' | 'MERCHANT' | 'COURIER'
 *   export type Action =
 *     'PLACE_ORDER' | 'OPEN_RESTAURANT' | 'MANAGE_RESTAURANT' | 'DELIVER' | 'EDIT_PROFILE'
 *
 *   export function authorize(input: {
 *     roles: Role[]                                 // [] pour un visiteur non connecté
 *     accountStatus?: 'ACTIVE' | 'SUSPENDED'        // absent : ACTIVE
 *     courierStatus?: 'NONE' | 'PENDING' | 'APPROVED'   // absent : NONE
 *     action: Action
 *     isOwner?: boolean                             // pour MANAGE_RESTAURANT : le restaurant est à lui
 *   }): { allowed: boolean; status: number }
 *
 * Commander demande le rôle CUSTOMER. Ouvrir un restaurant demande le rôle
 * MERCHANT; gérer un restaurant, sa carte et ses commandes, demande en plus
 * d'en être le propriétaire. Livrer demande le rôle COURIER, et un livreur
 * vérifié : la vérification de ses papiers se fait hors de l'application, et
 * un livreur en attente ne prend aucune commande. Un compte suspendu peut
 * encore se connecter et corriger son profil (`EDIT_PROFILE`), rien d'autre.
 *
 * `authorize` est la décision d'autorisation de votre serveur, isolée pour être
 * testable. Vos routes doivent l'appeler : masquer un bouton dans l'interface
 * n'est pas une autorisation.
 */
import { describe, expect, it } from 'vitest'
import { Account, authorize, hashPassword, verifyPassword } from '../../../src/academie/module-4'

const ALL_ACTIONS = ['PLACE_ORDER', 'OPEN_RESTAURANT', 'MANAGE_RESTAURANT', 'DELIVER', 'EDIT_PROFILE'] as const

function registered() {
  return Account.register({ email: 'voahangy@example.org', name: 'Voahangy' })
}

describe('l’inscription', () => {
  it('crée un compte client actif', () => {
    const account = registered()
    expect(account.status).toBe('ACTIVE')
    expect(account.roles).toEqual(['CUSTOMER'])
    expect(account.courierStatus).toBe('NONE')
    expect(account.canDeliver()).toBe(false)
  })

  it('range le numéro sous sa forme unique', () => {
    const account = Account.register({ email: 'tojo@example.org', name: 'Tojo', phone: '034 12 345 67' })
    expect(account.phone).toBe('+261341234567')
  })

  it('accepte un compte sans numéro', () => {
    expect(registered().phone).toBeNull()
  })

  it('refuse un numéro qui n’est pas valide', () => {
    expect(() => Account.register({ email: 'x@example.org', name: 'X', phone: '12345' })).toThrow()
  })
})

describe('devenir livreur', () => {
  it('ajoute le rôle de livreur, en attente de vérification', () => {
    const account = registered()
    account.applyAsCourier()
    expect(account.roles).toContain('COURIER')
    expect(account.roles, 'un livreur reste client').toContain('CUSTOMER')
    expect(account.courierStatus).toBe('PENDING')
    expect(account.canDeliver(), 'un livreur en attente ne livre pas').toBe(false)
  })

  it('laisse livrer un livreur vérifié', () => {
    const account = registered()
    account.applyAsCourier()
    account.approveCourier()
    expect(account.courierStatus).toBe('APPROVED')
    expect(account.canDeliver()).toBe(true)
  })

  it('refuse de vérifier un compte qui n’a pas demandé à livrer', () => {
    expect(() => registered().approveCourier()).toThrow()
  })

  it('empêche un livreur suspendu de livrer', () => {
    const account = registered()
    account.applyAsCourier()
    account.approveCourier()
    account.suspend('Commandes non remises, à répétition')
    expect(account.canDeliver()).toBe(false)
  })
})

describe('la suspension', () => {
  it('suspend un compte avec un motif lisible', () => {
    const account = registered()
    account.suspend('Commandes refusées à la porte, à répétition')
    expect(account.status).toBe('SUSPENDED')
    expect(account.suspensionReason).toContain('porte')
  })

  it('refuse une suspension sans motif', () => {
    expect(() => registered().suspend('  ')).toThrow()
  })

  it('rend ses droits à un compte réintégré', () => {
    const account = registered()
    account.suspend('Signalé par erreur')
    account.reinstate()
    expect(account.status).toBe('ACTIVE')
    expect(account.suspensionReason).toBeNull()
  })
})

describe('stockage des mots de passe', () => {
  it('ne conserve jamais le mot de passe en clair', async () => {
    const hash = await hashPassword('mot-de-passe-de-test-1')
    expect(hash).not.toContain('mot-de-passe-de-test-1')
    expect(hash.length).toBeGreaterThan(20)
  })

  // Un hachage sans sel se casse avec une table pré-calculée.
  it('sale le hachage : deux hachages du même mot de passe diffèrent', async () => {
    const [first, second] = await Promise.all([
      hashPassword('mot-de-passe-de-test-1'),
      hashPassword('mot-de-passe-de-test-1'),
    ])
    expect(first).not.toBe(second)
  })

  it('reconnaît le bon mot de passe et rejette le mauvais', async () => {
    const hash = await hashPassword('mot-de-passe-de-test-1')
    expect(await verifyPassword('mot-de-passe-de-test-1', hash)).toBe(true)
    expect(await verifyPassword('mot-de-passe-de-test-2', hash)).toBe(false)
  })
})

describe('autorisation côté serveur', () => {
  it('refuse un visiteur anonyme avec 401', () => {
    for (const action of ALL_ACTIONS) {
      const decision = authorize({ roles: [], action, isOwner: true, courierStatus: 'APPROVED' })
      expect(decision.allowed, `un visiteur ne doit pas pouvoir ${action}`).toBe(false)
      expect(decision.status).toBe(401)
    }
  })

  it('laisse un client commander et corriger son profil, rien d’autre', () => {
    expect(authorize({ roles: ['CUSTOMER'], action: 'PLACE_ORDER' }).allowed).toBe(true)
    expect(authorize({ roles: ['CUSTOMER'], action: 'EDIT_PROFILE' }).allowed).toBe(true)
    for (const action of ['OPEN_RESTAURANT', 'MANAGE_RESTAURANT', 'DELIVER'] as const) {
      const decision = authorize({ roles: ['CUSTOMER'], action, isOwner: true })
      expect(decision.allowed, `un simple client ne doit pas pouvoir ${action}`).toBe(false)
      expect(decision.status).toBe(403)
    }
  })

  it('laisse un restaurateur ouvrir un restaurant', () => {
    expect(authorize({ roles: ['CUSTOMER', 'MERCHANT'], action: 'OPEN_RESTAURANT' }).allowed).toBe(true)
  })

  // Le cœur du module : être restaurateur ne suffit pas, il faut être le propriétaire.
  it('laisse un restaurateur gérer son restaurant, et refuse celui d’un autre avec 403', () => {
    expect(authorize({ roles: ['MERCHANT'], action: 'MANAGE_RESTAURANT', isOwner: true }).allowed).toBe(true)

    const other = authorize({ roles: ['MERCHANT'], action: 'MANAGE_RESTAURANT', isOwner: false })
    expect(other.allowed).toBe(false)
    expect(other.status).toBe(403)

    const unknown = authorize({ roles: ['MERCHANT'], action: 'MANAGE_RESTAURANT' })
    expect(unknown.allowed, 'sans isOwner, le restaurant n’est pas à lui').toBe(false)
  })

  it('laisse livrer un livreur vérifié, et refuse un livreur en attente avec 403', () => {
    expect(authorize({ roles: ['CUSTOMER', 'COURIER'], courierStatus: 'APPROVED', action: 'DELIVER' }).allowed).toBe(true)

    const pending = authorize({ roles: ['CUSTOMER', 'COURIER'], courierStatus: 'PENDING', action: 'DELIVER' })
    expect(pending.allowed).toBe(false)
    expect(pending.status).toBe(403)

    const unknown = authorize({ roles: ['COURIER'], action: 'DELIVER' })
    expect(unknown.allowed, 'sans courierStatus, le livreur n’est pas vérifié').toBe(false)
  })

  it('refuse tout sauf le profil à un compte suspendu, avec 403', () => {
    const roles = ['CUSTOMER', 'MERCHANT', 'COURIER'] as ('CUSTOMER' | 'MERCHANT' | 'COURIER')[]
    for (const action of ['PLACE_ORDER', 'OPEN_RESTAURANT', 'MANAGE_RESTAURANT', 'DELIVER'] as const) {
      const decision = authorize({ roles, accountStatus: 'SUSPENDED', courierStatus: 'APPROVED', action, isOwner: true })
      expect(decision.allowed, `un compte suspendu ne doit pas pouvoir ${action}`).toBe(false)
      expect(decision.status).toBe(403)
    }
    expect(authorize({ roles, accountStatus: 'SUSPENDED', action: 'EDIT_PROFILE' }).allowed).toBe(true)
  })

  it('refuse à un livreur sans le rôle client de commander', () => {
    const decision = authorize({ roles: ['COURIER'], courierStatus: 'APPROVED', action: 'PLACE_ORDER' })
    expect(decision.allowed).toBe(false)
    expect(decision.status).toBe(403)
  })
})
