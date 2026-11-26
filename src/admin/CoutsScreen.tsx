import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { DATE_RELEVE_TARIFS, LIBELLES_POSTE } from '../../shared/tarifs'
import type { CoutsGlobaux } from '../../shared/couts'
import { api } from './api'
import { Chargement, ErreurChargement, TitreEcran, useChargement } from './commun'
import { dollars } from './montants'

type Periode = 'mois' | 'debut'

/** Premier jour du mois courant, `AAAA-MM-01`, en UTC comme les dates enregistrées. */
function debutDuMois(): string {
  const maintenant = new Date()
  return `${maintenant.getUTCFullYear()}-${String(maintenant.getUTCMonth() + 1).padStart(2, '0')}-01`
}

/** « 2026-11-26 » → « 26/11/2026 ». */
function dateReleve(iso: string): string {
  const [annee, mois, jour] = iso.split('-')
  return `${jour}/${mois}/${annee}`
}

const CELLULE = 'px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap'
const ENTETE = 'px-3 py-2 text-right font-mono text-[0.62rem] uppercase tracking-wider text-muted font-normal'

function Tableau({ couts }: { couts: CoutsGlobaux }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[0.86rem] border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className={`${ENTETE} text-left`}>Projet</th>
            <th scope="col" className={ENTETE}>{LIBELLES_POSTE.cadrage}</th>
            <th scope="col" className={ENTETE}>{LIBELLES_POSTE.interview}</th>
            <th scope="col" className={ENTETE}>{LIBELLES_POSTE.analyse}</th>
            <th scope="col" className={ENTETE}>Total</th>
          </tr>
        </thead>
        <tbody>
          {couts.projets.map(p => (
            <tr key={p.projet_id} className="border-b border-border">
              <th scope="row" className="px-3 py-2 text-left font-normal break-words min-w-0">
                {p.supprime
                  ? <span className="text-muted">{p.titre}</span>
                  : <Link to={`/admin/projets/${p.projet_id}`} className="text-red underline">{p.titre}</Link>}
              </th>
              <td className={CELLULE}>{dollars(p.cadrage)}</td>
              <td className={CELLULE}>{dollars(p.interview)}</td>
              <td className={CELLULE}>{dollars(p.analyse)}</td>
              <td className={`${CELLULE} font-medium`}>{dollars(p.total)}</td>
            </tr>
          ))}
          <tr className="border-b border-border">
            <th scope="row" className="px-3 py-2 text-left font-normal">{LIBELLES_POSTE.interview_critique} <span className="text-muted">(hors projet)</span></th>
            <td className={CELLULE} colSpan={3} />
            <td className={`${CELLULE} font-medium`}>{dollars(couts.hors_projet)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export function CoutsScreen() {
  const [periode, setPeriode] = useState<Periode>('mois')
  const depuis = periode === 'mois' ? debutDuMois() : undefined
  const { etat, recharger } = useChargement(() => api.couts.globaux(depuis), periode)

  return (
    <>
      <TitreEcran titre="Coûts de l'IA">
        <div className="flex gap-2" role="group" aria-label="Période">
          <Button size="sm" variant={periode === 'mois' ? 'primary' : 'ghost'} aria-pressed={periode === 'mois'} onClick={() => setPeriode('mois')}>
            Ce mois-ci
          </Button>
          <Button size="sm" variant={periode === 'debut' ? 'primary' : 'ghost'} aria-pressed={periode === 'debut'} onClick={() => setPeriode('debut')}>
            Depuis le début
          </Button>
        </div>
      </TitreEcran>
      {etat.phase === 'chargement' && <Chargement />}
      {etat.phase === 'erreur' && <ErreurChargement message={etat.message} onReessayer={recharger} />}
      {etat.phase === 'pret' && (
        <Card padding="lg">
          {etat.donnees.nb_appels === 0 ? (
            <p className="text-[0.9rem] text-muted">Aucune consommation enregistrée.</p>
          ) : (
            <>
              <p className="font-display text-[2.2rem] leading-none mb-5">{dollars(etat.donnees.total)}</p>
              <Tableau couts={etat.donnees} />
            </>
          )}
          {etat.donnees.tarifs_manquants.length > 0 && (
            <p className="text-[0.8rem] text-warn-fg mt-4 break-words">
              Tarif manquant pour : {etat.donnees.tarifs_manquants.join(', ')} — à ajouter dans shared/tarifs.ts
            </p>
          )}
          <p className="font-mono text-[0.62rem] text-muted mt-4">Tarifs relevés le {dateReleve(DATE_RELEVE_TARIFS)}</p>
        </Card>
      )}
    </>
  )
}
