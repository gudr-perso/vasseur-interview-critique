import { defineConfig } from 'vitest/config'

// Évaluations avec l'IA réelle (appels payants), lancées à la main : `npm run eval:relances`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/eval/**/*.eval.ts'],
    testTimeout: 60000,
    // Un cas après l'autre : durées mesurées sans concurrence.
    fileParallelism: false,
  },
})
