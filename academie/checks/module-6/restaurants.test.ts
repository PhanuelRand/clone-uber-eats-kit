/**
 * Module 6 : Le restaurant, sa carte et ses photos.
 *
 * Contrat attendu, exporté par `src/academie/module-6.ts` :
 *
 *   export function createAccount(input?: {
 *     name?: string                       // par défaut 'Compte'
 *     email?: string                      // par défaut un courriel inventé
 *     phone?: string                      // facultatif
 *     roles?: ('CUSTOMER' | 'MERCHANT' | 'COURIER')[]   // par défaut ['CUSTOMER']
 *     courierStatus?: 'NONE' | 'PENDING' | 'APPROVED'   // par défaut 'NONE'
 *   }): Promise<string>                   // l'identifiant d'un compte actif
 *
 *   export function cuisines(): Promise<{ slug: string; name: string }[]>
 *
 *   export function openRestaurant(input: {
 *     ownerId: string
 *     name: string; cuisine: string       // le slug d'une cuisine
 *     city: string; address: string
 *     latitude: number; longitude: number
 *     deliveryRadiusKm: number
 *     hours: { day: number; opens: string; closes: string }[]
 *   }): Promise<{ status: number; restaurantId?: string; reason?: string }>   // 201, 400 ou 403
 *
 *   export function addDish(input: {
 *     restaurantId: string; memberId: string
 *     name: string; description: string
 *     section: string                     // la rubrique de la carte : 'Entrées', 'Plats'…
 *     price: number                       // en ariary
 *   }): Promise<{ status: number; dishId?: string; reason?: string }>         // 201, 400 ou 403
 *
 *   export function updateDish(input: {
 *     dishId: string; memberId: string
 *     name?: string; description?: string; price?: number
 *     available?: boolean                 // false : épuisé pour aujourd'hui
 *   }): Promise<{ status: number }>       // 200; 400 hors des règles; 403 pour un autre compte
 *
 *   export function removeDish(input: { dishId: string; memberId: string }):
 *     Promise<{ status: number }>         // 200, ou 403 pour un autre compte
 *
 *   export function getMenu(restaurantId: string): Promise<null | {
 *     restaurantId: string; name: string; cuisine: string
 *     city: string; address: string
 *     sections: {
 *       name: string
 *       dishes: {
 *         dishId: string; name: string; description: string
 *         price: number; available: boolean
 *         photo: string | null            // la clé de la photo du plat
 *       }[]
 *     }[]
 *   }>                                    // null si le restaurant n'existe pas
 *
 *   export function createUploadUrl(input: {
 *     memberId: string; dishId: string; contentType: string; sizeBytes: number
 *   }): Promise<
 *     | { url: string; key: string; expiresAt: string }   // ISO 8601
 *     | { refused: string }                               // motif lisible
 *   >
 *
 *   export function attachPhoto(input: {
 *     memberId: string; dishId: string; key: string
 *   }): Promise<{ attached: boolean; reason?: string }>
 *
 * Règles imposées par la consigne, que cette suite vérifie :
 *   - seul un restaurateur (MERCHANT) ouvre un restaurant;
 *   - un nom de restaurant fait de 2 à 60 caractères, la cuisine est l'une de
 *     la décision 0001, la ville et l'adresse sont obligatoires, la position
 *     est une vraie latitude et une vraie longitude, le rayon de livraison va
 *     de 1 à 15 km, et les horaires ont au moins un créneau valide;
 *   - un plat a un nom de 2 à 80 caractères, une description de 500 au plus,
 *     une rubrique, et un prix entier strictement positif;
 *   - seul le propriétaire modifie la carte de son restaurant;
 *   - la carte montre les rubriques dans l'ordre où leur premier plat a été
 *     ajouté, et les plats dans l'ordre d'ajout; un plat épuisé y reste,
 *     marqué indisponible; un plat retiré n'y figure plus;
 *   - la carte ne montre ni le courriel ni le téléphone du restaurateur;
 *   - un plat a une photo au plus : une nouvelle photo remplace l'ancienne;
 *   - seuls `image/jpeg`, `image/png` et `image/webp` sont acceptés, un fichier
 *     de plus de 10 000 000 octets est refusé, et l'URL de téléversement
 *     expire dans les deux heures.
 *
 * Les photos passent par votre port « stockage » : en local et dans ces
 * vérifications, un stockage simulé qui écrit sur le disque; en production,
 * Supabase Storage. Ces vérifications n'envoient aucun fichier : `attachPhoto`
 * n'a pas à vérifier que le fichier a bien été téléversé.
 */
import { describe, expect, it } from 'vitest'
import {
  addDish,
  attachPhoto,
  createAccount,
  createUploadUrl,
  cuisines,
  getMenu,
  openRestaurant,
  removeDish,
  updateDish,
} from '../../../src/academie/module-6'
import { ALWAYS_OPEN, TANA } from '../_support/horaires'

const maxBytes = 10_000_000

function validRestaurant(ownerId: string) {
  return {
    ownerId,
    name: 'Chez Lalao',
    cuisine: 'malgache',
    city: 'Antananarivo',
    address: 'Rue Rainitovo, Antsahavola',
    ...TANA,
    deliveryRadiusKm: 5,
    hours: ALWAYS_OPEN,
  }
}

async function merchant(name = 'Lalao') {
  return createAccount({ name, roles: ['CUSTOMER', 'MERCHANT'] })
}

async function restaurantOf(ownerId: string) {
  const result = await openRestaurant(validRestaurant(ownerId))
  if (!result.restaurantId) throw new Error(`restaurant refusé : ${result.reason ?? result.status}`)
  return result.restaurantId
}

function validDish(restaurantId: string, memberId: string, overrides: Partial<Parameters<typeof addDish>[0]> = {}) {
  return {
    restaurantId,
    memberId,
    name: 'Romazava',
    description: 'Bouillon de brèdes et de zébu, servi avec du riz.',
    section: 'Plats',
    price: 12_000,
    ...overrides,
  }
}

async function dishOf(restaurantId: string, memberId: string, overrides: Partial<Parameters<typeof addDish>[0]> = {}) {
  const result = await addDish(validDish(restaurantId, memberId, overrides))
  if (!result.dishId) throw new Error(`plat refusé : ${result.reason ?? result.status}`)
  return result.dishId
}

async function menuWithDish() {
  const ownerId = await merchant()
  const restaurantId = await restaurantOf(ownerId)
  const dishId = await dishOf(restaurantId, ownerId)
  return { ownerId, restaurantId, dishId }
}

function dishIn(menu: Awaited<ReturnType<typeof getMenu>>, dishId: string) {
  return menu?.sections.flatMap((section) => section.dishes).find((dish) => dish.dishId === dishId)
}

describe('les cuisines', () => {
  it('forment la liste de la décision 0001', async () => {
    const slugs = (await cuisines()).map((cuisine) => cuisine.slug)
    for (const slug of ['malgache', 'pizza', 'burger', 'asiatique', 'grillades', 'patisserie', 'snack', 'vegetarien']) {
      expect(slugs, `la cuisine « ${slug} » doit exister`).toContain(slug)
    }
    expect((await cuisines()).every((cuisine) => cuisine.name.trim().length > 0), 'chaque cuisine a un nom').toBe(true)
  })
})

describe('l’ouverture d’un restaurant', () => {
  it('ouvre un restaurant, dont tout le monde peut lire la carte', async () => {
    const ownerId = await merchant()
    const result = await openRestaurant(validRestaurant(ownerId))
    expect(result.status).toBe(201)
    expect(result.restaurantId, 'un restaurant ouvert porte un identifiant').toBeTruthy()

    expect(await getMenu(result.restaurantId ?? '')).toMatchObject({
      name: 'Chez Lalao',
      cuisine: 'malgache',
      city: 'Antananarivo',
      address: 'Rue Rainitovo, Antsahavola',
      sections: [],
    })
  })

  it('refuse un compte qui n’est pas restaurateur, avec 403', async () => {
    const customer = await createAccount()
    expect((await openRestaurant(validRestaurant(customer))).status).toBe(403)
  })

  it('refuse un nom, une cuisine, une ville ou une adresse hors des règles, avec 400', async () => {
    const ownerId = await merchant()
    const cases = [
      { name: 'A' },
      { name: 'a'.repeat(61) },
      { cuisine: 'francaise-etoilee' },
      { city: '  ' },
      { address: '' },
    ]
    for (const overrides of cases) {
      const result = await openRestaurant({ ...validRestaurant(ownerId), ...overrides })
      expect(result.status, JSON.stringify(overrides)).toBe(400)
      expect(result.reason, 'le refus doit porter un motif lisible').toBeTruthy()
    }
  })

  it('refuse une position, un rayon ou des horaires hors des règles, avec 400', async () => {
    const ownerId = await merchant()
    const cases = [
      { latitude: -91 },
      { longitude: 181 },
      { deliveryRadiusKm: 0 },
      { deliveryRadiusKm: 16 },
      { hours: [] },
      { hours: [{ day: 8, opens: '11:00', closes: '14:00' }] },
      { hours: [{ day: 1, opens: '25:00', closes: '14:00' }] },
    ]
    for (const overrides of cases) {
      const result = await openRestaurant({ ...validRestaurant(ownerId), ...overrides })
      expect(result.status, JSON.stringify(overrides)).toBe(400)
    }
  })
})

describe('la carte', () => {
  it('range les plats par rubrique, dans l’ordre d’ajout', async () => {
    const ownerId = await merchant()
    const restaurantId = await restaurantOf(ownerId)
    const soup = await dishOf(restaurantId, ownerId, { name: 'Soupe chinoise', section: 'Entrées', price: 6_000 })
    const romazava = await dishOf(restaurantId, ownerId, { name: 'Romazava', section: 'Plats' })
    const samosa = await dishOf(restaurantId, ownerId, { name: 'Sambos', section: 'Entrées', price: 2_000 })
    const koba = await dishOf(restaurantId, ownerId, { name: 'Koba', section: 'Desserts', price: 3_000 })

    const menu = await getMenu(restaurantId)
    expect(menu?.sections.map((section) => section.name)).toEqual(['Entrées', 'Plats', 'Desserts'])
    expect(menu?.sections.map((section) => section.dishes.map((dish) => dish.dishId))).toEqual([
      [soup, samosa],
      [romazava],
      [koba],
    ])
    expect(dishIn(menu, romazava)).toMatchObject({ name: 'Romazava', price: 12_000, available: true, photo: null })
  })

  it('refuse un plat hors des règles, avec 400', async () => {
    const ownerId = await merchant()
    const restaurantId = await restaurantOf(ownerId)
    const cases = [
      { name: 'R' },
      { name: 'a'.repeat(81) },
      { description: 'a'.repeat(501) },
      { section: ' ' },
      { price: 0 },
      { price: 1_500.5 },
    ]
    for (const overrides of cases) {
      const result = await addDish(validDish(restaurantId, ownerId, overrides))
      expect(result.status, JSON.stringify(overrides)).toBe(400)
    }
  })

  // Côté serveur : connaître l'identifiant d'un restaurant ne suffit pas à changer sa carte.
  it('refuse à un autre restaurateur d’ajouter un plat, avec 403', async () => {
    const restaurantId = await restaurantOf(await merchant())
    const stranger = await merchant('Autre')
    expect((await addDish(validDish(restaurantId, stranger))).status).toBe(403)
    expect((await getMenu(restaurantId))?.sections).toEqual([])
  })

  it('laisse le propriétaire changer un prix, et marquer un plat épuisé', async () => {
    const { ownerId, restaurantId, dishId } = await menuWithDish()
    expect((await updateDish({ dishId, memberId: ownerId, price: 13_000 })).status).toBe(200)
    expect((await updateDish({ dishId, memberId: ownerId, available: false })).status).toBe(200)

    expect(dishIn(await getMenu(restaurantId), dishId), 'un plat épuisé reste sur la carte').toMatchObject({
      price: 13_000,
      available: false,
    })
  })

  it('refuse une modification hors des règles avec 400, et celle d’un autre compte avec 403', async () => {
    const { ownerId, restaurantId, dishId } = await menuWithDish()
    expect((await updateDish({ dishId, memberId: ownerId, price: -1 })).status).toBe(400)
    expect((await updateDish({ dishId, memberId: await merchant('Autre'), price: 1 })).status).toBe(403)
    expect(dishIn(await getMenu(restaurantId), dishId)?.price).toBe(12_000)
  })

  it('retire un plat de la carte, sur demande du seul propriétaire', async () => {
    const { ownerId, restaurantId, dishId } = await menuWithDish()
    expect((await removeDish({ dishId, memberId: await merchant('Autre') })).status).toBe(403)
    expect(dishIn(await getMenu(restaurantId), dishId)).toBeDefined()

    expect((await removeDish({ dishId, memberId: ownerId })).status).toBe(200)
    expect(dishIn(await getMenu(restaurantId), dishId), 'un plat retiré quitte la carte').toBeUndefined()
  })

  it('rend null pour un restaurant qui n’existe pas', async () => {
    expect(await getMenu('00000000-0000-4000-8000-000000000000')).toBeNull()
  })

  // Le client écrit au restaurant par la commande, pas par son téléphone personnel.
  it('ne montre jamais le courriel ni le téléphone du restaurateur', async () => {
    const email = `restaurateur-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.org`
    const ownerId = await createAccount({ name: 'Lalao', email, phone: '034 98 765 43', roles: ['CUSTOMER', 'MERCHANT'] })
    const restaurantId = await restaurantOf(ownerId)
    await dishOf(restaurantId, ownerId)

    const text = JSON.stringify(await getMenu(restaurantId))
    expect(text, 'le courriel du restaurateur reste sur le serveur').not.toContain(email)
    expect(text, 'le téléphone du restaurateur reste sur le serveur').not.toMatch(/98\s?765\s?43|987654/)
  })
})

describe('la photo d’un plat', () => {
  it('accorde une URL signée au propriétaire, qui expire dans les deux heures', async () => {
    const { ownerId, dishId } = await menuWithDish()
    const grant = await createUploadUrl({ memberId: ownerId, dishId, contentType: 'image/webp', sizeBytes: 250_000 })

    expect('key' in grant, 'une image valide doit être acceptée').toBe(true)
    if (!('key' in grant)) return
    expect(grant.url).toMatch(/^https?:\/\/.+/)
    const expiresAt = new Date(grant.expiresAt).getTime()
    expect(Number.isNaN(expiresAt), 'expiresAt doit être une date ISO 8601').toBe(false)
    expect(expiresAt).toBeGreaterThan(Date.now())
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 7_200_000)
  })

  // Le type est décidé côté serveur : un client peut annoncer ce qu'il veut.
  it('refuse un fichier qui n’est pas une image, ou trop volumineux', async () => {
    const { ownerId, dishId } = await menuWithDish()
    for (const contentType of ['application/pdf', 'text/html', 'video/mp4']) {
      const grant = await createUploadUrl({ memberId: ownerId, dishId, contentType, sizeBytes: 100_000 })
      expect('refused' in grant, `${contentType} doit être refusé`).toBe(true)
    }
    const big = await createUploadUrl({ memberId: ownerId, dishId, contentType: 'image/jpeg', sizeBytes: maxBytes + 1 })
    expect('refused' in big, 'un fichier de plus de 10 Mo doit être refusé').toBe(true)
  })

  it('refuse le téléversement à un autre compte que le propriétaire', async () => {
    const { dishId } = await menuWithDish()
    const grant = await createUploadUrl({ memberId: await merchant('Autre'), dishId, contentType: 'image/jpeg', sizeBytes: 100_000 })
    expect('refused' in grant, 'seul le propriétaire ajoute des photos à sa carte').toBe(true)
  })

  it('montre la photo sur la carte, et la remplace par la suivante', async () => {
    const { ownerId, restaurantId, dishId } = await menuWithDish()
    const first = await createUploadUrl({ memberId: ownerId, dishId, contentType: 'image/jpeg', sizeBytes: 100_000 })
    if (!('key' in first)) throw new Error(`téléversement refusé : ${first.refused}`)
    expect((await attachPhoto({ memberId: ownerId, dishId, key: first.key })).attached).toBe(true)
    expect(dishIn(await getMenu(restaurantId), dishId)?.photo).toBe(first.key)

    const second = await createUploadUrl({ memberId: ownerId, dishId, contentType: 'image/png', sizeBytes: 100_000 })
    if (!('key' in second)) throw new Error(`téléversement refusé : ${second.refused}`)
    expect((await attachPhoto({ memberId: ownerId, dishId, key: second.key })).attached).toBe(true)
    expect(dishIn(await getMenu(restaurantId), dishId)?.photo, 'un plat a une photo au plus').toBe(second.key)
  })

  it('refuse de reprendre la photo d’un autre plat', async () => {
    const owner = await menuWithDish()
    const grant = await createUploadUrl({ memberId: owner.ownerId, dishId: owner.dishId, contentType: 'image/jpeg', sizeBytes: 100_000 })
    if (!('key' in grant)) throw new Error(`téléversement refusé : ${grant.refused}`)
    await attachPhoto({ memberId: owner.ownerId, dishId: owner.dishId, key: grant.key })

    const thief = await menuWithDish()
    const result = await attachPhoto({ memberId: thief.ownerId, dishId: thief.dishId, key: grant.key })
    expect(result.attached, 'une photo accordée pour un autre plat ne doit pas être reprise').toBe(false)
    expect(dishIn(await getMenu(thief.restaurantId), thief.dishId)?.photo).toBeNull()
  })
})
