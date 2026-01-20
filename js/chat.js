/* ============================================
   AI Chat Widget for Sohaj's Portfolio
   ============================================ */

(function() {
  'use strict';

  // Configuration - Cloudflare Worker URL
  const CONFIG = {
    // Cloudflare Worker API endpoint
    apiEndpoint: 'https://curly-snow-5c1b.sohaj-1991.workers.dev',
    
    // Contact endpoint (same worker, /contact path)
    contactEndpoint: 'https://curly-snow-5c1b.sohaj-1991.workers.dev/contact',
    
    // Avatar image path
    avatarSrc: 'img/about9.jpg',
    
    // Quick action suggestions
    quickActions: [
      "Tell me about yourself",
      "What's your current role?",
      "Show me your work",
      "✉️ Send a message"
    ]
  };

  // Chat state
  let isOpen = false;
  let messages = [];
  let isTyping = false;

  // Initialize chat when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChat);
  } else {
    initChat();
  }

  function initChat() {
    createChatWidget();
    setupEventListeners();
  }

  function createChatWidget() {
    // Create toggle button
    const toggle = document.createElement('button');
    toggle.className = 'chat-toggle';
    toggle.setAttribute('aria-label', 'Open chat');
    toggle.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#000">
        <path fill="#000" d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
      </svg>
    `;

    // Create chat container
    const container = document.createElement('div');
    container.className = 'chat-container';
    container.innerHTML = `
      <div class="chat-header">
        <div class="chat-header-left">
          <img src="${CONFIG.avatarSrc}" alt="Sohaj" class="chat-avatar">
          <div class="chat-header-info">
            <h4>Chat with Sohaj</h4>
            <span><span class="status-dot"></span>AI-powered assistant</span>
          </div>
        </div>
        <button class="chat-close" aria-label="Close chat">
          <span class="close-icon">✕</span>
        </button>
      </div>
      <div class="chat-messages" id="chat-messages">
        <div class="chat-welcome">
          <h5>👋 Hi there!</h5>
          <p>I'm Sohaj's AI assistant. Ask me anything about my work, experience, or how I can help you!</p>
          <div class="quick-actions" id="quick-actions">
            ${CONFIG.quickActions.map(action => `
              <button class="quick-action">${action}</button>
            `).join('')}
          </div>
        </div>
      </div>
      <div class="chat-input-container">
        <div class="chat-input-wrapper">
          <textarea 
            class="chat-input" 
            id="chat-input"
            placeholder="Ask me anything..."
            rows="1"
          ></textarea>
          <button class="chat-send" id="chat-send" aria-label="Send message">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path fill="#fff" d="M3.4 20.4l17.45-7.48c.81-.35.81-1.49 0-1.84L3.4 3.6c-.66-.29-1.39.2-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(toggle);
    document.body.appendChild(container);
  }

  function setupEventListeners() {
    const toggle = document.querySelector('.chat-toggle');
    const container = document.querySelector('.chat-container');
    const closeBtn = document.querySelector('.chat-close');
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send');
    const quickActions = document.getElementById('quick-actions');

    // Toggle chat
    toggle.addEventListener('click', () => {
      isOpen = !isOpen;
      container.classList.toggle('open', isOpen);
      toggle.classList.toggle('active', isOpen);
      
      if (isOpen) {
        input.focus();
      }
    });

    // Close chat
    closeBtn.addEventListener('click', () => {
      isOpen = false;
      container.classList.remove('open');
      toggle.classList.remove('active');
    });

    // Send message
    sendBtn.addEventListener('click', sendMessage);

    // Enter to send (Shift+Enter for new line)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Auto-resize textarea
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    });

    // Quick actions
    quickActions.addEventListener('click', (e) => {
      if (e.target.classList.contains('quick-action')) {
        const actionText = e.target.textContent.trim();
        
        // Check if user wants to send a message
        if (actionText.includes('Send a message')) {
          showContactForm();
          return;
        }
        
        input.value = actionText;
        sendMessage();
      }
    });

    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) {
        isOpen = false;
        container.classList.remove('open');
        toggle.classList.remove('active');
      }
    });

    // Hero chat form (if exists on page)
    const heroChatForm = document.getElementById('hero-chat-form');
    const heroChatInput = document.getElementById('hero-chat-input');
    const heroChatSend = document.getElementById('hero-chat-send');
    
    if (heroChatForm && heroChatInput && heroChatSend) {
      // Toggle send button active state based on input
      heroChatInput.addEventListener('input', () => {
        if (heroChatInput.value.trim().length > 0) {
          heroChatSend.classList.add('active');
        } else {
          heroChatSend.classList.remove('active');
        }
      });
      
      heroChatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = heroChatInput.value.trim();
        
        // Only proceed if there's text
        if (!text) return;
        
        // Open the chat
        isOpen = true;
        container.classList.add('open');
        toggle.classList.add('active');
        
        // Clear the hero input and reset button
        heroChatInput.value = '';
        heroChatSend.classList.remove('active');
        
        // Set the chat input value and trigger send
        input.value = text;
        
        // Small delay to ensure chat is open, then send
        setTimeout(() => {
          sendMessage();
        }, 100);
      });
    }
  }

  // Detect if user wants to send a message/contact
  function detectContactIntent(text) {
    const contactKeywords = [
      'send a message',
      'send message',
      'contact you',
      'contact sohaj',
      'email you',
      'email sohaj',
      'get in touch',
      'reach out',
      'reach you',
      'message you',
      'leave a message',
      'want to talk',
      'hire you',
      'work with you',
      'collaborate',
      'schedule a call',
      'book a call',
      'send you a message',
      'message for you',
      'i have a message'
    ];
    
    const lowerText = text.toLowerCase();
    return contactKeywords.some(keyword => lowerText.includes(keyword));
  }

  async function sendMessage() {
    const input = document.getElementById('chat-input');
    const messagesContainer = document.getElementById('chat-messages');
    const sendBtn = document.getElementById('chat-send');
    
    const text = input.value.trim();
    if (!text || isTyping) return;

    // Hide welcome message on first message
    const welcome = document.querySelector('.chat-welcome');
    if (welcome) {
      welcome.remove();
    }

    // Check if user wants to contact/send a message
    if (detectContactIntent(text)) {
      // Clear input
      input.value = '';
      input.style.height = 'auto';
      
      // Add user message
      appendMessage('user', text);
      
      // Show contact form
      showContactForm();
      return;
    }

    // Add user message
    messages.push({ role: 'user', content: text });
    appendMessage('user', text);
    
    // Clear input
    input.value = '';
    input.style.height = 'auto';

    // Show typing indicator
    isTyping = true;
    sendBtn.disabled = true;
    const typingEl = showTypingIndicator();

    try {
      // Check if API endpoint is configured
      if (CONFIG.apiEndpoint === 'YOUR_CLOUDFLARE_WORKER_URL') {
        throw new Error('API endpoint not configured');
      }

      const response = await fetch(CONFIG.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = await response.json();
      
      // Add assistant message
      messages.push({ role: 'assistant', content: data.reply });
      appendMessage('assistant', data.reply);

    } catch (error) {
      console.error('Chat error:', error);
      
      // Show error or fallback message
      let errorMessage = "I apologize, but I'm having trouble connecting right now. Please try reaching out to me directly at sohaj.1991@gmail.com or connect with me on LinkedIn!";
      
      if (CONFIG.apiEndpoint === 'YOUR_CLOUDFLARE_WORKER_URL') {
        errorMessage = "The chat is still being set up! In the meantime, feel free to reach out to me at sohaj.1991@gmail.com or connect on LinkedIn.";
      }
      
      appendMessage('assistant', errorMessage);
    } finally {
      // Remove typing indicator
      typingEl.remove();
      isTyping = false;
      sendBtn.disabled = false;
      
      // Scroll to bottom
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  function appendMessage(role, content) {
    const messagesContainer = document.getElementById('chat-messages');
    
    const messageEl = document.createElement('div');
    messageEl.className = `chat-message ${role}`;
    
    // Parse markdown for assistant messages, escape for user messages
    const formattedContent = role === 'assistant' 
      ? parseMarkdown(content) 
      : escapeHtml(content);
    
    messageEl.innerHTML = `
      <div class="bubble">${formattedContent}</div>
    `;
    
    messagesContainer.appendChild(messageEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function showTypingIndicator() {
    const messagesContainer = document.getElementById('chat-messages');
    
    const typingEl = document.createElement('div');
    typingEl.className = 'chat-message assistant typing';
    typingEl.innerHTML = `
      <div class="typing-indicator">
        <span></span>
        <span></span>
        <span></span>
      </div>
    `;
    
    messagesContainer.appendChild(typingEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    return typingEl;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/\n/g, '<br>');
  }

  function parseMarkdown(text) {
    // First escape HTML to prevent XSS
    const div = document.createElement('div');
    div.textContent = text;
    let escaped = div.innerHTML;
    
    // Convert markdown to HTML
    // Bold: **text** or __text__
    escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/__(.+?)__/g, '<strong>$1</strong>');
    
    // Italic: *text* or _text_
    escaped = escaped.replace(/\*(.+?)\*/g, '<em>$1</em>');
    escaped = escaped.replace(/_(.+?)_/g, '<em>$1</em>');
    
    // Inline code: `code`
    escaped = escaped.replace(/`(.+?)`/g, '<code>$1</code>');
    
    // Convert URLs to clickable links (opens in new tab)
    // Matches URLs with http/https or common domains like linkedin.com, medium.com, etc.
    const urlRegex = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+(?:\.[a-zA-Z]{2,})+(?:\/[^\s<]*)?)/g;
    escaped = escaped.replace(urlRegex, function(match) {
      // Add https:// if no protocol specified
      const href = match.startsWith('http') ? match : 'https://' + match;
      return `<a href="${href}" target="_blank" rel="noopener noreferrer">${match}</a>`;
    });
    
    // Convert markdown links: [text](url)
    escaped = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // Line breaks
    escaped = escaped.replace(/\n/g, '<br>');
    
    // Bullet points: lines starting with - or *
    escaped = escaped.replace(/(^|<br>)[-*]\s+(.+?)(?=<br>|$)/g, '$1• $2');
    
    return escaped;
  }

  // Show contact form in chat
  function showContactForm() {
    const messagesContainer = document.getElementById('chat-messages');
    
    // Hide welcome if present
    const welcome = document.querySelector('.chat-welcome');
    if (welcome) {
      welcome.remove();
    }
    
    // Show assistant message explaining the form
    appendMessage('assistant', "I'd love to hear from you! Please fill out the form below and I'll get back to you as soon as possible. 📬");
    
    // Create contact form
    const formEl = document.createElement('div');
    formEl.className = 'chat-contact-form';
    formEl.innerHTML = `
      <form id="chat-contact-form">
        <div class="form-group">
          <label for="contact-name">Your Name</label>
          <input type="text" id="contact-name" placeholder="John Doe" required>
        </div>
        <div class="form-group">
          <label for="contact-email">Your Email</label>
          <input type="email" id="contact-email" placeholder="john@example.com" required>
        </div>
        <div class="form-group">
          <label for="contact-message">Message</label>
          <textarea id="contact-message" placeholder="Hi Sohaj, I'd love to chat about..." rows="4" required></textarea>
        </div>
        <button type="submit" class="contact-submit">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16">
            <path fill="currentColor" d="M3.4 20.4l17.45-7.48c.81-.35.81-1.49 0-1.84L3.4 3.6c-.66-.29-1.39.2-1.39.91L2 9.12c0 .5.37.93.87.99L17 12 2.87 13.88c-.5.07-.87.5-.87 1l.01 4.61c0 .71.73 1.2 1.39.91z"/>
          </svg>
          Send Message
        </button>
      </form>
    `;
    
    messagesContainer.appendChild(formEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Focus on name input
    setTimeout(() => {
      document.getElementById('contact-name').focus();
    }, 100);
    
    // Handle form submission
    const form = document.getElementById('chat-contact-form');
    form.addEventListener('submit', handleContactSubmit);
  }
  
  async function handleContactSubmit(e) {
    e.preventDefault();
    
    const name = document.getElementById('contact-name').value.trim();
    const email = document.getElementById('contact-email').value.trim();
    const message = document.getElementById('contact-message').value.trim();
    const submitBtn = e.target.querySelector('.contact-submit');
    const formEl = document.querySelector('.chat-contact-form');
    
    if (!name || !email || !message) return;
    
    // Disable form and show loading
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <span class="sending-spinner"></span>
      Sending...
    `;
    
    try {
      // Submit directly to Web3Forms (bypasses worker)
      const response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          access_key: 'ffe94839-0357-4512-8f3d-9ef3c4a11799',
          name: name,
          email: email,
          message: message,
          subject: `Portfolio Message from ${name}`,
          from_name: 'Portfolio Chatbot',
        }),
      });
      
      const data = await response.json();
      
      // Remove form
      formEl.remove();
      
      if (data.success) {
        appendMessage('assistant', `Thanks ${name}! 🎉 Your message has been sent successfully. I'll get back to you at ${email} as soon as possible!`);
      } else {
        throw new Error(data.message || 'Failed to send message');
      }
      
    } catch (error) {
      console.error('Contact form error:', error);
      
      // Remove form
      formEl.remove();
      
      appendMessage('assistant', `I'm sorry, there was an issue sending your message. Please try emailing me directly at sohaj.1991@gmail.com or connect with me on LinkedIn. I apologize for the inconvenience!`);
    }
  }

})();

