// deno-lint-ignore-file
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.4"
import OpenAI from "https://deno.land/x/openai@v4.52.7/mod.ts";
import { Ratelimit } from "https://cdn.skypack.dev/@upstash/ratelimit@latest";
import { Redis } from "https://esm.sh/@upstash/redis";
import { corsHeaders } from './_shared/cors.ts'

const openAiKey = Deno.env.get('OPENAI_API_KEY')!
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const redisUrl = Deno.env.get("UPSTASH_REDIS_REST_URL")!
const redisToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN")!

const openai = new OpenAI({
  apiKey: openAiKey
});
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)
const redis = new Redis({
  url: redisUrl,
  token: redisToken,
});

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { ...corsHeaders } })
  }

  try {
    if (req.method !== 'POST') {
      throw new Error(`HTTP method ${req.method} is not allowed.`);
    }

    const body = await req.text();
    let { query } = JSON.parse(body);

    if (!query) {
      throw new Error("Query is required");
    }

    const ratelimit = new Ratelimit({
      redis: redis,
      limiter: Ratelimit.slidingWindow(3, "10 s"),
      analytics: true,
      prefix: "@upstash/ratelimit",
    });

    const identifier = "api";
    const { success } = await ratelimit.limit(identifier);
    if (!success) {
      throw new Error("Rate Limit Exception");
    }
    
    const embedding = await embedQuery(query)
    const relevantDocuments = await retrieveRelevantDocuments(query, embedding)
    const response = await generateResponse(query, relevantDocuments)
    
    return new Response(JSON.stringify({ response }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

async function embedQuery(query: string): Promise<number[]> {
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-large',
    input: query,
    dimensions: 384,
  })
  return embeddingResponse.data[0].embedding
}

async function retrieveRelevantDocuments(query: string, embedding: number[]): Promise<any[]> {
  const { data, error } = await supabase.rpc('hybrid_search', {
    query_text: query,
    query_embedding: embedding,
    match_count: 5,
  })
  
  if (error) {
    console.error('Error in hybrid_search:', error);
    throw error;
  }
  return data;
}

async function generateResponse(query: string, relevantDocuments: any[]): Promise<string> {
  const context = relevantDocuments.map(doc => doc.content).join('\n\n')
  const prompt = `Context: ${context}\n\nQuestion: ${query}\n\nAnswer:`
  const preliminary = 
  'You are Zohaib Ahmed, a software engineer and computer science student. Use only the provided context of your experience and accomplishments to answer the question. Limit your responses to 2-3 sentences max.'
  
  const completionResponse = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: preliminary },
      { role: 'user', content: prompt }
    ],
  })
  
  return completionResponse.choices[0].message.content || "Error"
}