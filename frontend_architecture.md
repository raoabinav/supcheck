# Supabase Compliance Tool: Frontend Architecture

## 1. Frontend Overview

The frontend of the Supabase Compliance Tool is built using React and TypeScript, providing a modern, responsive interface for users to monitor and manage security compliance in their Supabase projects. The architecture follows best practices for maintainability, performance, and user experience.

## 2. Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         App Container                           │
└───────────────────────────────┬─────────────────────────────────┘
                                │
            ┌──────────────────┴─────────────────┐
            ▼                                    ▼
┌───────────────────────┐            ┌───────────────────────────┐
│    Authentication     │            │        Dashboard          │
│                       │            │                           │
│  ┌─────────────────┐  │            │  ┌─────────────────────┐  │
│  │  Login Form     │  │            │  │  Compliance Summary │  │
│  └─────────────────┘  │            │  └─────────────────────┘  │
│                       │            │                           │
│  ┌─────────────────┐  │            │  ┌─────────────────────┐  │
│  │  Signup Form    │  │            │  │  Check Details      │  │
│  └─────────────────┘  │            │  └─────────────────────┘  │
└───────────────────────┘            └───────────────────────────┘
                                                │
                                    ┌──────────┴───────────┐
                                    ▼                      ▼
                        ┌───────────────────┐  ┌───────────────────┐
                        │  RLS Check        │  │  MFA Check        │
                        │  Component        │  │  Component        │
                        └───────────────────┘  └───────────────────┘
                                    │
                                    ▼
                        ┌───────────────────┐
                        │  PITR Check       │
                        │  Component        │
                        └───────────────────┘
```

## 3. Directory Structure

```
frontend/
├── public/
│   ├── index.html
│   └── assets/
├── src/
│   ├── components/
│   │   ├── Dashboard.tsx
│   │   ├── Auth/
│   │   │   ├── Login.tsx
│   │   │   └── Signup.tsx
│   │   ├── Checks/
│   │   │   ├── RLSCheck.tsx
│   │   │   ├── MFACheck.tsx
│   │   │   └── PITRCheck.tsx
│   │   └── UI/
│   │       ├── Button.tsx
│   │       ├── Card.tsx
│   │       └── ...
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── checks.ts
│   │   └── utils.ts
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   └── useSupabase.ts
│   ├── context/
│   │   ├── AuthContext.tsx
│   │   └── ComplianceContext.tsx
│   ├── types.ts
│   ├── App.tsx
│   └── index.tsx
├── package.json
└── tsconfig.json
```

## 4. Key Components

### 4.1 Authentication Components

- **Login/Signup Forms**: Handle user authentication through Supabase Auth
- **AuthContext**: Manages authentication state throughout the application
- **Protected Routes**: Ensure only authenticated users can access compliance features

### 4.2 Dashboard Components

- **ComplianceSummary**: Overview of all compliance checks with status indicators
- **CheckDetails**: Expandable sections for each compliance check with detailed results
- **ActionItems**: Prioritized list of security issues that need attention

### 4.3 Check Components

#### 4.3.1 RLS Check Component

- **Implementation**: Uses the heuristic approach from `checks.ts` to detect RLS status
- **Visualization**: Table view showing which tables have RLS enabled/disabled
- **Guidance**: Contextual help for enabling RLS on non-compliant tables

#### 4.3.2 MFA Check Component

- **Implementation**: Queries user accounts to check MFA status
- **Visualization**: List of users with MFA status indicators
- **Guidance**: Step-by-step instructions for enabling MFA

#### 4.3.3 PITR Check Component

- **Implementation**: Checks subscription tier and PITR configuration
- **Visualization**: Status indicator with configuration details
- **Guidance**: Instructions for enabling PITR based on subscription tier

## 5. State Management

### 5.1 React Context

- **AuthContext**: Manages user authentication state
- **ComplianceContext**: Stores results of compliance checks
- **SettingsContext**: Manages user preferences and API credentials

### 5.2 Local Storage

- **Credentials**: Securely stores Supabase credentials (encrypted)
- **User Preferences**: Saves UI preferences and settings
- **Check History**: Optionally stores historical compliance data

## 6. API Integration

### 6.1 Supabase Client

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import { SupabaseCredentials } from '../types';

export const createSupabaseClient = (credentials: SupabaseCredentials) => {
  return createClient(credentials.url, credentials.key);
};

export const callManagementApi = async (
  endpoint: string,
  credentials: SupabaseCredentials
) => {
  // Implementation for calling Supabase Management API
};
```

### 6.2 Check Implementation

```typescript
// src/lib/checks.ts (simplified example)
export async function checkRLS(supabase: SupabaseClient): Promise<CheckResult> {
  try {
    // Get list of tables
    const { data: publicTables } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_type', 'BASE TABLE');
    
    // Check each table for RLS
    const tablesWithoutRLS = [];
    
    for (const table of publicTables || []) {
      const { error } = await supabase
        .from(table.table_name)
        .select('*')
        .limit(1);
      
      if (!error || !error.message.includes('permission denied')) {
        tablesWithoutRLS.push(table.table_name);
      }
    }
    
    // Return results
    return {
      status: tablesWithoutRLS.length === 0 ? 'pass' : 'fail',
      message: tablesWithoutRLS.length === 0 
        ? 'RLS enabled for all tables' 
        : `Tables missing RLS: ${tablesWithoutRLS.join(', ')}`,
      details: { tables_without_rls: tablesWithoutRLS }
    };
  } catch (error) {
    // Error handling
  }
}
```

## 7. UI/UX Design

### 7.1 Design System

- **Color Scheme**: Based on Supabase branding with clear status indicators
- **Typography**: Modern, readable font stack optimized for dashboard viewing
- **Components**: Reusable UI components with consistent styling

### 7.2 Responsive Design

- **Mobile-First**: Designed to work on all device sizes
- **Adaptive Layouts**: Components reorganize based on available screen space
- **Touch-Friendly**: Controls sized appropriately for touch interaction

### 7.3 Accessibility

- **ARIA Attributes**: Proper labeling for screen readers
- **Keyboard Navigation**: Full functionality without mouse interaction
- **Color Contrast**: Meets WCAG 2.1 AA standards

## 8. Performance Optimization

### 8.1 Code Splitting

- **Lazy Loading**: Components loaded only when needed
- **Route-Based Splitting**: Code split by route for faster initial load

### 8.2 Memoization

- **React.memo**: Prevents unnecessary re-renders
- **useMemo/useCallback**: Optimizes expensive calculations and callbacks

### 8.3 API Request Optimization

- **Debouncing**: Prevents rapid successive API calls
- **Caching**: Stores results to minimize duplicate requests
- **Error Retry**: Intelligent retry logic for failed requests

## 9. Testing Strategy

### 9.1 Unit Tests

- **Component Tests**: Verify individual component behavior
- **Hook Tests**: Ensure custom hooks work as expected
- **Utility Tests**: Validate helper functions

### 9.2 Integration Tests

- **Feature Tests**: Verify end-to-end functionality of features
- **API Integration**: Mock and test API interactions

### 9.3 User Testing

- **Usability Testing**: Ensure interface is intuitive
- **Performance Testing**: Verify acceptable load times and responsiveness

## 10. Future Enhancements

### 10.1 Visualization Improvements

- **Interactive Charts**: Visual representation of compliance status
- **Trend Analysis**: Track compliance improvements over time

### 10.2 Advanced Features

- **Custom Checks**: User-defined compliance rules
- **Scheduled Scans**: Automated periodic compliance checks
- **Notifications**: Alerts for compliance status changes

### 10.3 Integration Options

- **CI/CD Integration**: Compliance checks as part of deployment pipeline
- **Team Collaboration**: Shared dashboards and assigned action items
