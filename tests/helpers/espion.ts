/**
 * Enveloppe une base D1 pour les tests : note le SQL préparé et le contenu de chaque `batch`,
 * et laisse une fonction `avant` agir juste avant l'exécution d'une requête (simulation d'une
 * écriture concurrente entre la lecture et l'écriture d'un service).
 */
export function espionner(base: D1Database, avant: (sql: string) => Promise<void> | void = () => {}) {
  const preparees: string[] = []
  const lots: string[][] = []

  class Instruction {
    constructor(readonly sql: string, readonly reel: D1PreparedStatement) {}
    bind(...valeurs: unknown[]) { return new Instruction(this.sql, this.reel.bind(...valeurs)) }
    async run() { await avant(this.sql); return this.reel.run() }
    async first(colonne?: string) { await avant(this.sql); return colonne ? this.reel.first(colonne) : this.reel.first() }
    async all() { await avant(this.sql); return this.reel.all() }
  }

  const db = {
    prepare(sql: string) {
      preparees.push(sql)
      return new Instruction(sql, base.prepare(sql))
    },
    async batch(instructions: Instruction[]) {
      for (const i of instructions) await avant(i.sql)
      lots.push(instructions.map(i => i.sql))
      return base.batch(instructions.map(i => i.reel))
    },
  } as unknown as D1Database

  return { db, preparees, lots }
}
