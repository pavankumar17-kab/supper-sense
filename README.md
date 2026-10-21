# Supper Sense

Supper Sense helps a household plan dinner from ingredients it already has. The web app talks to a working, self-hosted MCP server over Streamable HTTP. Pantry, preferences, meal planning, and shopping list actions are implemented as MCP tools.

This is an independent Team ByteNova prototype, not an Amazon or Alexa product. Meal matching is deterministic and uses the recipes in `core.js`; it does not call an LLM or external food service. A local safety check intercepts self-harm language before any meal-planning tool runs and points to local crisis support resources.

## Run on Windows

1. Install Node.js 20 or later.
2. Open this project folder in VS Code.
3. In the VS Code terminal, run `npm.cmd start`. (This avoids PowerShell's script-policy block on `npm.ps1`.)
4. Leave that terminal open and visit <http://127.0.0.1:4173>.

If port 4173 is already in use, run `$env:PORT = "4174"; npm.cmd start` and visit <http://127.0.0.1:4174>. The app saves local data in `data/state.json`. Keep the server running while using the browser; closing the terminal stops the site.

## What works now

- Add and remove pantry ingredients; the pantry persists between restarts.
- Save dietary preferences and use them when choosing a recipe.
- Get a dinner plan based on available ingredients, including steps and missing items.
- Add missing items to a persistent shopping list and mark them as collected.
- Use the chat box for simple pantry and shopping-list requests.
- Route self-harm messages away from meal planning and show crisis-resource guidance.
- Run the MCP server locally or deploy it as a Cloudflare Worker with a shared D1 household database.

## MCP tools

`get_pantry`, `add_pantry_item`, `remove_pantry_item`, `get_preferences`, `save_preferences`, `plan_meal`, `add_to_shopping_list`, and `get_shopping_list` are served by `/mcp`. The server implements MCP `2025-11-25` over Streamable HTTP.

## Public hosting on Cloudflare

This deployment uses Cloudflare Workers for the app and D1 for shared data. Anyone with the public link can view and change the same pantry, preferences, and shopping list. Do not use it for private household information. Cloudflare Workers Free has a daily request limit; if it is reached, requests stop until the limit resets.

The Worker URL is enabled with `workers_dev: true`. To deploy updates from this project folder, run:

```powershell
npx.cmd wrangler deploy
```

## Hackathon demo

Record the demo only after the prototype is running. The official rules require a public YouTube or Vimeo demo under three minutes, a GitHub repository, working project footage, and product feedback for each developer tool/API/SDK used. The Alexa+ track accepts a working Agent Skill or self-hosted MCP server using at least MCP `2025-11-25` over Streamable HTTP, or a clearly demonstrated simulated Alexa+ experience.

Suggested truthful walkthrough: add a pantry ingredient, ask for dinner, show the returned recipe and MCP-backed pantry, save a dietary preference, add a missing item to the shopping list, then show the safety test being routed away from meal planning. Describe the recipe matcher as deterministic local logic; do not describe it as AI-powered.

## License

MIT. See [LICENSE](LICENSE).
