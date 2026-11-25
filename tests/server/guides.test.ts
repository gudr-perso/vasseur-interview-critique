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

  it('les deux guides disent de lire les documents utiles avec lire_document', () => {
    for (const etape of ETAPES_GUIDE) expect(lireGuide(etape), etape).toContain('lire_document')
  })

  it('le guide de questionnaire donne les bornes à respecter', () => {
    const guide = lireGuide('questionnaire')
    for (const borne of [
      '40 questions au plus', 'de 1 à 120 minutes', '10 par défaut', 'tours_max', 'de 1 à 30',
      'lettres, chiffres, tiret et souligné', '500 caractères', '200 caractères',
    ]) {
      expect(guide, borne).toContain(borne)
    }
  })
})
