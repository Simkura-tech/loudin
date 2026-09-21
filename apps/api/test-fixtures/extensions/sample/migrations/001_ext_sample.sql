-- Fixture migration for test/extensions.test.js. The test drops this table
-- and its migrations row when it finishes.
CREATE TABLE IF NOT EXISTS ext_sample_fixture (
  id SERIAL PRIMARY KEY
);
