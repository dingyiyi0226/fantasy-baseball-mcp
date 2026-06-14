import * as http from "node:http";

const PORT = 8488;
export const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const TIMEOUT_MS = 5 * 60 * 1000;

const SUCCESS_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Authorization complete</title>
<style>body{font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center}
h2{color:#1a7f37}p{color:#444;line-height:1.6}code{background:#f4f4f4;padding:2px 6px;border-radius:3px}</style>
</head>
<body>
<h2>Authorization complete!</h2>
<p>Yahoo has connected your account.</p>
<p>Go back to Claude and say <code>fantasy authorize</code> to finish setup.</p>
</body>
</html>`;

function errorHtml(detail: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Authorization failed</title>
<style>body{font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center}
h2{color:#d1242f}p{color:#444;line-height:1.6}code{background:#f4f4f4;padding:2px 6px;border-radius:3px}</style>
</head>
<body>
<h2>Authorization failed</h2>
<p>${detail}</p>
<p>Go back to Claude and say <code>fantasy start</code> to try again.</p>
</body>
</html>`;
}

/**
 * Starts a temporary HTTP server on localhost that captures Yahoo's OAuth redirect.
 * Resolves with the authorization code, or rejects on error or 5-minute timeout.
 * The server shuts itself down as soon as it receives the callback.
 */
export function startCallbackServer(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let url: URL;
      try {
        url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
      } catch {
        res.writeHead(400);
        res.end("Bad request");
        return;
      }

      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(errorHtml(`Yahoo returned an error: ${error}`));
        server.close();
        reject(new Error(`Yahoo authorization error: ${error}`));
        return;
      }

      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(errorHtml("No authorization code was received."));
        server.close();
        reject(new Error("No authorization code in callback URL"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(SUCCESS_HTML);
      server.close();
      clearTimeout(timeout);
      resolve(code);
    });

    server.listen(PORT, "127.0.0.1");

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(
          new Error(
            `Port ${PORT} is already in use. Close whatever is using it and try again.`,
          ),
        );
      } else {
        reject(new Error(`Callback server error: ${err.message}`));
      }
    });

    const timeout = setTimeout(() => {
      server.close();
      reject(
        new Error(
          "Authorization timed out after 5 minutes. Say `fantasy start` to try again.",
        ),
      );
    }, TIMEOUT_MS);

    timeout.unref();
  });
}
