/**
 * List of tables that may contain PII (Personally Identifiable Information)
 * These tables should have RLS enabled for security
 */
export const TABLES_WITH_PII = [
  'users',
  'profiles',
  'customers',
  'orders',
  'payments',
  'accounts',
  'contacts',
  'subscriptions',
  'user_data',
  'auth_users'
];
