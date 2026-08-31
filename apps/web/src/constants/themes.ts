// Theme constants for the application

export const THEMES = {
  ADMIN_DARK: 'theme-admin-dark',
  COMPANY_LIGHT: 'theme-company-light',
} as const;

// Type for theme values
export type Theme = (typeof THEMES)[keyof typeof THEMES];

// User type IDs
export type UserTypeId = 1 | 2 | 4;

// Map user types to their corresponding themes
export const USER_TYPE_THEMES: Record<UserTypeId, Theme> = {
  1: THEMES.ADMIN_DARK,      // Super Admin
  2: THEMES.COMPANY_LIGHT,   // Company Admin
  4: THEMES.COMPANY_LIGHT,   // User
};
