import express from "express";
import http from "http";
import path from "path";

async function startServer() {
  const app = express();
  const PORT = 3000;
  const httpServer = http.createServer(app);

  // API routes go here FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  if (process.env.NODE_ENV !== "production") {
    const viteReady = (async () => {
      const { createServer: createViteServer } = await import("vite");
      return createViteServer({
        server: {
          middlewareMode: true,
          hmr: false,
        },
        appType: "spa",
      });
    })();

    viteReady.catch((err) => {
      console.error("Failed to initialize Vite dev server:", err);
    });

    app.use(async (req, res, next) => {
      try {
        const vite = await viteReady;
        return vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    // Serve static files in production
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        }
      }
    }));

    // Handle SPA fallback - never serve index.html for missing hashed assets
    app.use((req, res) => {
      if (req.path.startsWith("/assets/")) {
        return res.status(404).end();
      }
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
