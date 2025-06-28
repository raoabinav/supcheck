import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message } = body;

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    // Get API key from request header or environment
    const headerApiKey = request.headers.get('X-OpenAI-Key');
    const envApiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;
    const apiKey = headerApiKey || envApiKey;
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key is not provided in header or configured in environment' },
        { status: 500 }
      );
    }

    // Create OpenAI client
    const openai = new OpenAI({ 
      apiKey,
      dangerouslyAllowBrowser: true
    });

    // Call OpenAI API with an enhanced prompt
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{
        role: 'system',
        content: `You are a specialized Supabase security expert with deep knowledge of database security, compliance standards, and Supabase best practices.

When given information about compliance issues, provide specific, actionable steps to fix them. Focus on:

1. For MFA issues: Explain how to enable and enforce MFA for Supabase users, including code examples for the Supabase Auth UI or API.

2. For RLS issues: Provide specific RLS policy examples that would secure the tables, with SQL statements ready to implement.

3. For PITR issues: Explain how to enable Point-in-Time Recovery in Supabase, including necessary settings and considerations.

Keep your responses concise, technically accurate, and directly implementable. Include code snippets where appropriate.`
      }, message],
      temperature: 0.5, // Lower temperature for more deterministic responses
      max_tokens: 800 // Increased token limit for more detailed responses
    });

    // Extract the response
    const content = completion.choices[0]?.message?.content || 'No suggestion available';

    return NextResponse.json({
      content,
      details: {
        model: completion.model,
        usage: completion.usage ? {
          promptTokens: completion.usage.prompt_tokens,
          completionTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens
        } : undefined
      }
    });
  } catch (error) {
    console.error('Error in analyze API:', error);
    return NextResponse.json(
      { error: 'Failed to analyze' },
      { status: 500 }
    );
  }
}
