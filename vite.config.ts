import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), tailwindcss()],
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './src/test/setup.ts',
        exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov', 'html'],
            exclude: [
                '**/node_modules/**',
                '**/dist/**',
                'e2e/**',
                'src/test/**',
                'src/main.tsx',
                'src/types/**',
                '**/*.d.ts',
            ],
            thresholds: {
                lines: 50,
                functions: 50,
                branches: 40,
                statements: 50,
            },
        },
    },
})
