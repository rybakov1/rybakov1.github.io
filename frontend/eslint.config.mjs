import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';
export default defineConfig({ignores:['dist/**','.astro/**','node_modules/**']}, ...tseslint.configs.recommended);
