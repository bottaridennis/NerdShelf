import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Proxy for OpenLibrary
  app.get("/api/proxy/openlibrary", async (req, res) => {
    const { title } = req.query;
    if (!title) return res.status(400).json({ error: "Title is required" });

    try {
      const response = await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(title as string)}&limit=5`);
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Proxy error (OpenLibrary):", error);
      res.status(500).json({ error: "Failed to fetch from OpenLibrary" });
    }
  });

  // Proxy for AniList
  app.post("/api/proxy/anilist", async (req, res) => {
    try {
      const response = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(req.body)
      });
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Proxy error (AniList):", error);
      res.status(500).json({ error: "Failed to fetch from AniList" });
    }
  });

  // Proxy for MangaDex
  app.get("/api/proxy/mangadex", async (req, res) => {
    const { title } = req.query;
    if (!title) return res.status(400).json({ error: "Title is required" });

    try {
      const response = await fetch(`https://api.mangadex.org/manga?title=${encodeURIComponent(title as string)}&limit=5&includes[]=cover_art&includes[]=author`);
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Proxy error (MangaDex):", error);
      res.status(500).json({ error: "Failed to fetch from MangaDex" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
