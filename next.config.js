const { PHASE_DEVELOPMENT_SERVER } = require("next/constants");

/** @type {import('next').NextConfig | ((phase: string) => import('next').NextConfig)} */
module.exports = (phase) => ({
  // Keep a live dev server isolated from files rewritten by `next build`.
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
});
