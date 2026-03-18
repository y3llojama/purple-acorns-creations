// public/js/main.js
document.addEventListener('DOMContentLoaded', () => {
  // Update copyright year
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Smooth scroll for internal anchors (if any)
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const target = document.querySelector(link.getAttribute('href'));
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
  });

  // Contact form handling
  const form = document.getElementById('contactForm');
  if (form) {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const status = document.getElementById('status');
      status.textContent = 'Sending…';
      const payload = {
        name: form.name.value,
        email: form.email.value,
        message: form.message.value,
      };
      try {
        const res = await fetch('/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          status.textContent = '✅ Message sent!';
          form.reset();
        } else {
          throw new Error('Server error');
        }
      } catch (err) {
        console.error(err);
        status.textContent = '❌ Failed to send. Please try again later.';
      }
    });
  }
});
