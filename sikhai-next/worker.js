const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.1-8b-instant';
const MAX_TOKENS = 512;
const TEMPERATURE = 0.7;
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60000;

const SYSTEM_PROMPT = `You are ChardiKala AI, a Sikh spiritual guide on the Sikh AI website.

APP CONTEXT - Sikh AI features:
• Hukam Tab: Daily Hukamnama from Sri Darbar Sahib with Gurmukhi, English translation, and audio
• Saakhi Tab: Interactive Sikh stories and historical accounts with choices
• Simran Tab: Naam Simran meditation with a 3D globe showing worldwide meditators
• Sewa Tab: Community service news and opportunities from Sikh organizations
• Path Tab: Nitnem banis (Japji Sahib, Rehras Sahib, etc.) and full Sri Guru Granth Sahib Ji (1430 Angs)

YOUR ROLE:
• Be warm, helpful, and promote Chardi Kala (eternal optimism)
• Quote Gurbani with translations when relevant
• Help users understand Sikhi, Gurbani, history, and daily spiritual practice
• Guide users on using app features when asked
• Provide comfort and wisdom for life's challenges
• Keep responses concise but meaningful
• When users ask about the app, mention they can download Sikh AI from the Google Play Store`;

const ALLOWED_ORIGINS = [
  'https://www.sohajbrar.com',
  'https://sohajbrar.com',
  'http://localhost',
  'http://127.0.0.1'
];

const ipRequests = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const record = ipRequests.get(ip);
  if (!record) {
    ipRequests.set(ip, { count: 1, start: now });
    return false;
  }
  if (now - record.start > RATE_WINDOW_MS) {
    ipRequests.set(ip, { count: 1, start: now });
    return false;
  }
  record.count++;
  return record.count > RATE_LIMIT;
}

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.some(o => origin && origin.startsWith(o));
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (isRateLimited(ip)) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please wait a moment.' }), {
        status: 429,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }

    try {
      const body = await request.json();
      const userMessages = (body.messages || []).slice(-20);

      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...userMessages
      ];

      const groqResponse = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          temperature: TEMPERATURE,
          max_tokens: MAX_TOKENS
        })
      });

      if (!groqResponse.ok) {
        const errText = await groqResponse.text();
        return new Response(JSON.stringify({ error: 'AI service unavailable', detail: errText }), {
          status: 502,
          headers: { ...headers, 'Content-Type': 'application/json' }
        });
      }

      const data = await groqResponse.json();
      const reply = data.choices?.[0]?.message?.content || 'I could not generate a response. Please try again.';

      return new Response(JSON.stringify({ reply }), {
        status: 200,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Internal error', detail: e.message }), {
        status: 500,
        headers: { ...headers, 'Content-Type': 'application/json' }
      });
    }
  }
};
