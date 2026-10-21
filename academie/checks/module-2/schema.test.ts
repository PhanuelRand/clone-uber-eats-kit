/**
 * Module 2 : Architecture, le schéma.
 *
 * Ces vérifications lisent votre dépôt sans exécuter de code : présence d'une
 * migration versionnée, contraintes déclarées, types des colonnes d'argent,
 * d'heure et d'instant.
 *
 * Contrat attendu, exporté par `src/academie/module-2.ts` :
 *
 *   export const schema: {
 *     migrationsDir: string          // ex. 'migrations', relatif à la racine
 *     tables: {
 *       account: string              // le nom RÉEL de vos tables,
 *       restaurant: string           // quel qu'il soit
 *       openingHours: string
 *       dish: string
 *       order: string
 *       orderLine: string
 *     }
 *     moneyColumns: string[]         // ex. ['plats.prix', 'commandes.total']
 *     lineUnitPriceColumn: string    // ex. 'lignes_de_commande.prix_unitaire'
 *     hoursColumns: string[]         // ex. ['horaires.ouvre_a', 'horaires.ferme_a']
 *     instantColumns: string[]       // ex. ['commandes.passee_le', 'comptes.cree_le']
 *   }
 *
 * Vous nommez vos tables et vos colonnes comme vous voulez : la suite lit ce
 * que vous déclarez ici. Elle vérifie que ces objets existent vraiment dans vos
 * migrations et qu'ils ont le bon type.
 *
 * Une ligne de commande désigne sa commande et son plat, et garde **son propre
 * prix unitaire** : le prix au moment de la commande. Si le restaurant change
 * le prix du plat le lendemain, la commande d'hier ne change pas.
 *
 * Un montant est un entier, `integer` ou `bigint` (décision 0002). Une heure
 * d'ouverture est une heure locale, de type `time`, sans fuseau : 11 h 00 au
 * restaurant, quelle que soit l'heure du serveur (décision 0006). Un instant,
 * comme le moment d'une commande, est un `timestamptz` : il garde un point
 * précis dans le temps, quel que soit le fuseau horaire du serveur.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { schema } from '../../../src/academie/module-2'

function migrationsSql(): string {
  const dir = join(process.cwd(), schema.migrationsDir)
  expect(existsSync(dir), `dossier de migrations introuvable : ${schema.migrationsDir}`).toBe(
    true,
  )

  const files = readdirSync(dir).filter((name) => name.endsWith('.sql'))
  expect(files.length, `aucune migration .sql dans ${schema.migrationsDir}/`).toBeGreaterThan(
    0,
  )

  return files
    .sort()
    .map((name) => readFileSync(join(dir, name), 'utf8'))
    .join('\n')
    .toLowerCase()
}

/** Les mots qui suivent le type d'une colonne dans sa déclaration. */
const AFTER_TYPE =
  /\s+(?:not|null|default|references|check|primary|unique|generated|constraint|collate)\b|\s*$/

const CREATE_TABLE = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:[\w"]+\.)?"?(\w+)"?\s*\(/g

/** Le nom d'une table, sans schéma ni guillemets. */
function bare(name: string) {
  return name.toLowerCase().replace(/"/g, '').split('.').at(-1) ?? ''
}

/** Le contenu des parenthèses de chaque `create table … (…)`, par nom de table. */
function tableBodies(sql: string) {
  const bodies: { table: string; body: string }[] = []
  for (const start of sql.matchAll(CREATE_TABLE)) {
    let depth = 1
    let index = (start.index ?? 0) + start[0].length
    const from = index
    for (; index < sql.length && depth > 0; index += 1) {
      if (sql[index] === '(') depth += 1
      if (sql[index] === ')') depth -= 1
    }
    bodies.push({ table: start[1] ?? '', body: sql.slice(from, index - 1) })
  }
  return bodies
}

function bodyOf(sql: string, table: string) {
  return tableBodies(sql)
    .filter((entry) => entry.table === bare(table))
    .map((entry) => entry.body)
    .join('\n')
}

/** Les définitions séparées par des virgules, hors des parenthèses. */
function definitions(body: string) {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const character of body) {
    if (character === '(') depth += 1
    if (character === ')') depth -= 1
    if (character === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else current += character
  }
  parts.push(current)
  return parts.map((part) => part.replace(/--[^\n]*/g, '').trim())
}

/** Le type déclaré d'une colonne, par exemple « time » ou « timestamp with time zone ». */
function declaredType(sql: string, reference: string) {
  const [table, column] = reference.includes('.')
    ? (reference.toLowerCase().replace(/"/g, '').split('.').slice(-2) as [string, string])
    : [undefined, reference.toLowerCase().replace(/"/g, '')]
  expect(column.length, `référence de colonne invalide : ${reference}`).toBeGreaterThan(0)

  const bodies = tableBodies(sql)
    .filter((entry) => !table || entry.table === table)
    .map((entry) => entry.body)
  const candidates = [
    ...bodies.flatMap(definitions),
    // Une colonne ajoutée plus tard par une migration `alter table … add column`.
    ...[...sql.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?([^;,]+)/g)].map((match) => match[1] ?? ''),
  ]

  for (const definition of candidates) {
    const match = new RegExp(`^"?${column}"?\\s+([\\s\\S]+)$`).exec(definition.trim())
    if (!match?.[1]) continue
    const rest = match[1].trim()
    const end = AFTER_TYPE.exec(rest)
    return rest.slice(0, end?.index ?? rest.length).trim().replace(/\s+/g, ' ')
  }
  return undefined
}

describe('migration initiale', () => {
  it('déclare les six tables du domaine', () => {
    const sql = migrationsSql()
    for (const [role, table] of Object.entries(schema.tables)) {
      expect(
        sql,
        `table « ${table} » (${role}) absente des migrations`,
      ).toMatch(new RegExp(`create\\s+table\\s+(if\\s+not\\s+exists\\s+)?[\\w."]*${bare(table)}\\b`))
    }
  })

  it('déclare des clés primaires et des clés étrangères', () => {
    const sql = migrationsSql()
    expect(sql).toContain('primary key')
    expect(sql).toMatch(/references|foreign key/)
  })

  it('déclare des colonnes obligatoires', () => {
    expect(migrationsSql()).toContain('not null')
  })

  it('rattache chaque ligne de commande à sa commande et à son plat', () => {
    const body = bodyOf(migrationsSql(), schema.tables.orderLine)
    expect(body, `table « ${schema.tables.orderLine} » introuvable dans les migrations`).not.toBe('')
    for (const target of [schema.tables.order, schema.tables.dish]) {
      expect(
        body,
        `la table « ${schema.tables.orderLine} » doit désigner « ${target} » par une clé étrangère`,
      ).toMatch(new RegExp(`references\\s+(?:[\\w"]+\\.)?"?${bare(target)}"?\\b`))
    }
  })

  it('rattache les horaires à leur restaurant', () => {
    const body = bodyOf(migrationsSql(), schema.tables.openingHours)
    expect(body, `table « ${schema.tables.openingHours} » introuvable dans les migrations`).not.toBe('')
    expect(body).toMatch(new RegExp(`references\\s+(?:[\\w"]+\\.)?"?${bare(schema.tables.restaurant)}"?\\b`))
  })
})

describe('l’argent', () => {
  it('déclare au moins deux colonnes de montant', () => {
    expect(schema.moneyColumns.length, 'le prix d’un plat et le total d’une commande, au moins').toBeGreaterThanOrEqual(2)
  })

  it('range chaque montant dans une colonne entière', () => {
    const sql = migrationsSql()
    for (const reference of [...schema.moneyColumns, schema.lineUnitPriceColumn]) {
      const type = declaredType(sql, reference)
      expect(type, `colonne « ${reference} » introuvable dans les migrations`).toBeDefined()
      expect(
        /^(integer|int|int4|bigint|int8)$/.test(type ?? ''),
        `« ${reference} » doit être un integer ou un bigint, pas ${type} : l’ariary n’a pas de centimes`,
      ).toBe(true)
    }
  })

  // Le prix figé : copié dans la ligne au moment de la commande.
  it('garde le prix unitaire dans la ligne de commande elle-même', () => {
    const [table = ''] = schema.lineUnitPriceColumn.toLowerCase().replace(/"/g, '').split('.').slice(-2)
    expect(
      table,
      'lineUnitPriceColumn doit être une colonne de la table des lignes de commande, sous la forme table.colonne',
    ).toBe(bare(schema.tables.orderLine))
  })
})

describe('les heures et les instants', () => {
  it('range les heures d’ouverture en time, sans fuseau', () => {
    const sql = migrationsSql()
    expect(schema.hoursColumns.length, 'déclarez l’heure d’ouverture et l’heure de fermeture').toBeGreaterThanOrEqual(2)
    for (const reference of schema.hoursColumns) {
      const type = declaredType(sql, reference)
      expect(type, `colonne « ${reference} » introuvable dans les migrations`).toBeDefined()
      expect(
        /^(time|time without time zone)$/.test(type ?? ''),
        `« ${reference} » doit être de type time : une heure locale, pas ${type}`,
      ).toBe(true)
    }
  })

  it('déclare au moins une colonne d’instant', () => {
    expect(
      schema.instantColumns.length,
      'déclarez vos colonnes d’instant dans schema.instantColumns',
    ).toBeGreaterThan(0)
  })

  it('range les instants en timestamptz, jamais sans fuseau', () => {
    const sql = migrationsSql()
    for (const reference of schema.instantColumns) {
      const type = declaredType(sql, reference)
      expect(
        type,
        `colonne « ${reference} » introuvable dans les migrations`,
      ).toBeDefined()
      expect(
        /^(timestamptz|timestamp with time zone)$/.test(type ?? ''),
        `la colonne « ${reference} » doit être un timestamptz, pas ${type}`,
      ).toBe(true)
    }
  })
})
