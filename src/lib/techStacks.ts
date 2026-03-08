import { Code2, Braces, FileCode, Palette, Box, Server, Terminal, Hexagon, Database } from "lucide-react";

export const TECH_STACKS = [
  // Frontend-only
  { id: "html-tailwind", label: "HTML + Tailwind", icon: Palette, description: "Modern utility-first CSS", category: "frontend" },
  { id: "react-cdn", label: "React", icon: Braces, description: "Component-based UI via CDN", category: "frontend" },
  { id: "vue-cdn", label: "Vue.js", icon: Box, description: "Progressive framework via CDN", category: "frontend" },
  { id: "html-bootstrap", label: "Bootstrap", icon: FileCode, description: "Classic responsive framework", category: "frontend" },
  { id: "vanilla-js", label: "Vanilla JS", icon: Code2, description: "Pure HTML/CSS/JS, no framework", category: "frontend" },
  // Full-stack
  { id: "react-node", label: "React + Node.js", icon: Server, description: "Express REST API backend", category: "fullstack" },
  { id: "react-python", label: "React + Python", icon: Terminal, description: "FastAPI backend", category: "fullstack" },
  { id: "react-go", label: "React + Go", icon: Hexagon, description: "Fiber/Gin backend", category: "fullstack" },
  { id: "nextjs", label: "Next.js Style", icon: Database, description: "React + API routes pattern", category: "fullstack" },
] as const;

export type TechStackId = typeof TECH_STACKS[number]["id"];

// Backend file templates per stack
export const BACKEND_TEMPLATES: Record<string, { files: Record<string, string>; entrypoint: string }> = {
  "react-node": {
    entrypoint: "server/index.js",
    files: {
      "server/index.js": `const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// TODO: Add your API routes here

app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});`,
      "server/routes/api.js": `const express = require('express');
const router = express.Router();

// GET /api/items
router.get('/items', (req, res) => {
  res.json({ data: [], message: 'Add your data logic here' });
});

// POST /api/items
router.post('/items', (req, res) => {
  const item = req.body;
  res.status(201).json({ data: item, message: 'Created' });
});

module.exports = router;`,
      "server/package.json": JSON.stringify({
        name: "backend",
        version: "1.0.0",
        scripts: { start: "node index.js", dev: "nodemon index.js" },
        dependencies: { express: "^4.18.2", cors: "^2.8.5" },
        devDependencies: { nodemon: "^3.0.0" },
      }, null, 2),
    },
  },
  "react-python": {
    entrypoint: "server/main.py",
    files: {
      "server/main.py": `from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uvicorn

app = FastAPI(title="API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health():
    return {"status": "ok"}

# --- Models ---
class Item(BaseModel):
    title: str
    description: Optional[str] = None
    completed: bool = False

# --- Routes ---
items_db: list[dict] = []

@app.get("/api/items")
async def list_items():
    return {"data": items_db}

@app.post("/api/items")
async def create_item(item: Item):
    items_db.append(item.dict())
    return {"data": item.dict(), "message": "Created"}

@app.put("/api/items/{item_id}")
async def update_item(item_id: int, item: Item):
    if item_id < len(items_db):
        items_db[item_id] = item.dict()
        return {"data": item.dict()}
    return {"error": "Not found"}, 404

@app.delete("/api/items/{item_id}")
async def delete_item(item_id: int):
    if item_id < len(items_db):
        deleted = items_db.pop(item_id)
        return {"data": deleted}
    return {"error": "Not found"}, 404

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)`,
      "server/requirements.txt": `fastapi==0.104.1
uvicorn==0.24.0
pydantic==2.5.0`,
      "server/Dockerfile": `FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]`,
    },
  },
  "react-go": {
    entrypoint: "server/main.go",
    files: {
      "server/main.go": `package main

import (
\t"log"
\t"github.com/gofiber/fiber/v2"
\t"github.com/gofiber/fiber/v2/middleware/cors"
)

type Item struct {
\tID          string \`json:"id"\`
\tTitle       string \`json:"title"\`
\tDescription string \`json:"description"\`
\tCompleted   bool   \`json:"completed"\`
}

var items []Item

func main() {
\tapp := fiber.New()
\tapp.Use(cors.New())

\t// Health check
\tapp.Get("/api/health", func(c *fiber.Ctx) error {
\t\treturn c.JSON(fiber.Map{"status": "ok"})
\t})

\t// List items
\tapp.Get("/api/items", func(c *fiber.Ctx) error {
\t\treturn c.JSON(fiber.Map{"data": items})
\t})

\t// Create item
\tapp.Post("/api/items", func(c *fiber.Ctx) error {
\t\tvar item Item
\t\tif err := c.BodyParser(&item); err != nil {
\t\t\treturn c.Status(400).JSON(fiber.Map{"error": err.Error()})
\t\t}
\t\titems = append(items, item)
\t\treturn c.Status(201).JSON(fiber.Map{"data": item})
\t})

\tlog.Fatal(app.Listen(":8080"))
}`,
      "server/go.mod": `module myapp/server

go 1.21

require github.com/gofiber/fiber/v2 v2.51.0`,
      "server/Dockerfile": `FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o server .

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/server .
EXPOSE 8080
CMD ["./server"]`,
    },
  },
  "nextjs": {
    entrypoint: "pages/api/hello.ts",
    files: {
      "pages/api/hello.ts": `import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({ message: 'Hello from API route!' });
}`,
      "pages/api/items.ts": `import type { NextApiRequest, NextApiResponse } from 'next';

let items: any[] = [];

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case 'GET':
      return res.status(200).json({ data: items });
    case 'POST':
      const item = req.body;
      items.push(item);
      return res.status(201).json({ data: item });
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}`,
      "next.config.js": `/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};
module.exports = nextConfig;`,
    },
  },
};
