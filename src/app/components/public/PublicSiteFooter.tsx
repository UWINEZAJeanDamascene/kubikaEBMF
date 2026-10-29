import { Link } from 'react-router';
import { BrandMark } from './PublicHeader';

const socialLinks = [
  { label: 'X profile, @KigeliVI', href: 'https://x.com/KigeliVI', icon: 'x' },
  { label: 'Instagram profile, @winn__d', href: 'https://www.instagram.com/winn__d/', icon: 'instagram' },
  { label: 'TikTok profile, @jay___win', href: 'https://www.tiktok.com/@jay___win', icon: 'tiktok' },
  { label: 'GitHub profile, UWINEZAJeanDamascene', href: 'https://github.com/UWINEZAJeanDamascene', icon: 'github' },
];

function SocialIcon({ name }: { name: string }) {
  if (name === 'instagram') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle className="public-site-footer__icon-dot" cx="18" cy="6" r="1" /></svg>;
  }
  if (name === 'tiktok') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.6 7.1a6.7 6.7 0 0 1-4.1-1.4v8.1a6.3 6.3 0 1 1-5.5-6.2v3.7a2.7 2.7 0 1 0 1.8 2.5V2h3.7c.2 2.2 1.8 4 4.1 4.4v.7Z" /></svg>;
  }
  if (name === 'github') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .8a11.2 11.2 0 0 0-3.54 21.83c.56.1.77-.24.77-.54v-2.1c-3.14.68-3.8-1.33-3.8-1.33-.51-1.3-1.25-1.65-1.25-1.65-1.03-.7.08-.69.08-.69 1.14.08 1.74 1.17 1.74 1.17 1.01 1.73 2.64 1.23 3.29.94.1-.73.4-1.23.72-1.52-2.5-.28-5.14-1.25-5.14-5.57 0-1.23.44-2.24 1.17-3.03-.12-.28-.5-1.44.11-2.99 0 0 .95-.3 3.08 1.16a10.7 10.7 0 0 1 5.6 0c2.14-1.46 3.08-1.16 3.08-1.16.61 1.55.23 2.71.12 2.99.72.79 1.16 1.8 1.16 3.03 0 4.33-2.64 5.28-5.16 5.56.4.35.77 1.03.77 2.08v3.1c0 .3.2.65.78.54A11.2 11.2 0 0 0 12 .8Z" /></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.9 1.2h3.7l-8.1 9.2L24 22.9h-7.4l-5.8-7.6-6.6 7.6H.5l8.6-9.8L0 1.2h7.6l5.2 6.9 6.1-6.9Zm-1.3 19.5h2L6.5 3.2h-2l13.1 17.5Z" /></svg>;
}

interface PublicSiteFooterProps {
  variant?: 'home' | 'pricing';
}

export function PublicSiteFooter({ variant = 'home' }: PublicSiteFooterProps) {
  const isPricing = variant === 'pricing';

  return (
    <footer className={`${isPricing ? 'pricing-footer' : 'home-footer'} public-site-footer`}>
      <div className={isPricing ? 'pricing-container public-site-footer__inner' : 'mx-auto max-w-[2400px] px-5 sm:px-8 lg:px-10 xl:px-14 2xl:px-16 public-site-footer__inner'}>
        <div className="public-site-footer__main">
          <div className="public-site-footer__identity">
            <Link to="/" aria-label="KUBIKA home" className={isPricing ? 'pricing-footer__brand' : 'public-site-footer__brand'}>
              <BrandMark />
            </Link>
            <p>Connected business tools for growing teams in Rwanda.</p>
          </div>

          <div className="public-site-footer__groups">
            <section className="public-site-footer__group" aria-labelledby="footer-contact-title">
              <h2 id="footer-contact-title">Contact</h2>
              <address>KK 398 St, Kagarama,<br />Kicukiro, Kigali, Rwanda</address>
              <a href="tel:+250780936645">+250 780 936 645</a>
              <a href="mailto:uwinezajd2@gmail.com">uwinezajd2@gmail.com</a>
            </section>

            <nav className="public-site-footer__group" aria-labelledby="footer-explore-title">
              <h2 id="footer-explore-title">Explore</h2>
              <Link to="/about">About us</Link>
              <Link to="/pricing">Pricing</Link>
              <a href="https://bluepeakrwanda.ctskigali.com/" target="_blank" rel="noopener noreferrer">BluePeak Rwanda</a>
            </nav>

            <section className="public-site-footer__group" aria-labelledby="footer-follow-title">
              <h2 id="footer-follow-title">Follow</h2>
              <nav className="public-site-footer__social" aria-label="Social media">
                {socialLinks.map(({ label, href, icon }) => (
                  <a key={href} href={href} aria-label={label} title={label} target="_blank" rel="noopener noreferrer"><SocialIcon name={icon} /></a>
                ))}
              </nav>
            </section>
          </div>
        </div>

        <div className="public-site-footer__bottom">
          <span>Copyright {new Date().getFullYear()} BluePeak Rwanda Digital Solutions Ltd</span>
          <span>Kigali, Rwanda</span>
        </div>
      </div>
    </footer>
  );
}

