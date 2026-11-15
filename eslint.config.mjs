import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

export default generateEslintConfig({
	enableTypescript: true,
	ignores: ['tests/**', 'vitest.config.ts'],
})
