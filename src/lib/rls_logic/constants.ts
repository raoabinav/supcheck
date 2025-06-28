export const TABLES_WITH_PII = [
  'users',                 // Basic user information (email, name)
  'profiles',              // Profile details (address, phone number, date of birth)
  'customers',             // Customer master (contact info, billing information)
  'orders',                // Order information (customer name, address)
  'order_items',           // Order details (product information linked to customer orders)
  'payments',              // Payment information (credit card last digits, transaction ID)
  'payment_methods',       // User payment methods (partial card information)
  'credit_cards',          // Credit card details (tokenized information)
  'addresses',             // Address information (shipping/billing)
  'shipping_addresses',    // Shipping-only addresses
  'billing_addresses',     // Billing-only addresses
  'invoices',              // Invoices (billing info, amount, issue date)
  'invoice_items',         // Invoice line items
  'subscriptions',         // Subscription history (user ID, plan, payment info)
  'transactions',          // Financial transaction log (transaction ID, amount)
  'sessions',              // Session management (login history, IP address)
  'login_attempts',        // Login attempt history (date/time, result, IP address)
  'oauth_tokens',          // OAuth tokens (access token, refresh token)
  'api_keys',              // API key management
  'security_questions',    // Security questions and answers
  'employees',             // Employee information (employee ID, address, emergency contact)
  'employee_records',      // HR records (salary, evaluations)
  'payroll',               // Payroll data (bank account, tax information)
  'tax_records',           // Tax data (taxpayer number, filing information)
  'medical_records',       // Medical records (diagnoses, prescriptions)
  'insurance_claims',      // Insurance claim information (policy number, symptoms)
  'contacts',              // Contact history (name, email, phone)
  'support_tickets',       // Support tickets (user information and inquiry content)
  'messages',              // Message history (sender, recipient, content)
  'chat_threads',          // Chat threads (participating users)
  'feedback',              // User feedback (name, contact info)
  'reviews',               // Reviews (reviewer information)
  'comments',              // Comments (poster account)
  'leads',                 // Lead information (name, company, contact info)
  'newsletter_subscribers',// Newsletter subscribers
  'event_registrations',   // Event registration information (participant info, contact)
  'attendees',             // Event attendee list
  'vendors',               // Vendors (company name, address, contact info)
  'partners',              // Partner information (contact person details)
  ];
