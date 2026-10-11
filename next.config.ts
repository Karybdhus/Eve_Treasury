import type { NextConfig } from 'next';
const config: NextConfig = { serverExternalPackages: ['node:sqlite'], distDir: process.env.DASHBOARD_ISOLATED_BUILD === '1' ? '.next-acceptance' : '.next' };
export default config;
