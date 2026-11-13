import { useEffect } from 'react';
import { useLocation } from 'react-router';
import i18n from '@/i18n';

const SITE_URL = 'https://kubika-ebmf.vercel.app';
const DEFAULT_IMAGE = `${SITE_URL}/og-image.svg`;

interface PageSeo {
  title: string;
  description: string;
  type?: 'website' | 'software';
}

const publicSeo: Record<string, PageSeo> = {
  '/': {
    title: 'Inventory and Accounting Software in Rwanda | KUBIKA',
    description:
      'Manage inventory, accounting, purchasing, POS and RRA workflows in one cloud system built for businesses in Rwanda.',
    type: 'software',
  },
  '/pricing': {
    title: 'KUBIKA Pricing | Inventory and Accounting Plans',
    description:
      'Compare KUBIKA plans for businesses that need connected inventory management, accounting, purchasing, POS and branch reporting.',
  },
  '/about': {
    title: 'About BluePeak Rwanda | KUBIKA Business Software',
    description:
      'Meet BluePeak Rwanda Digital Solutions, the Kigali team behind KUBIKA inventory, purchasing, sales and accounting software for businesses.',
  },
  '/operations': {
    title: 'Inventory Management Software in Rwanda | KUBIKA',
    description:
      'Manage stock, warehouses, purchasing, goods received, sales and branches with KUBIKA inventory software for businesses in Rwanda and East Africa.',
  },
  '/platform': {
    title: 'Accounting and Inventory Software in Rwanda | KUBIKA',
    description:
      'Connect inventory, accounting, payroll, POS and RRA workflows in one cloud business management system for Rwandan companies.',
  },
  '/trust': {
    title: 'KUBIKA Security and Data Controls | Rwanda',
    description:
      'See how KUBIKA supports business data security with role-based permissions, activity history and backups for teams in Rwanda.',
  },
};

const setMeta = (name: string, content: string, property = false) => {
  const attribute = property ? 'property' : 'name';
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${name}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, name);
    document.head.appendChild(element);
  }
  element.content = content;
};

const setLink = (rel: string, href: string, type?: string) => {
  let element = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!element) {
    element = document.createElement('link');
    element.rel = rel;
    document.head.appendChild(element);
  }
  element.href = href;
  if (type) element.type = type;
};

const setJsonLd = (id: string, value: unknown) => {
  let element = document.head.querySelector<HTMLScriptElement>(`script#${id}`);
  if (!element) {
    element = document.createElement('script');
    element.id = id;
    element.type = 'application/ld+json';
    document.head.appendChild(element);
  }
  element.textContent = JSON.stringify(value);
};

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${SITE_URL}/#organization`,
  name: 'BluePeak Rwanda Digital Solutions Ltd',
  url: SITE_URL,
  logo: `${SITE_URL}/kubika-system-logo.png`,
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'KK 398 St, Kagarama, Kicukiro',
    addressLocality: 'Kigali',
    addressCountry: 'RW',
  },
  telephone: '+250780936645',
  email: 'uwinezajd2@gmail.com',
  contactPoint: {
    '@type': 'ContactPoint',
    telephone: '+250780936645',
    email: 'uwinezajd2@gmail.com',
    contactType: 'customer support',
    areaServed: 'RW',
  },
  // Add verified social profile URLs here when the company profiles are published.
  sameAs: ['https://bluepeakrwanda.ctskigali.com/'],
};

function getLocale() {
  const language = i18n.language?.split('-')[0] || 'en';
  return language === 'rw' ? 'rw' : language === 'fr' ? 'fr' : 'en';
}

export function SeoManager() {
  const { pathname } = useLocation();

  useEffect(() => {
    const normalizedPath = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
    const seo = publicSeo[normalizedPath];
    const canonicalUrl = `${SITE_URL}${normalizedPath}`;
    const isIndexable = Boolean(seo);
    const title = seo?.title || 'KUBIKA SYSTEM | Secure Business Operations';
    const description = seo?.description || 'KUBIKA is a secure cloud workspace for business operations.';

    document.title = title;
    document.documentElement.lang = getLocale();
    setMeta('description', description);
    setMeta('robots', isIndexable ? 'index, follow' : 'noindex, nofollow');
    setMeta('og:title', title, true);
    setMeta('og:description', description, true);
    setMeta('og:type', seo?.type === 'software' ? 'website' : 'website', true);
    setMeta('og:url', canonicalUrl, true);
    setMeta('og:image', DEFAULT_IMAGE, true);
    setMeta('og:image:alt', 'KUBIKA cloud stock management and accounting ERP', true);
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', title);
    setMeta('twitter:description', description);
    setMeta('twitter:image', DEFAULT_IMAGE);
    setLink('canonical', canonicalUrl);
    setJsonLd('kubika-organization-schema', organizationSchema);

    document.head.querySelector('#kubika-software-schema')?.remove();
  }, [pathname]);

  return null;
}
