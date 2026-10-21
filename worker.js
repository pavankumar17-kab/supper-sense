import { initialState, toolDefinitions, runTool } from './core.js';

const protocolVersion = '2025-11-25';

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'MCP-Protocol-Version': protocolVersion },
  });
}

async function readHousehold(db) {
  const [pantryResult, preferenceRow, shoppingResult] = await Promise.all([
    db.prepare('SELECT name FROM pantry_items ORDER BY name').all(),
    db.prepare('SELECT avoid_json FROM household_preferences WHERE id = 1').first(),
    db.prepare('SELECT name FROM shopping_items ORDER BY name').all(),
  ]);
  return {
    pantry: pantryResult.results.map((row) => row.name),
    preferences: { avoid: preferenceRow ? JSON.parse(preferenceRow.avoid_json) : initialState.preferences.avoid },
    shoppingList: shoppingResult.results.map((row) => row.name),
    updatedAt: null,
  };
}

async function writeHousehold(db, before, after) {
  const statements = [];
  const pantryBefore = new Set(before.pantry);
  const pantryAfter = new Set(after.pantry);
  for (const item of pantryBefore) if (!pantryAfter.has(item)) statements.push(db.prepare('DELETE FROM pantry_items WHERE name = ?').bind(item));
  for (const item of pantryAfter) if (!pantryBefore.has(item)) statements.push(db.prepare('INSERT OR IGNORE INTO pantry_items (name) VALUES (?)').bind(item));

  const shoppingBefore = new Set(before.shoppingList);
  const shoppingAfter = new Set(after.shoppingList);
  for (const item of shoppingBefore) if (!shoppingAfter.has(item)) statements.push(db.prepare('DELETE FROM shopping_items WHERE name = ?').bind(item));
  for (const item of shoppingAfter) if (!shoppingBefore.has(item)) statements.push(db.prepare('INSERT OR IGNORE INTO shopping_items (name) VALUES (?)').bind(item));

  if (JSON.stringify(before.preferences.avoid) !== JSON.stringify(after.preferences.avoid)) {
    statements.push(db.prepare('INSERT INTO household_preferences (id, avoid_json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET avoid_json = excluded.avoid_json').bind(JSON.stringify(after.preferences.avoid)));
  }
  if (statements.length) await db.batch(statements);
}

async function handleMcp(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { Allow: 'POST, GET, OPTIONS' } });
  if (request.method === 'GET') return new Response('Streamable HTTP endpoint. Send an MCP JSON-RPC POST request.', { status: 405, headers: { Allow: 'POST, OPTIONS' } });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST, OPTIONS' } });

  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return new Response('Origin not allowed', { status: 403 });

  let message;
  try {
    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.toLowerCase().includes('application/json')) return new Response('Content-Type must be application/json', { status: 415 });
    message = await request.json();
  } catch {
    return jsonResponse(rpcError(null, -32700, 'Parse error'), 400);
  }

  if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') return jsonResponse(rpcError(message.id, -32600, 'Invalid Request'), 400);
  if (message.method.startsWith('notifications/')) return new Response(null, { status: 202, headers: { 'MCP-Protocol-Version': protocolVersion } });
  if (message.method !== 'initialize' && request.headers.get('MCP-Protocol-Version') !== protocolVersion) {
    return jsonResponse(rpcError(message.id, -32600, `Send MCP-Protocol-Version: ${protocolVersion}`), 400);
  }

  try {
    switch (message.method) {
      case 'initialize':
        if (message.params?.protocolVersion !== protocolVersion) return jsonResponse(rpcError(message.id, -32602, `Supported protocol version: ${protocolVersion}`));
        return jsonResponse({
          jsonrpc: '2.0', id: message.id,
          result: {
            protocolVersion,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'supper-sense', version: '1.0.0' },
            instructions: 'Use the shared household pantry and preferences to suggest simple dinners. Ask before adding missing ingredients to the shopping list.',
          },
        });
      case 'ping':
        return jsonResponse({ jsonrpc: '2.0', id: message.id, result: {} });
      case 'tools/list':
        return jsonResponse({ jsonrpc: '2.0', id: message.id, result: { tools: toolDefinitions } });
      case 'tools/call': {
        const name = message.params?.name;
        if (!toolDefinitions.some((tool) => tool.name === name)) {
          return jsonResponse({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true } });
        }
        const before = await readHousehold(env.DB);
        const outcome = runTool(name, message.params?.arguments || {}, before);
        if (outcome.changed) await writeHousehold(env.DB, before, outcome.state);
        return jsonResponse({
          jsonrpc: '2.0', id: message.id,
          result: { content: [{ type: 'text', text: JSON.stringify(outcome.result) }], structuredContent: outcome.result, isError: false },
        });
      }
      default:
        return jsonResponse(rpcError(message.id, -32601, `Method not found: ${message.method}`));
    }
  } catch (error) {
    if (message.method === 'tools/call') {
      return jsonResponse({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: error.message }], isError: true } });
    }
    return jsonResponse(rpcError(message.id, -32603, 'Internal error'));
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/mcp') return handleMcp(request, env);
    if (url.pathname === '/api/meta') {
      return Response.json({ storage: 'cloudflare-d1', privacy: 'Your household shares this private Supper Sense pantry and shopping list.' }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (url.pathname === '/api/health') return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    return env.ASSETS.fetch(request);
  },
};
