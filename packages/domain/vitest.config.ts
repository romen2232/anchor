import { defineConfig } from 'vitest/config';
import { quickpickle } from 'quickpickle';

export default defineConfig({
  plugins: [quickpickle()],
  test: {
    include: ['test/**/*.test.ts', 'features/**/*.feature'],
    setupFiles: ['features/steps/index.ts'],
  },
});
