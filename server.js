import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialState, toolDefinitions, runTool } from './core.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(root, 'public');
const dataDir = join(root, 'data');
const stateFile = join(dataDir, 'state.json');
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4173);
const protocolVersion = '2025-11-25';

let stateQueue = Promise.resolve();

async function loadState() {
  await mkdir(dataDir, { recursive: true });
  try {
    return JSON.parse(await readFile(stateFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const initial = structuredClone(initialState);
    await saveState(initial);
    return initial;
  }
}

async function saveState(state) {
  state.updatedAt = new Date().toISOString();
  await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function callTool(name, args = {}) {
  const operation = stateQueue.then(async () => {
    const state = await loadState();
    const outcome = runTool(name, args, state);
    if (outcome.changed) await saveState(outcome.state);
    return outcome.result;
  });
  stateQueue = operation.then(() => undefined, () => undefined);
  return operation;
}
function jsonRpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

async function handleMcp(request, response) {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, { Allow: 'POST, GET, DELETE, OPTIONS' }).end();
    return;
  }
  if (request.method === 'GET') {
    response.writeHead(405, { Allow: 'POST, OPTIONS' }).end();
    return;
  }
  if (request.method !== 'POST') {
    response.writeHead(405, { Allow: 'POST, OPTIONS' }).end();
    return;
  }

  const origin = request.headers.origin;
  const forwardedProtocol = String(request.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const expectedOrigin = `${forwardedProtocol}://${request.headers.host}`;
  if (origin && origin !== expectedOrigin) {
    response.writeHead(403).end('Origin not allowed');
    return;
  }

  let message;
  try {
    let body = '';
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 1_000_000) throw new Error('Request body too large');
    }
    message = JSON.parse(body);
  } catch {
    response.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify(jsonRpcError(null, -32700, 'Parse error')));
    return;
  }

  if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    response.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify(jsonRpcError(message.id ?? null, -32600, 'Invalid Request')));
    return;
  }

  if (message.method.startsWith('notifications/')) {
    response.writeHead(202, { 'MCP-Protocol-Version': protocolVersion }).end();
    return;
  }

  let result;
  try {
    switch (message.method) {
      case 'initialize':
        if (message.params?.protocolVersion !== protocolVersion) {
          response.writeHead(200, { 'Content-Type': 'application/json', 'MCP-Protocol-Version': protocolVersion });
          response.end(JSON.stringify(jsonRpcError(message.id, -32602, `Supported protocol version: ${protocolVersion}`)));
          return;
        }
        result = {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'supper-sense', version: '1.0.0' },
          instructions: 'Use saved pantry and preferences to suggest simple dinners. Ask before adding missing ingredients to the shopping list.',
        };
        break;
      case 'ping':
        result = {};
        break;
      case 'tools/list':
        result = { tools: toolDefinitions };
        break;
      case 'tools/call': {
        if (!toolDefinitions.some((tool) => tool.name === message.params?.name)) {
          result = { content: [{ type: 'text', text: `Unknown tool: ${message.params?.name}` }], isError: true };
          break;
        }
        const data = await callTool(message.params.name, message.params.arguments);
        result = { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data, isError: false };
        break;
      }
      default:
        response.writeHead(200, { 'Content-Type': 'application/json', 'MCP-Protocol-Version': protocolVersion });
        response.end(JSON.stringify(jsonRpcError(message.id, -32601, `Method not found: ${message.method}`)));
        return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json', 'MCP-Protocol-Version': protocolVersion });
    response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
  } catch (error) {
    response.writeHead(200, { 'Content-Type': 'application/json', 'MCP-Protocol-Version': protocolVersion });
    response.end(JSON.stringify({
      jsonrpc: '2.0', id: message.id,
      result: { content: [{ type: 'text', text: error.message }], isError: true },
    }));
  }
}

const mimeTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, `http://${host}:${port}`).pathname;
  if (pathname === '/api/meta' && request.method === 'GET') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ storage: 'local-file', privacy: 'Pantry updates stay with this Supper Sense instance.' }));
    return;
  }
  if (pathname === '/api/health' && request.method === 'GET') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  if (pathname === '/mcp') {
    await handleMcp(request, response);
    return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const relativePath = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
  const safePath = normalize(relativePath).replace(/^([/\\]|\.\.(?:[/\\]|$))+/, '');
  const filePath = join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; img-src 'self' data:; form-action 'self'",
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

server.listen(port, host, async () => {
  await loadState();
  console.log(`Supper Sense is running at http://${host}:${port}`);
  console.log(`MCP Streamable HTTP endpoint: http://${host}:${port}/mcp (spec ${protocolVersion})`);
});
