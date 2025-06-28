'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

const { useState, useEffect } = React;
import { CheckResult, DetailedCheckResult, EvidenceEntry, SuggestedFix } from '@/types';
import { createSupabaseClient } from '@/lib/supabase';
import { useCredentials } from '@/context/CredentialsContext';
import { 
  checkMFA, 
  checkRLS, 
  checkPITR, 
  type JSONValue 
} from '@/lib/checks';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { HelpCircle } from 'lucide-react';
import EntityList from './EntityList';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import EvidenceLog from '@/components/EvidenceLog';


type Results = {
  mfa: CheckResult;
  rls: CheckResult;
  pitr: CheckResult;
};

// Using EvidenceEntry and SuggestedFix types from @/types

const INITIAL_RESULTS: Results = {
  mfa: { status: 'pending', message: 'MFA check pending...', details: null },
  rls: { status: 'pending', message: 'RLS check pending...', details: null },
  pitr: { status: 'pending', message: 'PITR check pending...', details: null }
};

export default function Dashboard() {
  const router = useRouter();
  const { credentials, clearCredentials, setCredentials } = useCredentials();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<Results>(INITIAL_RESULTS);
  const [evidence, setEvidence] = useState<EvidenceEntry[]>([]);
  // Help text for each check
  const helpTexts = {
    mfa: "Multi-Factor Authentication adds an extra layer of security to user accounts by requiring a second verification method beyond just a password.",
    rls: "Row Level Security restricts which rows in a database table a user can access, ensuring users only see data they're authorized to view.",
    pitr: "Point in Time Recovery allows you to restore your database to any point in time within the retention period, protecting against accidental data loss."
  };
  const [suggestedFixes, setSuggestedFixes] = useState<SuggestedFix[]>([]);
  
  // Section visibility states
  const [visibleSections, setVisibleSections] = useState({
    projectInfo: true,
    mfa: true,
    rls: true,
    pitr: true,
    evidenceLog: true,
    checks: true
  });
  
  // State for showing/hiding sensitive credentials
  const [showServiceRoleKey, setShowServiceRoleKey] = useState(false);
  
  // State for management API key input
  const [managementApiKey, setManagementApiKey] = useState('');
  const [managementApiKeyError, setManagementApiKeyError] = useState('');
  const [showManagementApiKey, setShowManagementApiKey] = useState(false);
  
  // State for OpenAI API key input
  const [openAIApiKey, setOpenAIApiKey] = useState('');
  const [openAIApiKeyError, setOpenAIApiKeyError] = useState('');
  const [showOpenAIApiKey, setShowOpenAIApiKey] = useState(false);
  const [openAIApiKeySaved, setOpenAIApiKeySaved] = useState(false);

  const validateManagementApiKey = (key: string): boolean => {
    if (!key) {
      setManagementApiKeyError('Management API Key is required');
      return false;
    }
    if (!key.startsWith('sbp_')) {
      setManagementApiKeyError('Management API Key must start with "sbp_"');
      return false;
    }
    setManagementApiKeyError('');
    return true;
  };

  const saveManagementApiKey = () => {
    if (!validateManagementApiKey(managementApiKey)) return;
    
    // Update credentials in context
    if (credentials) {
      const updatedCredentials = {
        ...credentials,
        managementApiKey
      };
      // Update credentials in context
      setCredentials(updatedCredentials); // Set updated credentials with management API key
    }
  };

  const handleRunChecks = async () => {
    if (!credentials) {
      setError('No valid credentials found. Please log in again.');
      return;
    }
    
    // Validate management API key before running checks
    if (!validateManagementApiKey(managementApiKey)) {
      setError('Please enter a valid Management API Key before running checks');
      return;
    }
    
    try {
      setLoading(true);
      setError('');
      setEvidence([]);
      setSuggestedFixes([]);
      
      // Create Supabase client with updated credentials including management API key
      const supabaseCredentials = {
        ...credentials,
        managementApiKey
      };
      const supabase = createSupabaseClient(supabaseCredentials);
      
      const createErrorResult = (e: Error): CheckResult => ({
        status: 'error',
        message: e.message,
        details: {
          message: e.message,
          stack: e.stack || '',
          name: e.name
        } as JSONValue
      });

      const [mfaResult, rlsResult, pitrResult] = await Promise.all([
        checkMFA(supabase).catch((e: Error) => createErrorResult(e)),
        checkRLS(supabase).catch((e: Error) => createErrorResult(e)),
        checkPITR(supabaseCredentials).catch((e: Error) => createErrorResult(e)),
      ]);

      const timestamp = new Date().toISOString();
      setEvidence(prev => [
        ...prev,
        { timestamp, check: 'MFA', status: mfaResult.status, details: mfaResult.message },
        { timestamp, check: 'RLS', status: rlsResult.status, details: rlsResult.message },
        { timestamp, check: 'PITR', status: pitrResult.status, details: pitrResult.message },
      ]);
      setResults({ mfa: mfaResult, rls: rlsResult, pitr: pitrResult });
    } catch (error) {
      console.error('Error running checks:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(`Failed to run checks: ${errorMessage}`);
      
      // Add the error to evidence log for visibility
      const timestamp = new Date().toISOString();
      setEvidence(prev => [
        ...prev,
        { timestamp, check: 'System', status: 'error', details: `Error: ${errorMessage}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Redirect to login if no credentials found
  useEffect(() => {
    if (!credentials) {
      router.push('/');
    } else if (credentials.managementApiKey) {
      // If we already have a management API key (from previous session), use it
      setManagementApiKey(credentials.managementApiKey);
    }
    
    // Load OpenAI API key from localStorage on component mount
    const savedKey = localStorage.getItem('openai_api_key');
    if (savedKey) {
      setOpenAIApiKey(savedKey);
    }
  }, [credentials, router]);

  const handleLogout = () => {
    // Clear credentials from context
    clearCredentials();
    // Redirect to login page
    router.push('/');
  };

  const clearEvidence = () => {
    if (window.confirm('Are you sure you want to clear all evidence logs?')) {
      setEvidence([]);
      setSuggestedFixes([]);
    }
  };
  
  const validateOpenAIApiKey = (key: string): boolean => {
    if (!key) {
      setOpenAIApiKeyError('OpenAI API Key is required');
      return false;
    }
    if (!key.startsWith('sk-')) {
      setOpenAIApiKeyError('OpenAI API Key must start with "sk-"');
      return false;
    }
    setOpenAIApiKeyError('');
    return true;
  };
  
  const saveOpenAIApiKey = () => {
    if (!validateOpenAIApiKey(openAIApiKey)) return;
    
    // Save to localStorage for persistence
    localStorage.setItem('openai_api_key', openAIApiKey);
    setOpenAIApiKeySaved(true);
    
    // Show success message briefly
    setTimeout(() => {
      setOpenAIApiKeySaved(false);
    }, 3000);
  };
  
  const handleAnalyzeIssues = async () => {
    try {
      // Check if OpenAI API key is provided
      if (!openAIApiKey) {
        setError('Please provide an OpenAI API key before analyzing issues');
        return;
      }
      
      // Create a new suggested fix for each failed check
      const newSuggestions: SuggestedFix[] = [];
      
      Object.entries(results).forEach(([checkType, result]) => {
        if (result.status === 'fail') {
          const id = `${checkType}-${Date.now()}`;
          newSuggestions.push({
            id,
            check: checkType === 'mfa' ? 'MFA' : checkType === 'rls' ? 'RLS' : 'PITR',
            issue: result.message,
            suggestion: '',
            loading: true
          });
        }
      });
      
      if (newSuggestions.length === 0) {
        setError('No failed checks to analyze');
        return;
      }
      
      setSuggestedFixes(newSuggestions);
      
      // Get detailed info from evidence logs
      const detailedInfo = evidence
        .filter(e => e.status === 'fail')
        .map(e => `${e.check}: ${e.details}`)
        .join('\n\n');
      
      // For each suggestion, call the API with detailed context
      for (const suggestion of newSuggestions) {
        try {
          const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-OpenAI-Key': openAIApiKey // Pass the API key in a header
            },
            body: JSON.stringify({
              message: {
                role: 'user',
                content: `I have a Supabase compliance issue with ${suggestion.check}: ${suggestion.issue}.
                
Here are the details of the issue: ${detailedInfo || 'No additional details available'}
                
Please provide specific, actionable steps to fix this issue, including any code or SQL examples that would help implement the solution.`
              }
            }),
          });
          
          if (!response.ok) {
            throw new Error(`API responded with status: ${response.status}`);
          }
          
          const data = await response.json();
          
          setSuggestedFixes(prev => 
            prev.map(fix => 
              fix.id === suggestion.id 
                ? { ...fix, suggestion: data.content, loading: false }
                : fix
            )
          );
          
          // Add to evidence log
          const timestamp = new Date().toISOString();
          setEvidence(prev => [
            ...prev,
            { 
              timestamp, 
              check: 'AI Analysis', 
              status: 'info', 
              details: `Generated fix suggestion for ${suggestion.check}` 
            },
          ]);
          
        } catch (error) {
          console.error(`Error analyzing ${suggestion.check}:`, error);
          setSuggestedFixes(prev => 
            prev.map(fix => 
              fix.id === suggestion.id 
                ? { ...fix, suggestion: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`, loading: false }
                : fix
            )
          );
          
          // Add error to evidence log
          const timestamp = new Date().toISOString();
          setEvidence(prev => [
            ...prev,
            { 
              timestamp, 
              check: 'AI Analysis', 
              status: 'error', 
              details: `Error generating fix for ${suggestion.check}: ${error instanceof Error ? error.message : 'Unknown error'}` 
            },
          ]);
        }
      }
    } catch (error) {
      console.error('Error analyzing issues:', error);
    }
  };



  // Toggle section visibility
  const toggleSectionVisibility = (section: keyof typeof visibleSections) => {
    setVisibleSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Render functions
  const renderCheckDetails = (result: CheckResult, checkType: string) => {
    if (result.status === 'error') {
      return (
        <Alert variant="destructive" className="mt-2 bg-white text-black border border-black">
          <AlertDescription>
            {result.message}
            <details className="mt-2">
              <summary className="cursor-pointer">Technical Details</summary>
              <pre className="mt-2 whitespace-pre-wrap text-sm">
                {JSON.stringify(result.details, null, 2)}
              </pre>
            </details>
          </AlertDescription>
        </Alert>
      );
    }

    // Render entity list based on check type
    const renderEntityList = () => {
      if (!result.details) return null;
      
      // Cast the details to DetailedCheckResult to access the properties
      const details = result.details as DetailedCheckResult;
      
      switch (checkType) {
        case 'mfa':
          const users = result.details as Array<{ email: string; mfaEnabled: boolean }>;
          return (
            <div className="mt-4 border border-gray-200 rounded-md p-2 bg-white">
              <h4 className="font-medium mb-2 text-black">User MFA Status ({users.length} users)</h4>
              <div className="overflow-auto max-h-60">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left p-2">Email</th>
                      <th className="text-left p-2">MFA Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user, index) => (
                      <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="p-2">{user.email || 'Unknown User'}</td>
                        <td className="p-2">
                          <span className={`px-2 py-1 rounded-full text-xs ${user.mfaEnabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {user.mfaEnabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={2} className="p-2 text-center text-gray-500">No users found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        case 'rls':
          return details.tables ? (
            <EntityList 
              entities={details.tables} 
              entityType="tables" 
              statusField="status" 
              nameField="tableName" 
            />
          ) : null;
        case 'pitr':
          return details.projects ? (
            <EntityList 
              entities={details.projects} 
              entityType="projects" 
              statusField="status" 
              nameField="projectName" 
            />
          ) : null;
        default:
          return null;
      }
    };

    return (
      <div className="mt-2">
        <p className="text-sm text-black">{result.message}</p>
        {renderEntityList()}
      </div>
    );
  };

  // No longer needed as we're using tooltips instead

  const renderCheckStatus = (key: string, result: CheckResult) => (
    <div key={key} className="border border-black rounded-lg p-4 bg-white">
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center">
          <h3 className="text-lg font-bold text-black">
            {key === 'mfa' && 'Multi-Factor Authentication (MFA)'}
            {key === 'rls' && 'Row Level Security (RLS)'}
            {key === 'pitr' && 'Point in Time Recovery (PITR)'}
          </h3>
          <div className="tooltip ml-2">
            <HelpCircle size={16} />
            <span className="tooltip-text">{helpTexts[key as keyof typeof helpTexts]}</span>
          </div>
        </div>
        <Button
          variant={visibleSections[key as keyof typeof visibleSections] ? "outline" : "default"}
          size="sm"
          onClick={() => toggleSectionVisibility(key as keyof typeof visibleSections)}
          className={`h-6 px-2 py-0 text-xs ${visibleSections[key as keyof typeof visibleSections] 
            ? 'border-black text-black' 
            : 'bg-black text-white hover:bg-gray-800'}`}
        >
          {visibleSections[key as keyof typeof visibleSections] ? 'Hide' : 'Show'}
        </Button>
      </div>
      
      {visibleSections[key as keyof typeof visibleSections] && (
        <div className="flex flex-row">
          {/* Status column on the left */}
          <div className="w-1/4 pr-4">
            <div
              className={`flex items-center justify-center px-3 py-2 rounded-md text-sm font-medium w-full ${
                result.status === 'pass'
                  ? 'status-pass text-green-800 border border-green-300 bg-green-50'
                  : result.status === 'fail'
                  ? 'status-fail text-red-800 border border-red-300 bg-red-50'
                  : result.status === 'error'
                  ? 'status-error text-orange-800 border border-orange-300 bg-orange-50'
                  : 'bg-white text-black border border-black'
              }`}
            >
              {result.status.toUpperCase()}
            </div>
          </div>
          
          {/* Details column on the right */}
          <div className="w-3/4">
            <p className="text-sm text-black mb-2">{result.message}</p>
            {renderCheckDetails(result, key)}
          </div>
        </div>
      )}
    </div>
  );

  if (!credentials) {
    return (
      <div className="p-6">
        <div className="max-w-md mx-auto">
          <Card className="bg-white border border-black">
            <CardContent className="p-6">
              <p className="text-black text-center">Loading credentials...</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Top bar with project info and logout */}
      <div className="flex justify-between items-center mb-6 border-b border-black pb-4">
        <h2 className="text-xl font-bold text-black">Supabase Compliance Tool</h2>
        <div className="flex items-center space-x-4">
          <div className="flex flex-col items-end">
            <div className="flex items-center space-x-2">
              <div className="flex flex-col">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-black mr-2"><strong>Project URL:</strong></span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleSectionVisibility('projectInfo')}
                    className="border-black text-black hover:bg-gray-100 text-xs h-6 px-2 py-0 ml-1"
                  >
                    {visibleSections.projectInfo ? 'Hide' : 'Show'}
                  </Button>
                </div>
                {visibleSections.projectInfo && (
                  <span className="text-sm text-black">{credentials.url}</span>
                )}
              </div>
              
              <div className="flex flex-col">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-black mr-2"><strong>Service Role Key:</strong></span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowServiceRoleKey(!showServiceRoleKey)}
                    className="border-black text-black hover:bg-gray-100 text-xs h-6 px-2 py-0 ml-1"
                  >
                    {showServiceRoleKey ? 'Hide' : 'Show'}
                  </Button>
                </div>
                {showServiceRoleKey && (
                  <span className="text-sm text-black font-mono">{credentials.serviceRoleKey}</span>
                )}
                {!showServiceRoleKey && credentials.serviceRoleKey && (
                  <span className="text-sm text-black font-mono">••••••••••••••••</span>
                )}
              </div>
            </div>
          </div>
          <Button 
            onClick={handleLogout}
            variant="outline"
            className="border-black text-black hover:bg-gray-100"
          >
            Logout
          </Button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <Alert variant="destructive" className="mb-4 bg-red-50 border border-red-500 text-red-800">
          <AlertDescription className="whitespace-pre-wrap">{error}</AlertDescription>
        </Alert>
      )}
      
      {/* API Keys Input Section */}
      <Card className="bg-white border border-black mb-6">
        <CardHeader className="p-4 border-b border-black">
          <h3 className="text-lg font-bold text-black">API Keys</h3>
        </CardHeader>
        <CardContent className="p-4">
          {/* Management API Key Input */}
          <div className="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0 md:space-x-4 mb-6">
            <div className="w-full md:w-2/3">
              <div className="flex flex-col space-y-1">
                <label className="text-sm font-medium text-black">Management API Key</label>
                <div className="flex items-center space-x-2">
                  <Input
                    className="w-full border-black text-black"
                    type={showManagementApiKey ? 'text' : 'password'}
                    value={managementApiKey}
                    onChange={(e) => {
                      setManagementApiKey(e.target.value);
                      if (managementApiKeyError) validateManagementApiKey(e.target.value);
                    }}
                    placeholder="sbp_..."
                  />
                  <Button
                    type="button"
                    variant={showManagementApiKey ? "outline" : "default"}
                    size="sm"
                    className={`h-8 px-2 py-0 ${showManagementApiKey 
                      ? 'border-black text-black' 
                      : 'bg-black text-white hover:bg-gray-800'}`}
                    onClick={() => setShowManagementApiKey(!showManagementApiKey)}
                  >
                    {showManagementApiKey ? 'Hide' : 'Show'}
                  </Button>
                </div>
                {managementApiKeyError && (
                  <p className="text-xs text-red-600 mt-1">{managementApiKeyError}</p>
                )}
              </div>
            </div>
            <Button
              className="bg-black text-white hover:bg-gray-800 h-8 px-4 py-0"
              onClick={saveManagementApiKey}
              disabled={!managementApiKey || !!managementApiKeyError}
            >
              Save Key
            </Button>
          </div>
          
          {/* OpenAI API Key Input */}
          <div className="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0 md:space-x-4">
            <div className="w-full md:w-2/3">
              <div className="flex flex-col space-y-1">
                <label className="text-sm font-medium text-black">OpenAI API Key <span className="text-xs text-gray-500">(required for AI analysis)</span></label>
                <div className="flex items-center space-x-2">
                  <Input
                    className="w-full border-black text-black"
                    type={showOpenAIApiKey ? 'text' : 'password'}
                    value={openAIApiKey}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      setOpenAIApiKey(newValue);
                      // Only validate if there was a previous error
                      if (openAIApiKeyError) validateOpenAIApiKey(newValue);
                    }}
                    placeholder="sk-..."
                  />
                  <Button
                    type="button"
                    variant={showOpenAIApiKey ? "outline" : "default"}
                    size="sm"
                    className={`h-8 px-2 py-0 ${showOpenAIApiKey 
                      ? 'border-black text-black' 
                      : 'bg-black text-white hover:bg-gray-800'}`}
                    onClick={() => setShowOpenAIApiKey(!showOpenAIApiKey)}
                  >
                    {showOpenAIApiKey ? 'Hide' : 'Show'}
                  </Button>
                </div>
                {openAIApiKeyError && (
                  <p className="text-xs text-red-600 mt-1">{openAIApiKeyError}</p>
                )}
              </div>
            </div>
            <div className="flex items-center">
              <Button
                className="bg-black text-white hover:bg-gray-800 h-8 px-4 py-0"
                onClick={saveOpenAIApiKey}
                disabled={!openAIApiKey || !!openAIApiKeyError}
              >
                Save Key
              </Button>
              {openAIApiKeySaved && (
                <span className="ml-2 text-xs text-green-600">Key saved successfully!</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Left column - Compliance Checks */}
        <div className="w-full md:w-1/2">
          <Card className="bg-white border border-black h-full">
            <CardHeader className="flex flex-row items-center justify-between p-4">
              <h3 className="text-lg font-bold text-black">Checks</h3>
              <div className="flex space-x-2">
                <Button
                  className="bg-black text-white hover:bg-gray-800 h-8 px-3 py-0 text-xs"
                  onClick={handleRunChecks}
                  disabled={loading}
                >
                  {loading ? 'Running...' : 'Run Checks'}
                </Button>
                <Button
                  variant={visibleSections.checks ? "outline" : "default"}
                  size="sm"
                  onClick={() => toggleSectionVisibility('checks')}
                  className={`h-6 px-2 py-0 text-xs ${visibleSections.checks 
                    ? 'border-black text-black' 
                    : 'bg-black text-white hover:bg-gray-800'}`}
                >
                  {visibleSections.checks ? 'Hide' : 'Unhide'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {visibleSections.checks && (
                <div className="space-y-4">
                  {Object.entries(results).map(([key, result]) => renderCheckStatus(key, result))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column - Evidence Log */}
        <div className="w-full md:w-1/2">
          <Card className="bg-white border border-black h-full">
            <CardHeader className="flex flex-row items-center justify-between p-4">
              <h3 className="text-lg font-bold text-black">Evidence Log</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleSectionVisibility('evidenceLog')}
                className="border-black text-black hover:bg-gray-100"
              >
                {visibleSections.evidenceLog ? 'Hide' : 'Unhide'}
              </Button>
            </CardHeader>
            <CardContent className="p-4">
              {visibleSections.evidenceLog && (
                evidence.length > 0 ? (
                  <div>
                    <div className="flex justify-end mb-2">
                      <Button
                        onClick={handleAnalyzeIssues}
                        className="bg-black text-white hover:bg-gray-800 h-8 px-3 py-0 text-xs"
                      >
                        Analyze Issues
                      </Button>
                    </div>
                    <EvidenceLog 
                      evidence={evidence} 
                      onClearEvidence={clearEvidence} 
                    />
                  </div>
                ) : (
                  <p className="text-black text-center py-4">No evidence logs yet. Run compliance checks to generate logs.</p>
                )
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Suggested Fixes Table */}
      {suggestedFixes.length > 0 && (
        <div className="mt-6">
          <Card className="bg-white border border-black">
            <CardHeader className="flex flex-row items-center justify-between p-4">
              <h3 className="text-lg font-bold text-black">Suggested Fixes</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSuggestedFixes([])}
                className="h-6 px-2 py-0 text-xs border-black text-black hover:bg-gray-100"
              >
                Clear Suggestions
              </Button>
            </CardHeader>
            <CardContent className="p-4">
              <div className="border border-black rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-black font-bold w-1/6">Check</TableHead>
                      <TableHead className="text-black font-bold w-1/4">Issue</TableHead>
                      <TableHead className="text-black font-bold w-1/2">Suggested Fix</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suggestedFixes.map((fix) => (
                      <TableRow key={fix.id}>
                        <TableCell className="text-black font-medium">
                          {fix.check}
                        </TableCell>
                        <TableCell className="text-black">
                          {fix.issue}
                        </TableCell>
                        <TableCell className="text-black whitespace-pre-wrap">
                          {fix.loading ? (
                            <div className="flex items-center justify-center">
                              <div className="animate-spin h-5 w-5 border-2 border-black border-t-transparent rounded-full"></div>
                              <span className="ml-2">Analyzing...</span>
                            </div>
                          ) : (
                            fix.suggestion
                          )}
                        </TableCell>
                      </TableRow>
                    ))}

                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <Alert variant="destructive" className="mt-4 bg-white text-black border border-black">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
