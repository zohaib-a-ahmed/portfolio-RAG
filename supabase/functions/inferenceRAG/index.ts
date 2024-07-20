import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import OpenAI from "https://deno.land/x/openai@v4.52.7/mod.ts";

const openAiKey = Deno.env.get('OPENAI_API_KEY')!
const supabaseUrl = Deno.env.get('LOCAL_SUPABASE_URL')!
const supabaseServiceRoleKey = Deno.env.get('LOCAL_SUPABASE_KEY')!

const openai = new OpenAI({
  apiKey: openAiKey
  });
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

serve(async (req) => {
  const body = await req.text();
  let { query } = JSON.parse(body);

  if (!query) {
    throw new Error("Query is required");
  }
  
  try {
    const embedding = await embedQuery(query)
    const relevantDocuments = await retrieveRelevantDocuments(query, embedding)
    const response = await generateResponse(query, relevantDocuments)
    
    return new Response(JSON.stringify({ response }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
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
  
  const completionResponse = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      { role: 'system', content: 'You are a software engineer. Use only the provided context of your experience and accomplishments to answer the question.' },
      { role: 'user', content: prompt }
    ],
  })
  
  return completionResponse.choices[0].message.content || "Error"
}