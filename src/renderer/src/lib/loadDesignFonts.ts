const FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700' +
  '&family=Manrope:wght@400;500;600;700' +
  '&family=JetBrains+Mono:wght@400;500;600' +
  '&family=Press+Start+2P&family=VT323&family=Silkscreen:wght@400;700&display=swap';

/** Idempotent: safe to call from App on every mount. */
export function loadDesignFonts(): void {
  const id = 'ds-google-fonts';
  if (document.getElementById(id)) return;
  const preconnect1 = Object.assign(document.createElement('link'), {
    rel: 'preconnect',
    href: 'https://fonts.googleapis.com',
  });
  const preconnect2 = Object.assign(document.createElement('link'), {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: 'anonymous',
  } as Partial<HTMLLinkElement>);
  const link = Object.assign(document.createElement('link'), {
    id,
    rel: 'stylesheet',
    href: FONTS_HREF,
  });
  document.head.append(preconnect1, preconnect2, link);
}
