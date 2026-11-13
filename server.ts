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
    app.use(express.static(distPath));

    // Handle SPA fallback - serve index.html for any unknown route (Express 5 compatible)
    app.use((req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
