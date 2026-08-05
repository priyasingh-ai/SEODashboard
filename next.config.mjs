/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /**
   * Pin the workspace root to this directory.
   *
   * Next walks up from here looking for lockfiles to infer the root, and an
   * unrelated `package-lock.json` in the home directory outranked ours — so it
   * picked `~` and warned on every boot. Left alone it would also widen output
   * file tracing to the whole home tree.
   *
   * `import.meta.dirname` rather than `process.cwd()`: this resolves to the
   * config's own location, so it stays correct no matter where the process is
   * launched from.
   */
  outputFileTracingRoot: import.meta.dirname,

  // Brotli/gzip the HTML and RSC payloads. On by default under `next start`;
  // stated explicitly so a change of host can't silently turn it off.
  compress: true,

  // Drop the `X-Powered-By: Next.js` header — a free byte on every response and
  // one less thing advertising the stack.
  poweredByHeader: false,

  experimental: {
    /**
     * Rewrite barrel imports to deep imports at build time.
     *
     * These packages re-export everything through one index file, so
     * `import { Search } from "lucide-react"` pulls the whole icon set into the
     * module graph and leans on tree-shaking to claw it back — which it does
     * imperfectly, especially in dev. This turns each into a direct path import,
     * so only the icons, chart pieces and Radix primitives actually referenced
     * are bundled. Recharts and lucide are the two that move the needle here:
     * recharts is the heaviest thing on the chart pages, and lucide is imported
     * on nearly every screen.
     *
     * Purely a build transform — no API or output shape changes.
     */
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "framer-motion",
      "date-fns",
      "@radix-ui/react-avatar",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-popover",
      "@radix-ui/react-select",
      "@radix-ui/react-tabs",
      "@radix-ui/react-tooltip",
    ],
  },
};

export default nextConfig;
