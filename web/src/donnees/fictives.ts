/**
 * Des données fictives, pour construire vos écrans avant que l'API existe.
 *
 * Au module 3, vos pages lisent ce fichier. Dans les modules suivants, chaque
 * page le remplace par un appel à votre API, une page à la fois. Quand plus
 * aucun écran ne l'importe, supprimez-le.
 *
 * Les restaurants, leurs plats, les clients et les livreurs sont inventés.
 */

/** Les cuisines du parcours : une liste fixe (décision 0001). */
export type CuisineFictive = { slug: string; nom: string }

export const cuisinesFictives: CuisineFictive[] = [
  { slug: 'malgache', nom: 'Malgache' },
  { slug: 'pizza', nom: 'Pizza' },
  { slug: 'burger', nom: 'Burgers' },
  { slug: 'asiatique', nom: 'Asiatique' },
  { slug: 'grillades', nom: 'Grillades' },
  { slug: 'patisserie', nom: 'Pâtisserie' },
  { slug: 'snack', nom: 'Snack' },
  { slug: 'vegetarien', nom: 'Végétarien' },
]

/** Le nom d'une cuisine, pour l'afficher : « Pâtisserie » plutôt que « patisserie ». */
export function nomCuisine(slug: string): string {
  return cuisinesFictives.find((cuisine) => cuisine.slug === slug)?.nom ?? slug
}

/** Un prix en ariary, écrit comme on le lit : « 12 000 Ar ». */
export function prixLisible(ariary: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(ariary)} Ar`
}

export type PlatFictif = {
  id: string
  nom: string
  description: string
  rubrique: string // 'Entrées', 'Plats'… : libres, dans l'ordre de la carte
  prix: number // en ariary
  disponible: boolean // false : épuisé pour aujourd'hui
}

export type RestaurantFictif = {
  id: string
  nom: string
  cuisine: string // le slug d'une cuisine
  quartier: string
  ville: string
  distanceKm: number // arrondie au dixième (module 8)
  fraisLivraison: number // en ariary (module 8)
  minutes: string // le temps de livraison annoncé, par exemple '25-35'
  ouvert: boolean // à l'instant présent (module 7)
  note: number | null // sur 5; null sous cinq avis (module 17)
  plats: PlatFictif[]
}

export const restaurantsFictifs: RestaurantFictif[] = [
  {
    id: 'r1',
    nom: 'Chez Lalao',
    cuisine: 'malgache',
    quartier: 'Antsahavola',
    ville: 'Antananarivo',
    distanceKm: 1.8,
    fraisLivraison: 2_000,
    minutes: '25-35',
    ouvert: true,
    note: 4.6,
    plats: [
      { id: 'p1', nom: 'Sambos à la viande', description: 'Six pièces, pâte croustillante.', rubrique: 'Entrées', prix: 3_000, disponible: true },
      { id: 'p2', nom: 'Romazava', description: 'Bouillon de brèdes et de zébu, servi avec du riz.', rubrique: 'Plats', prix: 12_000, disponible: true },
      { id: 'p3', nom: 'Ravitoto au porc', description: 'Feuilles de manioc pilées, porc fondant, riz blanc.', rubrique: 'Plats', prix: 14_000, disponible: false },
      { id: 'p4', nom: 'Koba', description: 'Pâte d’arachide et de banane, cuite dans la feuille.', rubrique: 'Desserts', prix: 3_000, disponible: true },
      { id: 'p5', nom: 'Ranonapango', description: 'L’eau de riz grillé, servie fraîche.', rubrique: 'Boissons', prix: 1_500, disponible: true },
    ],
  },
  {
    id: 'r2',
    nom: 'Pizzeria du Lac',
    cuisine: 'pizza',
    quartier: 'Behoririka',
    ville: 'Antananarivo',
    distanceKm: 2.6,
    fraisLivraison: 2_000,
    minutes: '30-40',
    ouvert: true,
    note: 4.2,
    plats: [
      { id: 'p6', nom: 'Margherita', description: 'Tomate, mozzarella, basilic.', rubrique: 'Pizzas', prix: 18_000, disponible: true },
      { id: 'p7', nom: 'Zébu fumé', description: 'Tomate, mozzarella, zébu fumé, oignons.', rubrique: 'Pizzas', prix: 26_000, disponible: true },
      { id: 'p8', nom: 'Jus de corossol', description: 'Pressé du jour, 50 cl.', rubrique: 'Boissons', prix: 4_000, disponible: true },
    ],
  },
  {
    id: 'r3',
    nom: 'Le Pavillon de Jade',
    cuisine: 'asiatique',
    quartier: 'Analakely',
    ville: 'Antananarivo',
    distanceKm: 3.4,
    fraisLivraison: 2_500,
    minutes: '35-45',
    ouvert: true,
    note: null,
    plats: [
      { id: 'p9', nom: 'Soupe chinoise', description: 'Nouilles, légumes, bouillon de poulet.', rubrique: 'Soupes', prix: 7_000, disponible: true },
      { id: 'p10', nom: 'Riz cantonais', description: 'Œuf, petits pois, jambon.', rubrique: 'Plats', prix: 11_000, disponible: true },
      { id: 'p11', nom: 'Nems', description: 'Quatre pièces, sauce aigre-douce.', rubrique: 'Entrées', prix: 5_000, disponible: true },
    ],
  },
  {
    id: 'r4',
    nom: 'Grillades d’Isoraka',
    cuisine: 'grillades',
    quartier: 'Isoraka',
    ville: 'Antananarivo',
    distanceKm: 1.2,
    fraisLivraison: 2_000,
    minutes: '20-30',
    ouvert: false,
    note: 4.8,
    plats: [
      { id: 'p12', nom: 'Brochettes de zébu', description: 'Cinq brochettes, achards de légumes.', rubrique: 'Grillades', prix: 9_000, disponible: true },
      { id: 'p13', nom: 'Poulet grillé', description: 'Un demi-poulet, frites ou riz.', rubrique: 'Grillades', prix: 15_000, disponible: true },
    ],
  },
  {
    id: 'r5',
    nom: 'Mofo Gasy d’Andravoahangy',
    cuisine: 'snack',
    quartier: 'Andravoahangy',
    ville: 'Antananarivo',
    distanceKm: 4.3,
    fraisLivraison: 3_000,
    minutes: '30-45',
    ouvert: true,
    note: null,
    plats: [
      { id: 'p14', nom: 'Mofo gasy', description: 'Cinq galettes de riz, encore tièdes.', rubrique: 'Le matin', prix: 1_000, disponible: true },
      { id: 'p15', nom: 'Mofo baolina', description: 'Beignets ronds, cinq pièces.', rubrique: 'Le matin', prix: 1_000, disponible: true },
      { id: 'p16', nom: 'Café au lait', description: 'Grand gobelet.', rubrique: 'Boissons', prix: 1_500, disponible: true },
    ],
  },
]

/** Le statut d'une commande (décision 0003). */
export type StatutCommande =
  | 'PENDING_PAYMENT'
  | 'PLACED'
  | 'ACCEPTED'
  | 'READY'
  | 'PICKED_UP'
  | 'DELIVERED'
  | 'REJECTED'
  | 'CANCELLED'

/** Ce que le client lit à chaque étape du suivi. */
export const etapesDuSuivi: { statut: StatutCommande; libelle: string }[] = [
  { statut: 'PLACED', libelle: 'Commande envoyée au restaurant' },
  { statut: 'ACCEPTED', libelle: 'En cuisine' },
  { statut: 'READY', libelle: 'Prête, le livreur arrive' },
  { statut: 'PICKED_UP', libelle: 'En route' },
  { statut: 'DELIVERED', libelle: 'Livrée' },
]

export type CommandeFictive = {
  id: string
  restaurantId: string
  statut: StatutCommande
  lignes: { platId: string; nom: string; prixUnitaire: number; quantite: number }[]
  sousTotal: number
  fraisLivraison: number
  fraisService: number // 5 % du sous-total, arrondis à l'ariary inférieur
  total: number
  adresse: string // visible du client, et du seul livreur de la commande
  instructions: string
  livreur: string | null // un prénom; jamais de téléphone
  codeDeRemise: string // quatre chiffres, que le client donne à la porte
  passeeLe: string // un instant ISO 8601
}

export const commandeFictive: CommandeFictive = {
  id: 'c1',
  restaurantId: 'r1',
  statut: 'PICKED_UP',
  lignes: [
    { platId: 'p2', nom: 'Romazava', prixUnitaire: 12_000, quantite: 2 },
    { platId: 'p5', nom: 'Ranonapango', prixUnitaire: 1_500, quantite: 1 },
  ],
  sousTotal: 25_500,
  fraisLivraison: 2_000,
  fraisService: 1_275,
  total: 28_775,
  adresse: 'Lot IVG 45, Behoririka',
  instructions: 'Portail vert, deuxième étage',
  livreur: 'Haja',
  codeDeRemise: '4821',
  passeeLe: '2026-10-13T09:10:00.000Z',
}
