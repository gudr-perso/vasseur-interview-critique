import { describe, expect, it } from 'vitest'
import { ETAPES_GUIDE, lireGuide } from '../../server/guides'

describe('guides', () => {
  it('fournit un guide pour chaque étape', () => {
    expect(ETAPES_GUIDE).toEqual(['cadrage', 'questionnaire'])
    for (const etape of ETAPES_GUIDE) expect(lireGuide(etape).length).toBeGreaterThan(800)
  })

  it('le guide de cadrage fixe la profondeur selon le type de demande', () => {
    const guide = lireGuide('cadrage')
    for (const repere of ['evolution_simple', 'amelioration', 'nouvelle_fonctionnalite', 'une seule question à la fois', 'modifier_projet']) {
      expect(guide).toContain(repere)
    }
  })

  it('le guide de questionnaire décrit les deux formats et les outils à appeler', () => {
    const guide = lireGuide('questionnaire')
    for (const repere of ['"questions"', '"question_ouverture"', 'choix_unique', 'echelle', 'objectif', 'enregistrer_questionnaire', 'publier_questionnaire']) {
      expect(guide).toContain(repere)
    }
  })
})
