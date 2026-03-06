import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

const host = process.env.TAURI_DEV_HOST || "0.0.0.0";

/** Vite plugin: proxy Okta activation API to bypass CORS */
function oktaProxyPlugin() {
  return {
    name: "okta-proxy",
    configureServer(server) {
      server.middlewares.use("/api/okta-activate", async (req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405);
          res.end("Method not allowed");
          return;
        }

        let body = "";
        for await (const chunk of req) body += chunk;

        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "Invalid JSON" }));
          return;
        }

        const { targetUrl, authorization, payload } = parsed;
        if (!targetUrl || !authorization || !payload) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "Missing targetUrl, authorization, or payload" }));
          return;
        }

        try {
          const resp = await fetch(targetUrl, {
            method: "POST",
            headers: {
              "Authorization": authorization,
              "Content-Type": "application/json; charset=UTF-8",
              "Accept": "application/json; charset=UTF-8",
              "User-Agent": "D2DD7D3915.com.okta.android.auth/6.8.1 DeviceSDK/0.19.0 Android/7.1.1 unknown/Google",
            },
            body: JSON.stringify(payload),
          });

          const text = await resp.text();
          res.writeHead(resp.status, { "Content-Type": "application/json" });
          res.end(text);
        } catch (e) {
          res.writeHead(502);
          res.end(JSON.stringify({ error: e.message }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const isWeb = mode === "web";

  return {
    base: isWeb ? (process.env.VITE_BASE_PATH || '/') : '/',
    plugins: isWeb ? [basicSsl(), oktaProxyPlugin()] : [],
    clearScreen: false,
    server: {
      port: 3020,
      strictPort: true,
      host: host || false,
      https: isWeb ? {} : undefined,
      hmr: isWeb
        ? { protocol: "wss", host: "localhost" }
        : host
          ? { protocol: "ws", host, port: 3021 }
          : undefined,
      watch: { ignored: ["**/src-tauri/**"] },
    },
    envPrefix: ["VITE_", "TAURI_ENV_*"],
    build: {
      target: isWeb
        ? "es2022"
        : process.env.TAURI_ENV_PLATFORM === "windows" || process.env.TAURI_ENV_PLATFORM === "android"
          ? "chrome105"
          : "safari13",
      minify: isWeb ? "esbuild" : (!process.env.TAURI_ENV_DEBUG ? "esbuild" : false),
      sourcemap: isWeb ? false : !!process.env.TAURI_ENV_DEBUG,
      outDir: isWeb ? "dist-web" : "dist",
    },
    resolve: isWeb
      ? {
          alias: {
            "@tauri-apps/api/core": "/src/stubs/tauri-stub.js",
            "@tauri-apps/plugin-clipboard-manager": "/src/stubs/tauri-stub.js",
            "@tauri-apps/plugin-store": "/src/stubs/tauri-stub.js",
            "@tauri-apps/api/window": "/src/stubs/tauri-stub.js",
          },
        }
      : {},
  };
});
