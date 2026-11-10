import vinext from "vinext";
import { defineConfig, loadEnv } from "vite";
import { normalizeDomain } from "./lib/site.ts";

export default defineConfig(async ({ mode }) => {
  // Deploy settings come from the environment or an ignored `.env` file, so forks deploy
  // to their own account and domain. See README → Deploy.
  const env = { ...loadEnv(mode, process.cwd(), "SUMITO_"), ...process.env };
  const isPublicDeploy = env.SUMITO_DEPLOY === "cloudflare";
  const customDomain = isPublicDeploy ? normalizeDomain(env.SUMITO_CUSTOM_DOMAIN) : undefined;

  // Keep Wrangler and Miniflare state project-local.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    // The public site URL, fixed at build time, so page metadata never trusts request headers.
    define: { __SUMITO_SITE_URL__: JSON.stringify(customDomain ? `https://${customDomain}` : "") },
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: {
          name: "sumito",
          main: "./worker/index.ts",
          compatibility_flags: ["nodejs_compat"],
          // With a custom domain, Wrangler creates its DNS record and certificate, and the
          // Worker redirects its workers.dev address there (see worker/index.ts).
          ...(customDomain
            ? { routes: [{ pattern: customDomain, custom_domain: true }], workers_dev: true, vars: { CANONICAL_HOST: customDomain } }
            : {}),
        },
      }),
    ],
  };
});
