import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 20000,
    // Chaque fichier démarre sa propre base Miniflare dans `beforeAll` : sous charge, ce démarrage
    // dépasse les 10 s par défaut. On lui laisse plus de temps et on limite les fichiers en parallèle.
    hookTimeout: 60000,
    poolOptions: {
      forks: { minForks: 1, maxForks: 4 },
    },
  },
})
