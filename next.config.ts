import type { NextConfig } from 'next';
const config: NextConfig = {
  serverExternalPackages: ['@remotion/renderer', '@remotion/bundler'],
};
export default config;
