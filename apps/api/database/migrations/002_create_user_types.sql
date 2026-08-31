-- User types lookup table
-- Two active roles: Admin and User. What kind of admin (platform / reseller /
-- end-user company admin) is determined by the company_type of the user's
-- company, NOT by a separate user_type_id row.

CREATE TABLE IF NOT EXISTS user_types (
    id   INTEGER     PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

INSERT INTO user_types (id, name) VALUES
    (1, 'Admin'),
    (2, 'User');
