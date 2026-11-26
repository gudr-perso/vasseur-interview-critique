import { Link } from 'react-router-dom'
import { LIBELLES_POSTE } from '../../shared/tarifs'
import { api } from './api'
import { Chargement, CLASSE_LIEN, ErreurChargement, useChargement } from './commun'
import { dollars } from './montants'
import { SectionFiche } from './SectionFiche'

/** Section « Coût de l'IA » de la fiche projet : les trois postes du projet et leur total. */
export function ProjetCouts({ projetId }: { projetId: string }) {
  const { etat, recharger } = useChargement(() => api.couts.projet(projetId), projetId)

  return (
    <SectionFiche titre="Coût de l'IA" aide="Ce que les appels à l'IA ont coûté pour ce projet.">
      {etat.phase === 'chargement' && <Chargement />}
      {etat.phase === 'erreur' && <ErreurChargement message={etat.message} onReessayer={recharger} />}
      {etat.phase === 'pret' && (
        <>
          <dl className="grid gap-1.5 text-[0.9rem]">
            {(['cadrage', 'interview', 'analyse'] as const).map(poste => (
              <div key={poste} className="flex justify-between gap-4">
                <dt>{LIBELLES_POSTE[poste]}</dt>
                <dd className="font-mono tabular-nums">{dollars(etat.donnees[poste])}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4 border-t border-border pt-1.5 font-medium">
              <dt>Total</dt>
              <dd className="font-mono tabular-nums">{dollars(etat.donnees.total)}</dd>
            </div>
          </dl>
          {etat.donnees.tarifs_manquants.length > 0 && (
            <p className="text-[0.8rem] text-warn-fg mt-3 break-words">
              Tarif manquant pour : {etat.donnees.tarifs_manquants.join(', ')} — à ajouter dans shared/tarifs.ts
            </p>
          )}
        </>
      )}
      <p className="mt-4">
        <Link to="/admin/couts" className={CLASSE_LIEN}>Tous les coûts</Link>
      </p>
    </SectionFiche>
  )
}
