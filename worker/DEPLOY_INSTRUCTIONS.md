# AI Chat Deployment Instructions

Follow these steps to deploy the AI chat feature powered by Groq, with email contact functionality via Resend.

## Prerequisites

1. **Groq API Key** (Free)
   - Go to [console.groq.com](https://console.groq.com)
   - Sign up for a free account
   - Navigate to API Keys and create a new key
   - Copy the key (you'll need it later)

2. **Resend API Key** (Free - for email feature)
   - Go to [resend.com](https://resend.com)
   - Sign up for a free account (100 emails/day free)
   - Navigate to API Keys and create a new key
   - Copy the key (you'll need it later)

3. **Cloudflare Account** (Free)
   - Go to [dash.cloudflare.com](https://dash.cloudflare.com)
   - Sign up for a free account

---

## Step-by-Step Deployment

### Step 1: Create a Cloudflare Worker

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. In the left sidebar, click **"Workers & Pages"**
3. Click **"Create application"**
4. Select **"Create Worker"**
5. Give it a name like `sohaj-chat-api`
6. Click **"Deploy"** (we'll add the code next)

### Step 2: Add the Worker Code

1. After deployment, click **"Edit code"**
2. Delete all the default code
3. Copy the entire contents of `chat-worker.js` from this folder
4. Paste it into the editor
5. Click **"Save and deploy"**

### Step 3: Configure Environment Variables

1. Go back to your Worker's settings
2. Click on **"Settings"** tab
3. Scroll down to **"Variables"**
4. Click **"Add variable"** and add these:

| Variable Name    | Value                                      |
|------------------|-------------------------------------------|
| `GROQ_API_KEY`   | Your Groq API key                         |
| `RESEND_API_KEY` | Your Resend API key (for email feature)   |
| `ALLOWED_ORIGIN` | `https://sohajsinghbrar.com` (your domain)|

5. Click **"Encrypt"** for `GROQ_API_KEY` and `RESEND_API_KEY` to keep them secret
6. Click **"Save and deploy"**

### Step 4: Get Your Worker URL

1. Go to your Worker's overview page
2. Copy the URL (looks like `https://sohaj-chat-api.YOUR-SUBDOMAIN.workers.dev`)

### Step 5: Update the Chat Widget

1. Open `js/chat.js` in your website files
2. Find this line near the top:
   ```javascript
   apiEndpoint: 'YOUR_CLOUDFLARE_WORKER_URL',
   ```
3. Replace `YOUR_CLOUDFLARE_WORKER_URL` with your actual Worker URL:
   ```javascript
   apiEndpoint: 'https://sohaj-chat-api.YOUR-SUBDOMAIN.workers.dev',
   ```
4. Save the file and deploy your website

---

## Testing

1. Open your website
2. Click the green chat button in the bottom right
3. Type a message and see if you get a response!

---

## Troubleshooting

### "API endpoint not configured" error
- Make sure you updated `js/chat.js` with your Worker URL

### CORS errors in console
- Check that `ALLOWED_ORIGIN` in your Worker matches your website domain exactly
- For testing locally, you can temporarily set it to `*`

### "AI service error" message
- Check your Groq API key is correct
- Make sure the environment variables are set in Cloudflare

### Chat not appearing
- Make sure `css/chat.css` and `js/chat.js` are properly linked in your HTML
- Check browser console for any JavaScript errors

---

## Free Tier Limits

| Service            | Free Limit                           |
|--------------------|--------------------------------------|
| Groq API           | 14,400 requests/day, 6,000 tokens/min |
| Cloudflare Workers | 100,000 requests/day                 |
| Resend             | 100 emails/day, 3,000 emails/month   |

These limits are very generous for a portfolio website!

---

## Email Contact Feature

The chatbot includes a "Send a message" option that allows visitors to send you emails directly through the chat interface.

### How it works:
1. User clicks "✉️ Send a message" in quick actions
2. A contact form appears in the chat
3. User fills in their name, email, and message
4. The message is sent to your email (sohaj.1991@gmail.com)
5. You can reply directly to the sender's email

### Customizing the recipient email:
Edit `chat-worker.js` and change this line:
```javascript
to: "sohaj.1991@gmail.com",
```

### Using your own domain for sending (optional):
By default, emails are sent from `onboarding@resend.dev`. To use your own domain:
1. Go to Resend dashboard → Domains
2. Add and verify your domain
3. Update the `from` field in `chat-worker.js`:
```javascript
from: "Contact <contact@yourdomain.com>",
```

---

## Customization

### Change Quick Actions
Edit the `quickActions` array in `js/chat.js`:
```javascript
quickActions: [
  "Tell me about yourself",
  "What's your current role?",
  "Show me your work",
  "How can I contact you?"
]
```

### Modify AI Personality
Edit the `SYSTEM_PROMPT` in `chat-worker.js` to adjust how the AI responds.

### Change Chat Appearance
Edit `css/chat.css` to customize colors, sizes, and animations.

---

## Support

If you run into issues, the Cloudflare Workers documentation is excellent:
https://developers.cloudflare.com/workers/

For Groq API: https://console.groq.com/docs

