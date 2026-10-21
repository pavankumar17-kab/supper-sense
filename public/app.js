import { isSafetyConcern } from '/safety.js';

const MCP_VERSION = '2025-11-25';
let rpcId = 0;
let currentMeal = null;
let lastAssistantReply = null;
const suggestedRecipeIds = new Set();

const el = (id) => document.getElementById(id);
const conversation = el('conversation');
const input = el('prompt-input');
const toast = el('toast');
let toastTimer;

async function rpc(method, params = undefined) {
  const payload = { jsonrpc: '2.0', id: ++rpcId, method };
  if (params !== undefined) payload.params = params;
  const response = await fetch('/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'MCP-Protocol-Version': MCP_VERSION },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`MCP request failed (${response.status})`);
  if (response.status === 202) return null;
  const message = await response.json();
  if (message.error) throw new Error(message.error.message);
  return message.result;
}

async function callTool(name, args = {}) {
  const result = await rpc('tools/call', { name, arguments: args });
  if (result.isError) throw new Error(result.content?.[0]?.text || 'The kitchen tool could not complete that action.');
  return result.structuredContent ?? JSON.parse(result.content?.[0]?.text || '{}');
}

async function connect() {
  const metaResponse = await fetch('/api/meta', { headers: { Accept: 'application/json' } });
  if (metaResponse.ok) {
    const meta = await metaResponse.json();
    el('privacy-detail').textContent = meta.privacy;
  }
  const info = await rpc('initialize', {
    protocolVersion: MCP_VERSION,
    capabilities: {},
    clientInfo: { name: 'supper-sense-web-client', version: '1.0.0' },
  });
  await rpc('notifications/initialized');
  const catalog = await rpc('tools/list');
  el('connection-label').textContent = `${info.serverInfo.name} · ${catalog.tools.length} kitchen tools ready`;
  el('connection-dot').classList.remove('offline');
  await refreshKitchen();
}

async function refreshKitchen() {
  const [pantry, preferences, list] = await Promise.all([
    callTool('get_pantry'), callTool('get_preferences'), callTool('get_shopping_list'),
  ]);
  el('pantry-summary').textContent = `${pantry.count} ingredients ready for tonight`;
  el('pantry-list').replaceChildren(...(pantry.items.length ? pantry.items.map((item) => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'ingredient-pill';
    pill.setAttribute('aria-label', `Remove ${item} from pantry`);
    pill.title = `Remove ${item}`;
    const label = document.createElement('span');
    label.textContent = item;
    const remove = document.createElement('span');
    remove.className = 'ingredient-remove';
    remove.setAttribute('aria-hidden', 'true');
    remove.textContent = '×';
    pill.append(label, remove);
    pill.addEventListener('click', async () => {
      const result = await callTool('update_pantry', { action: 'remove', ingredient: item });
      await refreshKitchen();
      showToast(result.message);
    });
    return pill;
  }) : [Object.assign(document.createElement('span'), { className: 'pantry-empty', textContent: 'Add what you have to get better ideas.' })]));
  el('preference-label').textContent = preferences.avoid?.length ? `Avoiding ${preferences.avoid.join(', ')}` : 'No preferences saved';
  el('preference-edit').textContent = preferences.avoid?.length ? 'Edit' : 'Set';
  el('list-count').textContent = list.count;
  if (currentMeal) {
    const onHand = currentMeal.meal.ingredients.filter((item) => pantry.items.includes(item));
    const missing = currentMeal.meal.ingredients.filter((item) => !pantry.items.includes(item));
    currentMeal.alreadyHave = onHand;
    currentMeal.missing = missing;
    renderMeal(currentMeal);
  }
}

function addMessage(role, text, options = {}) {
  const row = document.createElement('div');
  row.className = `message ${role === 'user' ? 'user-message' : 'assistant-message'}`;
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.innerHTML = role === 'user' ? 'y' : 's<span>✳</span>';
  const body = document.createElement('div');
  body.className = 'message-body';
  const name = document.createElement('div');
  name.className = 'message-name';
  name.textContent = role === 'user' ? 'You' : 'Supper Sense';
  const time = document.createElement('span');
  time.className = 'message-time';
  time.textContent = options.time || 'just now';
  name.append(time);
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  body.append(name, bubble);
  row.append(avatar, body);
  conversation.append(row);
  conversation.scrollTop = conversation.scrollHeight;
  return row;
}

function addSafetyMessage() {
  const row = addMessage('assistant', '');
  const bubble = row.querySelector('.bubble');
  bubble.textContent = 'I’m sorry you’re facing something this hard. If you might hurt yourself soon, move away from anything dangerous and go to someone you trust now. If you’re in immediate danger, call your local emergency number. You can find crisis support in your country at ';
  const link = document.createElement('a');
  link.href = 'https://findahelpline.com/';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'findahelpline.com';
  bubble.append(link, document.createTextNode('. Are you in immediate danger right now? If this was a test or a quote, you can tell me that too.'));
  return row;
}

function showTyping() {
  const row = document.createElement('div');
  row.className = 'message assistant-message';
  row.innerHTML = '<div class="avatar">s<span>✳</span></div><div class="message-body"><div class="message-name">Supper Sense <span class="message-time">thinking</span></div><div class="bubble typing"><span></span><span></span><span></span></div></div>';
  conversation.append(row);
  conversation.scrollTop = conversation.scrollHeight;
  return row;
}

function setActivity(label, detail) {
  el('tool-activity').innerHTML = `<span class="activity-check">✓</span><div><strong></strong><small></small></div>`;
  el('tool-activity').querySelector('strong').textContent = label;
  el('tool-activity').querySelector('small').textContent = detail;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
}

function parseAvoidance(text) {
  const lower = text.toLowerCase();
  if (!/(remember|avoid|allerg|no dairy|no eggs|no nuts|don't like|do not like|do not want|don't eat|do not eat|can't eat|cannot eat|clear.*preference)/.test(lower)) return null;
  const categories = [];
  if (/dairy|milk|cheese|yogurt/.test(lower)) categories.push('dairy');
  if (/egg/.test(lower)) categories.push('eggs');
  if (/nut|peanut|almond/.test(lower)) categories.push('nuts');
  return categories.length ? categories : null;
}

function parseServings(text) {
  const match = text.match(/\b(for )?(\d{1,2})\b/);
  return match ? Math.max(1, Math.min(12, Number(match[2]))) : 2;
}

function isMealRequest(text) {
  return /\b(dinner|meal|recipe|cook|cooking|eat|food|hungry|use up|use the|make me|suggest|recommend|what can i make|another idea)\b/i.test(text);
}

function friendlyReply(text) {
  if (/^(hi|hello|hey|good evening|good morning|good afternoon)\b/i.test(text.trim())) {
    return 'Hi! I can help plan dinner from your pantry, update ingredients, remember dietary preferences, or manage your shopping list. What would help tonight?';
  }
  if (/\b(thank you|thanks)\b/i.test(text)) return 'You’re welcome. Want to plan another dinner or check your shopping list?';
  return 'I can help with dinner planning, your pantry, dietary preferences, and your shopping list. Try “plan a quick dinner,” “what’s in my pantry?” or “add onions to my pantry.”';
}

function parseIngredientCommand(text, direction) {
  const lower = text.toLowerCase().trim();
  const patterns = direction === 'pantry-add'
    ? [/(?:add|put)\s+(.+?)\s+(?:to|in|into)\s+(?:my|our|the)\s+pantry$/i, /(?:i have|we have|i bought|we bought)\s+(.+)$/i]
    : direction === 'pantry-remove'
      ? [/(?:remove|take)\s+(.+?)\s+from\s+(?:my|our|the)\s+pantry$/i]
      : direction === 'list-add'
        ? [/(?:add|put)\s+(.+?)\s+(?:to|on)\s+(?:my|our|the)\s+(?:shopping|grocery)\s+list$/i]
        : [/(?:remove|got|bought)\s+(.+?)\s+(?:from|off)\s+(?:my|our|the)\s+(?:shopping|grocery)\s+list$/i];
  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (match?.[1]) return match[1].replace(/[.!?]+$/, '').trim();
  }
  return '';
}

async function showPantrySummary() {
  const pantry = await callTool('get_pantry');
  const summary = pantry.items.length ? `You have ${pantry.items.join(', ')}.` : 'Your pantry is empty right now.';
  addMessage('assistant', summary);
  setActivity('Pantry checked', `${pantry.count} ingredients in your household pantry`);
}

async function showShoppingSummary() {
  const list = await callTool('get_shopping_list');
  await renderShoppingList(false);
  addMessage('assistant', list.items.length ? `Your shopping list has ${list.items.join(', ')}.` : 'Your shopping list is clear. Add missing ingredients from a dinner plan.');
  setActivity('Shopping list checked', `${list.count} items on your household list`);
}

function renderMeal(result) {
  currentMeal = result;
  const meal = result.meal;
  if (!meal) return;
  el('meal-section').hidden = false;
  const available = result.alreadyHave.length;
  const total = meal.ingredients.length;
  const tags = [meal.minutes ? `${meal.minutes} min` : null, ...meal.tags.filter((tag) => ['vegetarian', 'dairy-free', 'gluten-free'].includes(tag)).slice(0, 2)].filter(Boolean);
  const missingContent = result.missing.length
    ? `<ul>${result.missing.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : '<ul><li>You have everything for this meal</li></ul>';
  el('meal-card').innerHTML = `
    <div class="meal-main">
      <div class="meal-topline"><span class="meal-icon">☼</span> A good fit for tonight</div>
      <h3>${escapeHtml(meal.name)}</h3>
      <div class="meal-note">${escapeHtml(meal.note)} ${available} of ${total} ingredients are already in your pantry.</div>
      <div class="meal-tags">${tags.map((tag) => `<span class="meal-tag">${escapeHtml(tag)}</span>`).join('')}</div>
      <div class="meal-actions"><button class="primary-button" id="add-missing">${result.missing.length ? 'Add missing to list' : 'Start cooking'}</button><button class="secondary-button" id="another-meal">Try another idea</button></div>
    </div>
    <div class="meal-details">
      <h4>Cook along</h4>
      <div class="meal-columns"><div><h5>${available} on hand</h5><ul>${result.alreadyHave.map((item) => `<li>${escapeHtml(item)}</li>`).join('') || '<li>Nothing yet</li>'}</ul></div><div><h5>${result.missing.length} to pick up</h5>${missingContent}</div></div>
      <p class="cook-along-hint">Press “Start cooking” to reveal instructions one step at a time.</p>
    </div>
    <div class="cooking-guide" id="cooking-guide" hidden aria-live="polite"></div>`;
  const actionButton = el('add-missing');
  const guide = el('cooking-guide');
  let cookingStep = 0;
  let cookingComplete = false;
  actionButton?.addEventListener('click', async () => {
    if (currentMeal.missing.length) {
      actionButton.disabled = true;
      const added = await callTool('add_to_shopping_list', { items: currentMeal.missing });
      await refreshKitchen();
      actionButton.textContent = 'Added to shopping list ✓';
      showToast(added.message);
      addMessage('assistant', `${added.message} Your shopping list is ready whenever you need it.`);
      return;
    }
    if (cookingComplete) return;
    if (cookingStep < meal.steps.length) {
      guide.hidden = false;
      guide.replaceChildren();
      const label = document.createElement('strong');
      label.textContent = `Step ${cookingStep + 1} of ${meal.steps.length}`;
      const instruction = document.createElement('p');
      instruction.textContent = meal.steps[cookingStep];
      guide.append(label, instruction);
      setActivity(`Cooking step ${cookingStep + 1} of ${meal.steps.length}`, meal.name);
      addMessage('assistant', `Step ${cookingStep + 1}: ${meal.steps[cookingStep]}`);
      cookingStep += 1;
      actionButton.textContent = cookingStep < meal.steps.length ? 'Next step' : 'Finish cooking';
      guide.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    cookingComplete = true;
    guide.replaceChildren(document.createTextNode(`Dinner is ready. Enjoy your ${meal.name.toLowerCase()}!`));
    setActivity('Dinner is ready', 'Enjoy your meal');
    addMessage('assistant', `That’s the last step. Enjoy your ${meal.name.toLowerCase()}!`);
    actionButton.textContent = 'Dinner complete ✓';
    actionButton.disabled = true;
  });
  el('another-meal')?.addEventListener('click', () => runConversation('Give me another dinner idea.', { excludeCurrent: true }));
  el('meal-section').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

async function runConversation(text, options = {}) {
  const clean = text.trim();
  if (!clean) return;
  el('starter-prompts').hidden = true;
  addMessage('user', clean);
  const typing = showTyping();
  input.value = '';
  try {
    if (isSafetyConcern(clean)) {
      typing.remove();
      currentMeal = null;
      el('meal-section').hidden = true;
      setActivity('Safety comes first', 'No pantry or meal-planning tools were called');
      addSafetyMessage();
      return;
    }

    const lower = clean.toLowerCase();
    if (/^(hi|hello|hey|good evening|good morning|good afternoon)\b/i.test(clean)) {
      typing.remove();
      addMessage('assistant', friendlyReply(clean));
      return;
    }
    if (/(?:what(?:'s| is) in (?:my|our) pantry|show (?:me )?(?:my|our) pantry|check (?:my|our) pantry)/i.test(lower)) {
      setActivity('Checking your pantry', 'Calling get_pantry');
      await showPantrySummary();
      typing.remove();
      await refreshKitchen();
      return;
    }
    if (/(?:shopping|grocery) list|what did we need to buy|what do i need to buy/i.test(lower) && !/(?:add|remove|got|bought)\s+.+\s+(?:to|on|from|off)\b/i.test(lower)) {
      setActivity('Checking your list', 'Calling get_shopping_list');
      await showShoppingSummary();
      typing.remove();
      await refreshKitchen();
      return;
    }

    const addToPantry = parseIngredientCommand(clean, 'pantry-add');
    const removeFromPantry = parseIngredientCommand(clean, 'pantry-remove');
    const addToList = parseIngredientCommand(clean, 'list-add');
    const removeFromList = parseIngredientCommand(clean, 'list-remove');
    if (addToPantry || removeFromPantry) {
      const action = addToPantry ? 'add' : 'remove';
      const ingredient = addToPantry || removeFromPantry;
      setActivity(action === 'add' ? 'Updating your pantry' : 'Removing from your pantry', `Calling update_pantry · ${action} ${ingredient}`);
      const result = await callTool('update_pantry', { action, ingredient });
      typing.remove();
      await refreshKitchen();
      addMessage('assistant', result.message);
      return;
    }
    if (addToList || removeFromList) {
      setActivity(addToList ? 'Updating your shopping list' : 'Updating your shopping list', 'Calling shopping-list tools');
      const result = addToList
        ? await callTool('add_to_shopping_list', { items: [addToList] })
        : await callTool('remove_from_shopping_list', { item: removeFromList });
      typing.remove();
      await refreshKitchen();
      addMessage('assistant', result.message);
      return;
    }

    const avoidance = parseAvoidance(clean);
    if (avoidance) {
      setActivity('Saving your preferences', `Calling save_preferences · avoid ${avoidance.join(', ')}`);
      const saved = await callTool('save_preferences', { avoid: avoidance });
      typing.remove();
      await refreshKitchen();
      lastAssistantReply = saved.message;
      addMessage('assistant', `${saved.message} I’ll keep that in mind when we plan dinner.`);
      return;
    }

    if (/clear.*preference|forget.*(?:diet|food|avoid)|eat everything/i.test(lower)) {
      setActivity('Clearing dietary preferences', 'Calling save_preferences');
      const saved = await callTool('save_preferences', { avoid: [] });
      typing.remove();
      await refreshKitchen();
      addMessage('assistant', saved.message);
      return;
    }

    if (!options.forceMeal && !isMealRequest(clean)) {
      typing.remove();
      addMessage('assistant', friendlyReply(clean));
      setActivity('Ready to help', 'Ask about dinner, pantry, preferences, or shopping');
      return;
    }

    setActivity('Checking what you have', 'Calling get_pantry + get_preferences');
    const [pantry, preferences] = await Promise.all([callTool('get_pantry'), callTool('get_preferences')]);
    setActivity('Finding a dinner that fits', 'Calling plan_meal with your pantry and preferences');
    const requestingAnother = options.excludeCurrent || /\b(?:another|different|new) (?:dinner|meal|idea|recipe)\b/i.test(clean);
    if (!requestingAnother) suggestedRecipeIds.clear();
    const excludeRecipeIds = requestingAnother ? [...suggestedRecipeIds] : [];
    const result = await callTool('plan_meal', { servings: parseServings(clean), request: clean, excludeRecipeIds });
    typing.remove();
    await refreshKitchen();
    if (result.meal) {
      suggestedRecipeIds.add(result.meal.id);
      lastAssistantReply = `${result.meal.name} is a fit. You already have ${result.alreadyHave.length} of ${result.meal.ingredients.length} ingredients${result.missing.length ? `; you’d need ${result.missing.join(' and ')}` : ', so you can start cooking'}.`;
      addMessage('assistant', `${lastAssistantReply} I used ${pantry.count} pantry items${preferences.avoid?.length ? ` and remembered to avoid ${preferences.avoid.join(', ')}` : ''}.`);
      renderMeal(result);
      setActivity('Dinner plan is ready', 'Your pantry and preferences shaped this suggestion');
    } else {
      lastAssistantReply = requestingAnother
        ? 'That’s all the different recipes in this prototype for now. Add ingredients to your pantry and ask for a fresh dinner plan to start a new set of suggestions.'
        : result.message;
      addMessage('assistant', lastAssistantReply);
    }
  } catch (error) {
    typing.remove();
    addMessage('assistant', `I couldn’t reach the kitchen tools just now. ${error.message}`);
    el('connection-label').textContent = 'Connection interrupted';
    el('connection-dot').classList.add('offline');
  }
}

el('composer').addEventListener('submit', (event) => {
  event.preventDefault();
  runConversation(input.value);
});
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    el('composer').requestSubmit();
  }
});
el('starter-prompts').addEventListener('click', (event) => {
  const button = event.target.closest('[data-prompt]');
  if (button) runConversation(button.dataset.prompt);
});
el('pantry-refresh').addEventListener('click', refreshKitchen);
el('pantry-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const field = el('pantry-input');
  const ingredient = field.value.trim();
  if (!ingredient) return;
  try {
    const result = await callTool('update_pantry', { action: 'add', ingredient });
    field.value = '';
    await refreshKitchen();
    showToast(result.message);
  } catch (error) {
    showToast(error.message);
  }
});
el('preference-edit').addEventListener('click', () => {
  input.value = 'Remember that I avoid dairy.';
  input.focus();
});
const shoppingDialog = el('shopping-dialog');
el('shopping-open').addEventListener('click', async () => {
  await renderShoppingList(true);
});

async function renderShoppingList(openDialog = false) {
  const list = await callTool('get_shopping_list');
  el('shopping-items').replaceChildren(...(list.items.length ? list.items.map((item) => {
    const row = document.createElement('div');
    row.className = 'shopping-item';
    const label = document.createElement('span');
    label.textContent = item;
    const bought = document.createElement('button');
    bought.type = 'button';
    bought.className = 'shopping-bought';
    bought.textContent = 'Got it';
    bought.addEventListener('click', async () => {
      const result = await callTool('remove_from_shopping_list', { item });
      await refreshKitchen();
      showToast(result.message);
      await renderShoppingList(false);
    });
    row.append(label, bought);
    return row;
  }) : [Object.assign(document.createElement('div'), { className: 'empty-list', textContent: 'Your list is clear. Add ingredients from a dinner plan.' })]));
  if (openDialog && !shoppingDialog.open) shoppingDialog.showModal();
}
el('shopping-close').addEventListener('click', () => shoppingDialog.close());
shoppingDialog.addEventListener('click', (event) => { if (event.target === shoppingDialog) shoppingDialog.close(); });

connect().catch((error) => {
  el('connection-label').textContent = 'Kitchen server is offline';
  el('connection-dot').classList.add('offline');
  setActivity('Start your kitchen server', error.message);
});
