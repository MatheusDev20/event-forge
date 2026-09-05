/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@repo/ui'],
  /*
   * Next 16 writes an AGENTS.md and CLAUDE.md into the app root on every dev
   * run. This repo documents itself in docs/ and the ADRs, so those files
   * would be two generated, unowned, always-dirty entries in git status.
   * `apps/web` has neither; turning generation off is what keeps that true
   * here rather than relying on someone remembering to delete them.
   */
  agentRules: false,
};

export default nextConfig;
