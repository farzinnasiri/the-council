// Basic interactions for The Council mockups
// This script adds minimal interactivity to make the designs feel alive

document.addEventListener('DOMContentLoaded', () => {
  // Auto-resize textarea
  const textareas = document.querySelectorAll('textarea');
  textareas.forEach(textarea => {
    textarea.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
  });

  // Send button interaction
  const sendBtn = document.querySelector('.send-btn, .cosmos-send, .glass-send, .canvas-send, .terminal-send');
  const messageInput = document.querySelector('textarea');
  
  if (sendBtn && messageInput) {
    sendBtn.addEventListener('click', () => {
      const message = messageInput.value.trim();
      if (message) {
        console.log('Message sent:', message);
        messageInput.value = '';
        messageInput.style.height = 'auto';
        // Show a subtle feedback
        sendBtn.style.transform = 'scale(0.95)';
        setTimeout(() => {
          sendBtn.style.transform = 'scale(1)';
        }, 150);
      }
    });

    // Send on Enter (but Shift+Enter for new line)
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
      }
    });
  }

  // Session item clicks
  const sessionItems = document.querySelectorAll('.session-item, .orbit-session, .glass-session, .canvas-convo, .terminal-session');
  sessionItems.forEach(item => {
    item.addEventListener('click', () => {
      sessionItems.forEach(s => s.classList.remove('active'));
      item.classList.add('active');
      console.log('Session selected:', item.querySelector('.session-title, .orbit-session-title, .glass-session-title, .canvas-convo-title, .terminal-session-title')?.textContent);
    });
  });

  // Member card clicks
  const memberCards = document.querySelectorAll('.member-card, .star-member, .glass-member, .canvas-member, .terminal-member');
  memberCards.forEach(card => {
    card.addEventListener('click', (e) => {
      // Don't trigger if clicking a button inside
      if (e.target.tagName === 'BUTTON') return;
      
      console.log('Member selected:', card.querySelector('.member-name, .star-info h3, .glass-member-name, .canvas-member-name, .terminal-member-name')?.textContent);
    });
  });

  // Button hover effects (add ripple or scale)
  const buttons = document.querySelectorAll('button');
  buttons.forEach(btn => {
    btn.addEventListener('click', function(e) {
      // Add click feedback
      this.style.transform = 'scale(0.97)';
      setTimeout(() => {
        this.style.transform = '';
      }, 100);
    });
  });

  // Smooth scroll to bottom on load
  const messagesArea = document.querySelector('.messages-area, .chat-messages, .glass-messages, .canvas-messages, .terminal-messages');
  if (messagesArea) {
    setTimeout(() => {
      messagesArea.scrollTop = messagesArea.scrollHeight;
    }, 100);
  }

  console.log('✨ The Council mockup is interactive');
});
