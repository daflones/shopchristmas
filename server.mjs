import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.mjs", ["app.mjs", "text/javascript; charset=utf-8"]],
  ["/catalog.mjs", ["catalog.mjs", "text/javascript; charset=utf-8"]],
  ["/site-config.mjs", ["site-config.mjs", "text/javascript; charset=utf-8"]],
  ["/pedido.html", ["pedido.html", "text/html; charset=utf-8"]],
  ["/pedido.mjs", ["pedido.mjs", "text/javascript; charset=utf-8"]],
  ["/jkhsjadmin", ["admin.html", "text/html; charset=utf-8"]],
  ["/admin.mjs", ["admin.mjs", "text/javascript; charset=utf-8"]],
  ["/assets/trees.webp", ["assets/trees.webp", "image/webp"]],
  ["/assets/campaign.webp", ["assets/campaign.webp", "image/webp"]],
  ["/assets/pix-garantia.webp", ["assets/pix-garantia.webp", "image/webp"]],
  ["/assets/produto-montagem.webp", ["assets/produto-montagem.webp", "image/webp"]],
  ["/assets/produto-180.webp", ["assets/produto-180.webp", "image/webp"]],
  ["/assets/produto-main.webp", ["assets/produto-main.webp", "image/webp"]],
  ["/assets/produto-detalhes.webp", ["assets/produto-detalhes.webp", "image/webp"]],
  ["/assets/favicon.png", ["assets/favicon.png", "image/png"]],
  ["/assets/apple-touch-icon.png", ["assets/apple-touch-icon.png", "image/png"]],
  ["/favicon.ico", ["assets/favicon.png", "image/png"]],
  ["/assets/reviews/carol-perfil.webp", ["assets/reviews/carol-perfil.webp", "image/webp"]],
  ["/assets/reviews/carol.webp", ["assets/reviews/carol.webp", "image/webp"]],
  ["/assets/reviews/carol.mp4", ["assets/reviews/carol.mp4", "video/mp4"]],
  ["/assets/reviews/jurbero-perfil.webp", ["assets/reviews/jurbero-perfil.webp", "image/webp"]],
  ["/assets/reviews/jurbero.webp", ["assets/reviews/jurbero.webp", "image/webp"]],
  ["/assets/reviews/jurbero2.webp", ["assets/reviews/jurbero2.webp", "image/webp"]],
  ["/assets/reviews/jurbero.mp4", ["assets/reviews/jurbero.mp4", "video/mp4"]],
  ["/assets/reviews/laila-perfil.webp", ["assets/reviews/laila-perfil.webp", "image/webp"]],
  ["/assets/reviews/laila.webp", ["assets/reviews/laila.webp", "image/webp"]],
  ["/assets/reviews/laila.mp4", ["assets/reviews/laila.mp4", "video/mp4"]]
]);

export function createPreviewServer() {
  return createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data: https:; style-src 'self'; script-src 'self'; connect-src 'self' https://qiavgoutaxfaldsgggly.supabase.co https://viacep.com.br; form-action 'none'; frame-ancestors 'none'; base-uri 'none'");
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    let pathname;
    try {
      pathname = new URL(request.url, "http://localhost").pathname;
    } catch {
      response.writeHead(400).end();
      return;
    }
    const file = files.get(pathname);
    if (!file) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Página não encontrada.");
      return;
    }
    try {
      const body = await readFile(new URL(file[0], import.meta.url));
      response.writeHead(200, { "Content-Type": file[1] });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      response.writeHead(500).end("Não foi possível carregar a prévia.");
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || "0.0.0.0";
  createPreviewServer().listen(port, host, () => {
    console.log(`ShopChristmas em http://${host}:${port}`);
  });
}
