import { Link } from 'react-router-dom'
import type { RepondantResume } from '../../shared/repondants'
import { Chip } from '../components/ui/Chip'
import { Adresse } from './Adresse'
import { urlInvitation } from './api'
import { formaterDate, libelle, LIBELLES_ORIGINE, LIBELLES_STATUT_REPONDANT, nombre } from './libelles'

const nomComplet = (r: RepondantResume) => `${r.prenom} ${r.nom}`.trim()
const debut = (r: RepondantResume) => (r.commence_le ? formaterDate(r.commence_le) : '—')
const lienEntretien = (r: RepondantResume) => `/admin/repondants/${r.id}`

const CLASSE_TH = 'font-mono text-[0.6rem] uppercase tracking-wider text-muted font-normal text-left px-2.5 py-2'
const CLASSE_TD = 'px-2.5 py-2.5 align-top text-[0.84rem]'

/** Tableau au-delà de 640 px. Pour une invitation, une ligne de plus porte son lien. */
function Tableau({ repondants }: { repondants: RepondantResume[] }) {
  return (
    <table className="hidden sm:table w-full border-collapse">
      <thead>
        <tr className="border-b border-ink">
          <th scope="col" className={CLASSE_TH}>Nom</th>
          <th scope="col" className={CLASSE_TH}>Entreprise</th>
          <th scope="col" className={CLASSE_TH}>Poste</th>
          <th scope="col" className={CLASSE_TH}>Origine</th>
          <th scope="col" className={CLASSE_TH}>Statut</th>
          <th scope="col" className={CLASSE_TH}>Début</th>
          <th scope="col" className={`${CLASSE_TH} text-right`}>Réponses</th>
        </tr>
      </thead>
      {repondants.map(r => (
        <tbody key={r.id} className="border-b border-border hover:bg-paper transition-colors">
          <tr>
            <td className={CLASSE_TD}>
              <Link to={lienEntretien(r)} className="text-ink underline decoration-border underline-offset-2 hover:decoration-red break-words">
                {nomComplet(r)}
              </Link>
            </td>
            <td className={`${CLASSE_TD} break-words`}>{r.entreprise}</td>
            <td className={`${CLASSE_TD} break-words text-muted`}>{r.poste || '—'}</td>
            <td className={`${CLASSE_TD} text-muted`}>{libelle(LIBELLES_ORIGINE, r.origine)}</td>
            <td className={CLASSE_TD}><Chip label={libelle(LIBELLES_STATUT_REPONDANT, r.statut)} /></td>
            <td className={`${CLASSE_TD} whitespace-nowrap`}>{debut(r)}</td>
            <td className={`${CLASSE_TD} text-right font-mono`}>{nombre(r.nb_reponses)}</td>
          </tr>
          {r.origine === 'invitation' && (
            <tr>
              <td colSpan={7} className="px-2.5 pb-2.5">
                <Adresse url={urlInvitation(r.jeton)} />
              </td>
            </tr>
          )}
        </tbody>
      ))}
    </table>
  )
}

/** Liste de cartes sous 640 px. */
function Cartes({ repondants }: { repondants: RepondantResume[] }) {
  return (
    <ul className="sm:hidden grid gap-2">
      {repondants.map(r => (
        <li key={r.id} className="border border-border min-w-0">
          <Link to={lienEntretien(r)} className="block px-3 py-2.5 hover:bg-paper transition-colors">
            <span className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <span className="text-[0.9rem] break-words min-w-0">{nomComplet(r)}</span>
              <Chip label={libelle(LIBELLES_STATUT_REPONDANT, r.statut)} />
            </span>
            <span className="block text-[0.8rem] text-muted break-words">
              {[r.entreprise, r.poste].filter(Boolean).join(' · ')}
            </span>
            <span className="block font-mono text-[0.62rem] text-muted mt-1">
              {libelle(LIBELLES_ORIGINE, r.origine)} · début {debut(r)} · {nombre(r.nb_reponses)} réponse{r.nb_reponses > 1 ? 's' : ''}
            </span>
          </Link>
          {r.origine === 'invitation' && (
            <div className="border-t border-border px-3 py-2"><Adresse url={urlInvitation(r.jeton)} /></div>
          )}
        </li>
      ))}
    </ul>
  )
}

export function ListeRepondants({ repondants }: { repondants: RepondantResume[] }) {
  return (
    <>
      <Tableau repondants={repondants} />
      <Cartes repondants={repondants} />
    </>
  )
}
