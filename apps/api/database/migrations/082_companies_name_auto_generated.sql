-- Track whether a company's name was auto-generated vs. entered by the user.
--
-- Signup no longer requires a company name (companies.name is still NOT NULL,
-- so a blank signup gets a derived placeholder like "Jack's workspace"). This
-- flag records that the name is a placeholder so the app can later prompt the
-- owner to name their workspace, and so platform-admin lists can tell real
-- company names from auto-assigned ones.
--
-- Defaults false: every existing company had a user-entered name.

ALTER TABLE companies
    ADD COLUMN name_auto_generated BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN companies.name_auto_generated IS
    'true when companies.name is a signup-time placeholder (company field left blank), not a name the user entered.';
