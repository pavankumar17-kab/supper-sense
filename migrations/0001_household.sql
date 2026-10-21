CREATE TABLE IF NOT EXISTS pantry_items (
  name TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS household_preferences (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  avoid_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS shopping_items (
  name TEXT PRIMARY KEY
);

INSERT OR IGNORE INTO pantry_items (name) VALUES
  ('red lentils'),
  ('spinach'),
  ('onion'),
  ('canned tomatoes'),
  ('cumin'),
  ('rice');

INSERT OR IGNORE INTO household_preferences (id, avoid_json) VALUES (1, '[]');
