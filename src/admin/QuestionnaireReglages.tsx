import { LIMITES, MODES, type Mode } from '../../shared/interviews'
import { Card } from '../components/ui/Card'
import { ChampListe, ChampTexte, ChampZone } from './champs'
import { LIBELLES_MODE, optionsDe } from './libelles'
import { BORNES, modifsChangementMode, type Brouillon } from './questionnaireBrouillon'

const OPTIONS_MODE = optionsDe(MODES, LIBELLES_MODE)

function aideBornes({ min, max }: { min: number; max: number }): string {
  return `De ${min} à ${max}`
}

export function QuestionnaireReglages({ brouillon, onChange }: { brouillon: Brouillon; onChange: (modif: Partial<Brouillon>) => void }) {
  const hybride = brouillon.mode === 'hybride'

  const changerMode = (mode: Mode) => {
    if (mode === brouillon.mode) return
    if (!window.confirm('Changer de mode efface les questions saisies.')) return
    onChange(modifsChangementMode(mode))
  }

  return (
    <Card padding="lg">
      <section aria-labelledby="titre-reglages">
        <h2 id="titre-reglages" className="font-display text-[1.1rem] mb-4">Réglages</h2>
        <ChampTexte
          id="reglage-public" libelle="Public visé" valeur={brouillon.public_vise}
          onChange={public_vise => onChange({ public_vise })} maxLength={LIMITES.public_vise}
        />
        <ChampListe id="reglage-mode" libelle="Mode" valeur={brouillon.mode} options={OPTIONS_MODE} onChange={changerMode} />
        <ChampZone
          id="reglage-introduction" libelle="Introduction" valeur={brouillon.introduction} lignes={5}
          onChange={introduction => onChange({ introduction })} maxLength={LIMITES.introduction}
          aide="Premier écran du répondant : qui interroge, pourquoi, combien de temps, ce qui sera fait des réponses"
        />
        <div className="grid gap-x-4 sm:grid-cols-3">
          <ChampTexte
            id="reglage-duree" libelle="Durée estimée (minutes)" type="number" inputMode="numeric"
            valeur={brouillon.duree} onChange={duree => onChange({ duree })} aide={aideBornes(BORNES.duree)} {...BORNES.duree}
          />
          {hybride && (
            <ChampTexte
              id="reglage-relances" libelle="Relances par question" type="number" inputMode="numeric"
              valeur={brouillon.relances} onChange={relances => onChange({ relances })}
              aide={aideBornes(BORNES.relances)} {...BORNES.relances}
            />
          )}
          <ChampTexte
            id="reglage-tours" libelle={hybride ? 'Plafond de relances au total' : 'Plafond de questions'}
            type="number" inputMode="numeric" valeur={brouillon.tours} onChange={tours => onChange({ tours })}
            aide={aideBornes(BORNES.tours)} {...BORNES.tours}
          />
        </div>
      </section>
    </Card>
  )
}
