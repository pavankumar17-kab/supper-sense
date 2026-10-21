import { isSafetyConcern } from './public/safety.js';

export const initialState = {
  pantry: ['red lentils', 'spinach', 'onion', 'canned tomatoes', 'cumin', 'rice'],
  preferences: { avoid: [] },
  shoppingList: [],
  updatedAt: null,
};

export const toolDefinitions = [
  { name: 'get_pantry', description: 'Read the household pantry so a meal can use ingredients already available.', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_preferences', description: 'Read saved dietary preferences before suggesting a meal.', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'update_pantry', description: 'Add an ingredient to or remove an ingredient from the household pantry.',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['add', 'remove'] }, ingredient: { type: 'string', minLength: 1, maxLength: 50 } }, required: ['action', 'ingredient'] },
  },
  {
    name: 'save_preferences', description: 'Remember dietary ingredients the household wants to avoid.',
    inputSchema: { type: 'object', properties: { avoid: { type: 'array', items: { type: 'string' }, description: 'Ingredients or categories to avoid, such as dairy, eggs, or nuts.' } }, required: ['avoid'] },
  },
  {
    name: 'plan_meal', description: 'Choose a practical dinner based on pantry ingredients, servings, and saved preferences. Can exclude previously suggested recipes when asked for another idea.',
    inputSchema: { type: 'object', properties: { servings: { type: 'integer', minimum: 1, maximum: 12 }, request: { type: 'string', description: 'Optional dinner request or ingredient to use first.' }, excludeRecipeIds: { type: 'array', items: { type: 'string' }, description: 'Previously suggested recipe IDs to skip when the user asks for another idea.' } }, required: ['servings'] },
  },
  {
    name: 'add_to_shopping_list', description: 'Add the missing ingredients for a selected meal to the household shopping list.',
    inputSchema: { type: 'object', properties: { items: { type: 'array', items: { type: 'string' }, description: 'Missing ingredients to add.' } }, required: ['items'] },
  },
  { name: 'get_shopping_list', description: 'Read the saved household shopping list.', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'remove_from_shopping_list', description: 'Remove an ingredient from the saved shopping list after it has been purchased or is no longer needed.',
    inputSchema: { type: 'object', properties: { item: { type: 'string', minLength: 1, maxLength: 50 } }, required: ['item'] },
  },
];

const recipes = [
  {
    id: 'spinach-lentil-skillet', name: 'Spinach & lentil skillet', minutes: 25,
    tags: ['vegetarian', 'vegan', 'dairy-free', 'gluten-free'],
    ingredients: ['red lentils', 'spinach', 'onion', 'canned tomatoes', 'cumin'],
    steps: ['Soften the onion with cumin.', 'Stir in lentils, tomatoes and water; simmer until tender.', 'Fold in spinach and serve with rice.'],
    note: 'A warm, one-pan dinner built around what is already in the pantry.',
  },
  {
    id: 'tomato-rice-bowl', name: 'Tomato & cumin rice bowl', minutes: 20,
    tags: ['vegetarian', 'vegan', 'dairy-free', 'gluten-free'],
    ingredients: ['rice', 'canned tomatoes', 'onion', 'cumin'],
    steps: ['Cook rice until fluffy.', 'Simmer onion, tomatoes and cumin into a quick sauce.', 'Spoon the tomato sauce over the rice.'],
    note: 'An easy pantry bowl with a fresh finish.',
  },
  {
    id: 'spinach-omelette', name: 'Spinach & onion omelette', minutes: 15,
    tags: ['vegetarian', 'gluten-free'], ingredients: ['eggs', 'spinach', 'onion', 'cheddar'],
    steps: ['Soften sliced onion and wilt the spinach.', 'Pour in beaten eggs and cook gently.', 'Finish with cheddar and fold to serve.'],
    note: 'A quick option when eggs are on hand.',
  },
  {
    id: 'lentil-tomato-soup', name: 'Tomato lentil soup', minutes: 30,
    tags: ['vegetarian', 'vegan', 'dairy-free', 'gluten-free'],
    ingredients: ['red lentils', 'canned tomatoes', 'onion', 'cumin'],
    steps: ['Soften the onion with cumin.', 'Add lentils, tomatoes and water.', 'Simmer until the lentils are soft, then season to taste.'],
    note: 'A simple, filling soup made from pantry staples.',
  },
  {
    id: 'chickpea-spinach-curry', name: 'Chickpea & spinach curry', minutes: 25,
    tags: ['vegetarian', 'vegan', 'dairy-free', 'gluten-free'],
    ingredients: ['chickpeas', 'spinach', 'onion', 'canned tomatoes', 'cumin'],
    steps: ['Soften the onion with cumin.', 'Add chickpeas and tomatoes with a splash of water; simmer for 15 minutes.', 'Stir in spinach until wilted and serve with rice.'],
    note: 'A hearty curry that works with canned chickpeas and pantry spices.',
  },
  {
    id: 'tomato-spinach-pasta', name: 'Tomato & spinach pasta', minutes: 25,
    tags: ['vegetarian', 'vegan', 'dairy-free'],
    ingredients: ['pasta', 'canned tomatoes', 'spinach', 'onion', 'garlic'],
    steps: ['Boil pasta until tender.', 'Cook onion and garlic, then add tomatoes and simmer into a sauce.', 'Fold spinach into the sauce and toss with drained pasta.'],
    note: 'A simple tomato pasta with greens stirred through.',
  },
  {
    id: 'potato-spinach-hash', name: 'Potato & spinach skillet', minutes: 30,
    tags: ['vegetarian', 'vegan', 'dairy-free', 'gluten-free'],
    ingredients: ['potatoes', 'spinach', 'onion', 'cumin'],
    steps: ['Dice and boil the potatoes until just tender, then drain.', 'Brown the onion with cumin in a skillet.', 'Add potatoes and spinach; cook until hot and wilted.'],
    note: 'A filling one-pan supper using potatoes and greens.',
  },
  {
    id: 'egg-fried-rice', name: 'Egg & vegetable fried rice', minutes: 20,
    tags: ['vegetarian', 'dairy-free'],
    ingredients: ['rice', 'eggs', 'onion', 'carrots', 'soy sauce'],
    steps: ['Use cooked, cooled rice if available.', 'Scramble the eggs, then set them aside while cooking onion and carrots.', 'Stir in rice and soy sauce, then fold the eggs back in.'],
    note: 'A quick skillet meal that can use leftover rice and vegetables.',
  },
  {
    id: 'chickpea-rice-bowl', name: 'Spiced chickpea rice bowl', minutes: 25,
    tags: ['vegetarian', 'vegan', 'dairy-free', 'gluten-free'],
    ingredients: ['chickpeas', 'rice', 'onion', 'cumin', 'lemon'],
    steps: ['Cook the rice until tender.', 'Warm chickpeas with onion and cumin in a pan.', 'Serve over rice with lemon juice.'],
    note: 'A flexible bowl with warm chickpeas, rice and a bright finish.',
  },
  {
    id: 'chicken-tomato-rice', name: 'Chicken & tomato rice', minutes: 35,
    tags: ['dairy-free', 'gluten-free'],
    ingredients: ['chicken', 'rice', 'canned tomatoes', 'onion', 'garlic'],
    steps: ['Cook chicken pieces thoroughly in a pan; set aside.', 'Soften onion and garlic, then stir in tomatoes and rice with water.', 'Simmer until the rice is tender and chicken is fully cooked through.'],
    note: 'A one-pot rice dinner; cook poultry thoroughly before serving.',
  },
];

const ingredientAliases = new Map([
  ['tomatoes', 'canned tomatoes'], ['tomato', 'canned tomatoes'], ['lentils', 'red lentils'],
  ['spinach', 'spinach'], ['rice', 'rice'], ['onion', 'onion'], ['cumin', 'cumin'],
  ['eggs', 'eggs'], ['egg', 'eggs'], ['chickpeas', 'chickpeas'], ['chickpea', 'chickpeas'],
  ['pasta', 'pasta'], ['potatoes', 'potatoes'], ['potato', 'potatoes'], ['carrots', 'carrots'],
  ['carrot', 'carrots'], ['garlic', 'garlic'], ['chicken', 'chicken'], ['lemon', 'lemon'], ['soy sauce', 'soy sauce'],
]);

function matchRecipe(state, request, excludeRecipeIds = []) {
  const avoid = new Set((state.preferences.avoid || []).map((item) => item.toLowerCase()));
  const requestText = String(request || '').toLowerCase();
  const requestedItems = [...ingredientAliases.entries()].filter(([alias]) => requestText.includes(alias)).map(([, item]) => item);
  const excludedIds = new Set(Array.isArray(excludeRecipeIds) ? excludeRecipeIds : []);
  const candidates = recipes.filter((recipe) => !excludedIds.has(recipe.id)).map((recipe) => {
    const alreadyHave = recipe.ingredients.filter((item) => state.pantry.includes(item));
    const missing = recipe.ingredients.filter((item) => !state.pantry.includes(item));
    const excluded = recipe.ingredients.some((item) => avoid.has(item.toLowerCase()))
      || (avoid.has('dairy') && recipe.ingredients.some((item) => ['plain yogurt', 'cheddar'].includes(item)))
      || (avoid.has('eggs') && recipe.ingredients.includes('eggs'));
    const requestScore = requestedItems.filter((item) => recipe.ingredients.includes(item)).length * 8;
    const quickScore = /\b(quick|fast|easy|less than 20|20 minutes)\b/.test(requestText) && recipe.minutes <= 20 ? 3 : 0;
    return { ...recipe, alreadyHave, missing, excluded, score: alreadyHave.length * 2 - missing.length + requestScore + quickScore };
  }).filter((recipe) => !recipe.excluded);
  candidates.sort((a, b) => b.score - a.score || a.minutes - b.minutes);
  return candidates[0] || null;
}

export function runTool(name, args = {}, sourceState) {
  const state = structuredClone(sourceState);
  let changed = false;
  let result;
  switch (name) {
    case 'get_pantry': result = { items: state.pantry, count: state.pantry.length }; break;
    case 'get_preferences': result = state.preferences; break;
    case 'update_pantry': {
      const ingredient = String(args.ingredient || '').trim().toLowerCase();
      if (!ingredient || ingredient.length > 50) throw new Error('Enter an ingredient with 1 to 50 characters.');
      if (args.action === 'add') {
        changed = !state.pantry.includes(ingredient);
        if (changed) state.pantry = [...state.pantry, ingredient];
        result = { items: state.pantry, added: changed, message: changed ? `Added ${ingredient} to your pantry.` : `${ingredient} is already in your pantry.` };
      } else if (args.action === 'remove') {
        const items = state.pantry.filter((item) => item !== ingredient);
        changed = items.length !== state.pantry.length;
        state.pantry = items;
        result = { items: state.pantry, removed: changed, message: changed ? `Removed ${ingredient} from your pantry.` : `${ingredient} was not in your pantry.` };
      } else throw new Error('Choose whether to add or remove the ingredient.');
      break;
    }
    case 'save_preferences': {
      const avoid = [...new Set((Array.isArray(args.avoid) ? args.avoid : []).map((item) => String(item).trim().toLowerCase()).filter(Boolean))];
      changed = JSON.stringify(avoid) !== JSON.stringify(state.preferences.avoid || []);
      state.preferences = { ...state.preferences, avoid };
      result = { preferences: state.preferences, message: avoid.length ? `I’ll avoid ${avoid.join(', ')} in future suggestions.` : 'Dietary preferences cleared.' };
      break;
    }
    case 'plan_meal': {
      if (isSafetyConcern(args.request || '')) {
        result = { safetyConcern: true, message: 'Your safety comes first. If you may be in danger, move away from anything dangerous, get near someone you trust, and contact local emergency services. Find crisis support in your country at https://findahelpline.com/. Are you in immediate danger right now?' };
        break;
      }
      const servings = Number(args.servings);
      if (!Number.isInteger(servings) || servings < 1 || servings > 12) throw new Error('Servings must be a whole number from 1 to 12.');
      const recipe = matchRecipe(state, args.request, args.excludeRecipeIds);
      result = recipe ? {
        meal: { id: recipe.id, name: recipe.name, minutes: recipe.minutes, servings, tags: recipe.tags, ingredients: recipe.ingredients, steps: recipe.steps, note: recipe.note },
        alreadyHave: recipe.alreadyHave, missing: recipe.missing, usedPreferences: state.preferences.avoid,
      } : { message: 'I could not find a suitable meal with the saved preferences. Try adding more pantry items or changing preferences.' };
      break;
    }
    case 'add_to_shopping_list': {
      const items = [...new Set((Array.isArray(args.items) ? args.items : []).map((item) => String(item).trim().toLowerCase()).filter((item) => item && item.length <= 50))];
      const added = items.filter((item) => !state.shoppingList.includes(item));
      state.shoppingList = [...state.shoppingList, ...added];
      changed = added.length > 0;
      result = { shoppingList: state.shoppingList, added, message: added.length ? `Added ${added.join(', ')}.` : 'Those ingredients are already on the list.' };
      break;
    }
    case 'get_shopping_list': result = { items: state.shoppingList, count: state.shoppingList.length }; break;
    case 'remove_from_shopping_list': {
      const item = String(args.item || '').trim().toLowerCase();
      const items = state.shoppingList.filter((entry) => entry !== item);
      changed = items.length !== state.shoppingList.length;
      state.shoppingList = items;
      result = { items: state.shoppingList, removed: changed, message: changed ? `Removed ${item} from your shopping list.` : `${item} was not on your shopping list.` };
      break;
    }
    default: throw new Error(`Unknown tool: ${name}`);
  }
  return { state, changed, result };
}

