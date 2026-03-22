-- Update privacy policy: remove Mailchimp (replaced by Resend) and Behold.so (not in use).
update content
set value = '<p>${BUSINESS_NAME} ("we", "us", or "our") operates this website.</p>

<h2>Information We Collect</h2>
<ul>
  <li><strong>Email address</strong> — when you subscribe to our newsletter</li>
  <li><strong>Name and message</strong> — when you submit our contact form</li>
  <li><strong>Order details</strong> — when you make a purchase (processed securely by Square)</li>
</ul>

<h2>How We Use Your Information</h2>
<ul>
  <li>To send newsletters you signed up for (you can unsubscribe at any time)</li>
  <li>To respond to contact form enquiries</li>
  <li>To fulfil and communicate about your orders</li>
</ul>

<h2>Third-Party Services</h2>
<ul>
  <li><strong>Square</strong> — handles all payment processing; your card details are never stored by us</li>
  <li><strong>Resend</strong> — delivers our newsletter emails; your email address is shared with Resend for this purpose</li>
  <li><strong>Vercel Analytics</strong> — anonymous page-view counts only; no cookies, no personal data collected</li>
</ul>

<h2>Cookies</h2>
<p>We do not use tracking or advertising cookies. The only cookie set is a strictly-necessary session cookie used to keep admin users logged in. Public visitors are not cookied.</p>

<h2>Your Rights</h2>
<p>You may unsubscribe from our newsletter at any time using the link in any email we send. To request deletion of your data, <a href="${CONTACT_FORM}">send us a message</a>.</p>

<h2>Contact</h2>
<p>Questions about this policy? <a href="${CONTACT_FORM}">Send us a message</a>.</p>'
where key = 'privacy_policy';
