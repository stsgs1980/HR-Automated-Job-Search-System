/**
 * UI: AUTH
 * ===========
 * HH.ru authentication detection and user name extraction.
 * Logs are suppressed after first detection to avoid console spam.
 */

let authLogged = false; // suppress repeated auth logs
let authResult = null; // cache result

// AUTH CHECK
export function checkAuth() {
  const selectors = [
    '[data-qa="mainmenu_applicant"]',
    '[data-qa="mainmenu_user_name"]',
    'a[data-qa="mainmenu_myResumes"]',
    '[data-qa="mainmenu"] sup',
    '.supernova-nav__item--applicant',
    'a[href*="/applicant/"]',
    'a[href*="/account"]',
    '.bloko-header-hamburger',
    '[data-qa="mainmenu"] a[href*="resumes"]',
    '.mainmenu__item--applicant',
    '[data-qa="mainmenu"]',
    '.HH-React-Header-Nav',
    'nav[class*="nav"] a[href*="resumes"]',
  ];

  // Quick check: if cached result exists and page hasn't changed, return it
  const url = window.location.href;
  if (authResult !== null && authResult._url === url) {
    return authResult.loggedIn;
  }

  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (!el) continue;
      if (document.body.contains(el)) {
        const style = window.getComputedStyle(el);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          if (!authLogged) {
            console.log('[HH-AR][Auth] Authorized (selector:', sel + ')');
            authLogged = true;
          }
          authResult = { loggedIn: true, _url: url };
          return true;
        }
      }
    } catch (e) { /* invalid selector */ }
  }

  // Cookie-based fallback
  const cookies = document.cookie || '';
  if (cookies.includes('hhruuid') || cookies.includes('_HH-RU') || cookies.includes('hhtoken')) {
    if (!authLogged) {
      console.log('[HH-AR][Auth] Authorized (cookie)');
      authLogged = true;
    }
    authResult = { loggedIn: true, _url: url };
    return true;
  }

  if (!authLogged) {
    console.log('[HH-AR][Auth] No auth indicators found');
    authLogged = true;
  }
  authResult = { loggedIn: false, _url: url };
  return false;
}

/** Reset auth cache (call after login/logout) */
export function resetAuthCache() {
  authResult = null;
  authLogged = false;
}

export function getUserName() {
  const nameSelectors = [
    '[data-qa="mainmenu_user_name"]',
    '.supernova-nav__item--applicant',
    'a[href*="/applicant/"]',
  ];
  for (const sel of nameSelectors) {
    try {
      const el = document.querySelector(sel);
      if (el) {
        const name = (el.textContent || '').trim();
        if (name && name.length > 0 && name.length < 100) {
          return name;
        }
      }
    } catch (e) {}
  }
  return 'Пользователь';
}
