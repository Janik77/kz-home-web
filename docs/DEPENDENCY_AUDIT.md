# Dependency audit

Baseline npm audit: 13 (3 high, 10 moderate). Compatible `npm update` only, no --force, no major overrides, no security bypass. Lockfile updates preserve the existing package.json ranges and React/TypeScript/Vite stack.

Vite 8.3.2 → 8.3.8; Zod → 4.6.7; other compatible dependency patches/minors refreshed. High advisories are eliminated. Current audit: 10 moderate, all in the development lint dependency chain rooted in minimatch 10.2.6 (GHSA-g3hv-75wg-m249). ESLint 10.14.0 and typescript-eslint 8.72.2 still depend on the affected major. npm proposes cross-major downgrades (ESLint 9.39.5 / typescript-eslint 8.36.0); these are not applied blindly. A forced minimatch 11 override crosses the dependency's declared range and is not called a compatible fix. These advisories concern crafted glob processing in development tooling, not a claim that exposure is impossible. Do not lint untrusted arbitrary pattern input. Track upstream range updates.

Commands: `npm ci`, `npm audit`, `npm audit --omit=dev`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`, `npm run test:e2e:core`.
