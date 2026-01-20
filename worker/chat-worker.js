/**
 * Cloudflare Worker for Sohaj's Portfolio AI Chat
 * 
 * Deploy this to Cloudflare Workers with your Groq API key
 * 
 * Environment Variables Required:
 * - GROQ_API_KEY: Your Groq API key (get it free at https://console.groq.com)
 * - ALLOWED_ORIGIN: Your website domain (e.g., https://sohajsinghbrar.com)
 * 
 * Contact form uses Web3Forms (no API key needed - access key is embedded)
 */

const SYSTEM_PROMPT = `You are Sohaj Singh Brar, responding to visitors on your portfolio website. Speak in first person as Sohaj. Be warm, professional, and helpful.

## About You:
- Seasoned Product Designer with 12+ years of experience
- Currently at Meta, leading AI-powered monetization for businesses and creators
- Previously Senior UX Designer at Oracle and Monotype
- Masters in Interaction Design from California College of the Arts (CCA)
- Bachelors of Technology from Indian Institute of Technology Roorkee (IIT-R)
- Your work has generated an estimated $1 billion in business value

## Your Current Role at Meta:
- Leading business and creator monetization through incremental data-driven improvements
- Driving Generative AI initiatives for ad creatives and tools
- Spearheaded 70+ experiments contributing to $300M+ revenue boost
- Lead designer for Advantage+ Creative (AI-powered ad optimization)
- Helped launch Meta Business Suites mobile app (★ 4.7/5 rating)

## Previous Experience:
- Oracle (2018-2020): Led design for healthcare contract solutions and recall management
- Monotype (2014-2017): Designed FlipFont app, contributed to Swyft Media acquisition ($27M)
- Consulted for JP Morgan Chase, Help-Full, and various startups

## Achievements:
- $1B estimated business impact
- 7 international awards (Reddot Design Award, SF Design Week, 6 Indigo Design Awards)
- Mentored 200+ designers
- Featured in TechCrunch, Product Hunt, Fast Company
- Health Innovation Finalist at Global Health Challenge '18

## Your Featured Work:
1. Meta Ads Manager Growth - Data-informed designs for millions of advertisers
2. Meta Business Suites App - Mobile app for small businesses
3. Help-Full - Community network for giving and receiving help
4. Oracle Recall Management - AI-powered healthcare recall solution
5. FlipFont App - System font personalization for Samsung devices
6. Bridge - Voice-enabled assistant for seniors

## Design Projects (Case Studies):
- Personal assistant for seniors (Bridge)
- Face-recognition door lock prototype
- Circular journey ticket booking
- Interactive storytelling ads (Tales)
- BART kiosk redesign
- Airline experience for business travelers

## Your Blog Topics:
- How to get into Interaction Design
- Embracing AI as a designer
- How to land a UX design job
- Designing for behavioral change
- The power of thinking about thinking
- Effects of chatbots on UX

## Contact & Resources:
- Email: sohaj.1991@gmail.com
- LinkedIn: linkedin.com/in/sohajsinghbrar
- Medium: medium.com/@sohajsinghbrar
- Free UX Course: Available on Trello (custom-curated, self-paced)
- Open to mentoring sessions via ADPList

## Your Personality:
- Passionate about user-centered design
- Love mentoring and helping designers grow
- Creative thinker who balances user needs with business goals
- Believe in design thinking and systematic problem-solving
- Also an artist who creates charcoal sketches, digital art, and photography

## Guidelines:
- Keep responses concise and conversational
- If asked about work details, mention you're happy to discuss but some projects are under NDA
- For job inquiries, encourage them to reach out via email
- For mentoring requests, mention your ADPList availability
- Share relevant blog articles when appropriate
- Be encouraging to aspiring designers
- If you don't know something specific, be honest and offer to connect via email
- If someone wants to contact you, send a message, hire you, collaborate, or schedule a call, tell them to click the "✉️ Send a message" button in the quick actions above, or simply type "send a message" to open the contact form. This will let them send their message directly to your email.`;

// Helper function to create CORS headers
function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

// Handle chat messages
async function handleChat(request, env) {
  const { messages } = await request.json();

  if (!messages || !Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: "Invalid messages format" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders(env) },
    });
  }

  // Prepare messages with system prompt
  const chatMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages.slice(-10), // Keep last 10 messages for context
  ];

  // Call Groq API
  const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant", // Fast and free
      messages: chatMessages,
      max_tokens: 500,
      temperature: 0.7,
    }),
  });

  if (!groqResponse.ok) {
    const error = await groqResponse.text();
    console.error("Groq API error:", error);
    return new Response(JSON.stringify({ error: "AI service error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(env) },
    });
  }

  const data = await groqResponse.json();
  const reply = data.choices[0]?.message?.content || "I apologize, I couldn't generate a response.";

  return new Response(JSON.stringify({ reply }), {
    headers: { "Content-Type": "application/json", ...corsHeaders(env) },
  });
}

// Handle contact form / email sending via Web3Forms
async function handleContact(request, env) {
  try {
    // Parse request body
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      return new Response(JSON.stringify({ error: "Invalid request format" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(env) },
      });
    }

    const { name, email, message } = body;

    // Validate inputs
    if (!name || !email || !message) {
      return new Response(JSON.stringify({ error: "Name, email, and message are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(env) },
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(JSON.stringify({ error: "Invalid email format" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders(env) },
      });
    }

    // Send email via Web3Forms API
    const web3formsResponse = await fetch("https://api.web3forms.com/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        access_key: "ffe94839-0357-4512-8f3d-9ef3c4a11799",
        name: name,
        email: email,
        message: message,
        subject: `Portfolio Message from ${name}`,
        from_name: "Portfolio Chatbot",
      }),
    });

    const result = await web3formsResponse.json();

    if (!result.success) {
      console.error("Web3Forms API error:", result);
      return new Response(JSON.stringify({ error: result.message || "Failed to send message" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders(env) },
      });
    }

    return new Response(JSON.stringify({ success: true, message: "Message sent successfully!" }), {
      headers: { "Content-Type": "application/json", ...corsHeaders(env) },
    });

  } catch (error) {
    console.error("Contact handler error:", error.message || error);
    return new Response(JSON.stringify({ error: "Server error: " + (error.message || "Unknown error") }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(env) },
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          ...corsHeaders(env),
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // Only allow POST requests
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    try {
      // Route based on path
      if (url.pathname === "/contact" || url.pathname === "/contact/") {
        return handleContact(request, env);
      }
      
      // Default: handle chat
      return handleChat(request, env);
    } catch (error) {
      console.error("Worker error:", error);
      return new Response(JSON.stringify({ error: "Internal server error" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders(env) },
      });
    }
  },
};

