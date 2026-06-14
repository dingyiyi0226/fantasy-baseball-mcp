import * as https from "node:https";
import { generate as generateCert } from "selfsigned";

const PORT = 8488;
export const REDIRECT_URI = `https://localhost:${PORT}/callback`;
const TIMEOUT_MS = 5 * 60 * 1000;

// Generated once per process; kept in memory only.
let tlsCreds: { key: string; cert: string } | null = null;

async function getTlsCreds(): Promise<{ key: string; cert: string }> {
  if (!tlsCreds) {
    const result = await generateCert(
      [{ name: "commonName", value: "localhost" }],
      {
        algorithm: "sha256",
        notAfterDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    );
    tlsCreds = { key: result.private, cert: result.cert };
  }
  return tlsCreds;
}

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
 * Starts a temporary HTTPS server on localhost that captures Yahoo's OAuth redirect.
 * Resolves with the authorization code, or rejects on error or 5-minute timeout.
 * The server shuts itself down as soon as it receives the callback.
 *
 * Uses a self-signed TLS certificate. The browser will show a security warning —
 * the user must click "Advanced" → "Proceed to localhost" to continue.
 */
export async function startCallbackServer(): Promise<string> {
  const tls = await getTlsCreds();

  return new Promise((resolve, reject) => {
    const server = https.createServer(tls, (req, res) => {
      let url: URL;
      try {
        url = new URL(req.url ?? "/", `https://localhost:${PORT}`);
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
