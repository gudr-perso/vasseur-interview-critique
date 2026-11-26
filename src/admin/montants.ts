const ENTIER = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const PETIT = new Intl.NumberFormat('fr-FR', { maximumSignificantDigits: 3 })

/** Micro-dollars → « 12,34 $ » ; sous 1 $, trois chiffres significatifs au plus (« 0,042 $ », « 0,0031 $ »). */
export function dollars(micro: number): string {
  const montant = micro / 1_000_000
  if (montant === 0) return '0 $'
  return `${(montant >= 0.9995 ? ENTIER : PETIT).format(montant)} $`
}
