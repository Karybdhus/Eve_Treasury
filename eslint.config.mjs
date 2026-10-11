import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
export default defineConfig([...nextVitals, ...nextTs, globalIgnores(['.next/**', 'next-env.d.ts', 'data/order06/**', 'data/order08/**', 'data/order09/**', 'data/order11-r2/**', 'data/order12/**', 'data/order13/**'])]);
