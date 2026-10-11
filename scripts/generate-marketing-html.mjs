import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, '..');
const distDirectory = path.join(projectDirectory, 'dist');
const siteUrl = 'https://kubika.techmat.rw';
const baseHtml = await fs.readFile(path.join(distDirectory, 'index.html'), 'utf8');
await fs.writeFile(path.join(distDirectory, 'app.html'), baseHtml);

const pages = {
  '/': {
    title: 'Inventory and Accounting Software in Rwanda | KUBIKA',
    description: 'Manage inventory, accounting, purchasing, POS and RRA workflows in one cloud system built for businesses in Rwanda.',
    heading: 'Inventory and accounting software for Rwandan businesses.',
    summary: 'KUBIKA brings stock control, purchasing, accounting, payroll and sales together so teams can manage day-to-day operations from one workspace.',
    sections: ['Track stock across products and branches', 'Connect purchasing, receiving and accounting', 'Support Rwanda-focused tax and EBM workflows'],
  },
  '/pricing': {
    title: 'KUBIKA Pricing | Inventory and Accounting Plans',
    description: 'Explore KUBIKA plans for Rwandan SMEs that need connected inventory management, accounting, purchasing, POS and branch reporting.',
    heading: 'ERP plans for Rwandan SMEs.',
    summary: 'Choose a KUBIKA operating plan for connected stock, accounting, purchasing, payroll and branch reporting.',
    sections: ['Stock and inventory control', 'Accounting and financial reporting', 'Multi-branch operations'],
  },
  '/about': {
    title: 'About BluePeak Rwanda | KUBIKA Business Software',
    description: 'Meet BluePeak Rwanda Digital Solutions, the Kigali team behind KUBIKA inventory, purchasing, sales and accounting software for businesses.',
    heading: 'Practical business software, built in Kigali.',
    summary: 'BluePeak Rwanda Digital Solutions Ltd builds KUBIKA, a business management system that connects inventory, purchasing, sales and accounting workflows.',
    sections: ['Rwanda-based digital solutions company', 'Inventory and stock management', 'Accounting, purchasing and sales tools'],
  },
  '/trust': {
    title: 'KUBIKA Security and Data Controls | Rwanda',
    description: 'Learn how KUBIKA protects company records with role-based access, audit history, backups and secure cloud operations for Rwanda businesses.',
    heading: 'Secure business software for Rwanda.',
    summary: 'KUBIKA keeps company records protected with role-based access, activity history and resilient backups.',
    sections: ['Company data boundaries', 'Roles and permissions', 'Traceable activity history'],
  },
  '/operations': {
    title: 'Inventory Management Software in Rwanda | KUBIKA',
    description: 'Manage stock, warehouses, purchasing, goods received, sales and branches with KUBIKA inventory software for businesses in Rwanda and East Africa.',
    heading: 'Inventory management software for Rwanda and East Africa.',
    summary: 'Track products, warehouses, purchases, sales, transfers and reorder levels in one connected inventory system.',
    sections: ['Warehouse and stock control', 'Purchasing and goods received', 'Sales, POS and branch reporting'],
  },
  '/platform': {
    title: 'Accounting and Inventory Software in Rwanda | KUBIKA',
    description: 'Connect inventory, accounting, payroll, POS and RRA workflows in one cloud business management system for Rwandan companies.',
    heading: 'Accounting and inventory in one business system.',
    summary: 'Bring stock, accounting, payroll, POS and tax-related workflows together in a cloud system designed for Rwandan businesses.',
    sections: ['Cloud inventory and accounting', 'Payroll, PAYE and RSSB workflows', 'VAT and RRA reporting'],
  },
};

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const socialProfiles = [
  {
    label: 'X profile, @KigeliVI',
    href: 'https://x.com/KigeliVI',
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.9 1.2h3.7l-8.1 9.2L24 22.9h-7.4l-5.8-7.6-6.6 7.6H.5l8.6-9.8L0 1.2h7.6l5.2 6.9 6.1-6.9Zm-1.3 19.5h2L6.5 3.2h-2l13.1 17.5Z"/></svg>',
  },
  {
    label: 'Instagram profile, @winn__d',
    href: 'https://www.instagram.com/winn__d/',
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle class="public-site-footer__icon-dot" cx="18" cy="6" r="1"/></svg>',
  },
  {
    label: 'TikTok profile, @jay___win',
    href: 'https://www.tiktok.com/@jay___win',
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.6 7.1a6.7 6.7 0 0 1-4.1-1.4v8.1a6.3 6.3 0 1 1-5.5-6.2v3.7a2.7 2.7 0 1 0 1.8 2.5V2h3.7c.2 2.2 1.8 4 4.1 4.4v.7Z"/></svg>',
  },
  {
    label: 'GitHub profile, UWINEZAJeanDamascene',
    href: 'https://github.com/UWINEZAJeanDamascene',
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .8a11.2 11.2 0 0 0-3.54 21.83c.56.1.77-.24.77-.54v-2.1c-3.14.68-3.8-1.33-3.8-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.03-.7.08-.69.08-.69 1.14.08 1.74 1.17 1.74 1.17 1.01 1.73 2.64 1.23 3.29.94.1-.73.4-1.23.72-1.52-2.5-.28-5.14-1.25-5.14-5.57 0-1.23.44-2.24 1.17-3.03-.12-.28-.5-1.44.11-2.99 0 0 .95-.3 3.08 1.16a10.7 10.7 0 0 1 5.6 0c2.14-1.46 3.08-1.16 3.08-1.16.61 1.55.23 2.71.12 2.99.72.79 1.16 1.8 1.16 3.03 0 4.33-2.64 5.28-5.16 5.56.4.35.77 1.03.77 2.08v3.1c0 .3.2.65.78.54A11.2 11.2 0 0 0 12 .8Z"/></svg>',
  },
];
const socialLinksHtml = socialProfiles
  .map(({ label, href, icon }) => `<a href="${href}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}" target="_blank" rel="noopener noreferrer">${icon}</a>`)
  .join('');

for (const [route, page] of Object.entries(pages)) {
  const canonical = `${siteUrl}${route === '/' ? '/' : route}`;
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${siteUrl}/#organization`,
    name: 'BluePeak Rwanda Digital Solutions Ltd',
    url: siteUrl,
    logo: `${siteUrl}/kubika-system-logo.png`,
    telephone: '+250780936645',
    email: 'uwinezajd2@gmail.com',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'KK 398 St, Kagarama, Kicukiro',
      addressLocality: 'Kigali',
      addressCountry: 'RW',
    },
    sameAs: ['https://bluepeakrwanda.ctskigali.com/'],
  };
  const fallback = `
    <main style="max-width:760px;margin:0 auto;padding:48px 24px;font-family:Arial,sans-serif;color:#172338">
      <p style="font-weight:700;letter-spacing:.12em;color:#c75f34">KUBIKA / RWANDA BUSINESS SOFTWARE</p>
      <h1>${escapeHtml(page.heading)}</h1>
      <p>${escapeHtml(page.summary)}</p>
      <h2>What KUBIKA connects</h2>
      <ul>${page.sections.map((section) => `<li>${escapeHtml(section)}</li>`).join('')}</ul>
      <p>Explore <a href="/operations">inventory management</a>, <a href="/platform">accounting and business tools</a>, <a href="/pricing">plans</a>, and <a href="/trust">security information</a>.</p>
      <p><a href="/about">About BluePeak Rwanda</a>.</p>
      <p><a href="/register">Create a KUBIKA workspace</a> or <a href="/login">sign in</a>.</p>
    </main>
    <footer class="home-footer public-site-footer">
      <div class="about-container public-site-footer__inner">
        <div class="public-site-footer__main">
          <div class="public-site-footer__identity"><a href="/" aria-label="KUBIKA home"><strong>KUBIKA</strong></a><p>Connected business tools for growing teams in Rwanda.</p></div>
          <div class="public-site-footer__groups">
            <section class="public-site-footer__group"><h2>Contact</h2><address>KK 398 St, Kagarama,<br/>Kicukiro, Kigali, Rwanda</address><a href="tel:+250780936645">+250 780 936 645</a><a href="mailto:uwinezajd2@gmail.com">uwinezajd2@gmail.com</a></section>
            <nav class="public-site-footer__group"><h2>Explore</h2><a href="/about">About us</a><a href="/pricing">Pricing</a><a href="https://bluepeakrwanda.ctskigali.com/">BluePeak Rwanda</a></nav>
            <section class="public-site-footer__group"><h2>Follow</h2><nav class="public-site-footer__social" aria-label="Social media">${socialLinksHtml}</nav></section>
          </div>
        </div>
        <div class="public-site-footer__bottom"><span>Copyright ${new Date().getFullYear()} BluePeak Rwanda Digital Solutions Ltd</span><span>Kigali, Rwanda</span></div>
      </div>
    </footer>`;

  const pageHtml = baseHtml
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(page.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/>/, `<meta name="description" content="${escapeHtml(page.description)}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${escapeHtml(page.title)}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/>/, `<meta property="og:description" content="${escapeHtml(page.description)}" />`)
    .replace(/<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${canonical}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*"\s*\/>/, `<meta name="twitter:title" content="${escapeHtml(page.title)}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*"\s*\/>/, `<meta name="twitter:description" content="${escapeHtml(page.description)}" />`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${canonical}" />`)
    .replace('</head>', `<script type="application/ld+json" id="kubika-organization-schema">${JSON.stringify(organizationSchema)}</script></head>`)
    .replace('<div id="root"></div>', `<div id="root">${fallback}</div>`);

  const outputDirectory = path.join(distDirectory, route === '/' ? '' : route.slice(1));
  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.writeFile(path.join(outputDirectory, 'index.html'), pageHtml);
}

console.log(`Generated static marketing HTML for ${Object.keys(pages).length} routes.`);
