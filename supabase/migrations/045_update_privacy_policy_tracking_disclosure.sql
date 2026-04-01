-- Fix privacy policy: correct tracking disclosures and remove inaccurate "no cookies" claim.
-- Previous version (021) said "no tracking cookies" but the site uses AnalyticsTracker
-- (referrer, UTM params, session ID via sessionStorage) and Vercel Analytics.
update content
set value = '<p>${BUSINESS_NAME} ("we", "us", or "our") operates this website.</p>

<h2>Information We Collect</h2>
<ul>
  <li><strong>Email address</strong> — when you subscribe to our newsletter</li>
  <li><strong>Name, email, and message</strong> — when you submit our contact form</li>
  <li><strong>Order details</strong> — when you make a purchase (processed securely by Square)</li>
  <li><strong>Page views and referrer</strong> — collected anonymously to understand how visitors find us (see Analytics section below)</li>
</ul>

<h2>How We Use Your Information</h2>
<ul>
  <li>To send newsletters you signed up for (you can unsubscribe at any time)</li>
  <li>To respond to contact form enquiries</li>
  <li>To fulfil and communicate about your orders</li>
  <li>To understand website traffic and improve our content</li>
</ul>

<h2>Analytics &amp; Tracking</h2>
<p>We use two analytics tools to understand how visitors use our site:</p>
<ul>
  <li><strong>Vercel Analytics</strong> — collects anonymous page-view counts. No personal data or cookies.</li>
  <li><strong>Internal analytics</strong> — we record the page you visited, how you arrived (referrer URL), and any UTM campaign parameters. This data is stored in your browser's sessionStorage for the duration of your visit and is not linked to your identity.</li>
</ul>
<p>We do not use advertising cookies or cross-site tracking.</p>

<h2>Cookies</h2>
<p>The only cookie set on this site is a strictly-necessary session cookie used to keep admin users logged in. Public visitors are not tracked via cookies. We do use browser sessionStorage to remember your referral source within a single visit.</p>

<h2>Data Retention</h2>
<ul>
  <li>Contact form messages are retained for up to 90 days, then deleted.</li>
  <li>Newsletter subscriber records are kept until you unsubscribe.</li>
  <li>Analytics events are retained for up to 12 months.</li>
</ul>

<h2>Third-Party Services</h2>
<ul>
  <li><strong>Square</strong> — handles all payment processing; your card details are never stored by us</li>
  <li><strong>Resend</strong> — delivers our newsletter emails; your email address is shared with Resend for this purpose</li>
  <li><strong>Vercel</strong> — hosts this website and provides anonymous analytics</li>
</ul>

<h2>Your Rights</h2>
<p>You may unsubscribe from our newsletter at any time using the link in any email we send. To request access to or deletion of your data, <a href="${CONTACT_FORM}">send us a message</a> and we will respond within 30 days.</p>

<h2>Contact</h2>
<p>Questions about this policy? <a href="${CONTACT_FORM}">Send us a message</a>.</p>'
where key = 'privacy_policy';
