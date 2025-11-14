import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Globals
    globals: true,

    // Environment
    environment: 'node',

    // Test file patterns
    include: ['tests/**/*.test.js'],
    exclude: ['node_modules', 'dist', '.wrangler'],

    // Coverage
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['functions/**/*.js', 'workers/**/*.js'],
      exclude: [
        'node_modules',
        'tests',
        '**/*.test.js',
        '**/*.config.js',
        'functions/_lib/email-templates.js' // Template soubory
      ],
      all: true,
      lines: 70,
      functions: 70,
      branches: 70,
      statements: 70
    },

    // Test timeout
    testTimeout: 30000, // 30s pro integration testy
    hookTimeout: 30000,

    // Reporters
    reporters: ['verbose'],

    // Pool options pro různé typy testů
    poolOptions: {
      threads: {
        singleThread: false
      }
    }
  }
});
