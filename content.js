// Reads friends' birthdays from facebook.com/events/birthdays and hands them to the background worker.
// Read-only: it never clicks, scrolls or types on the page.

(() => {
  const MONTHS = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    'ינואר': 1, 'פברואר': 2, 'מרץ': 3, 'מרס': 3, 'אפריל': 4, 'מאי': 5, 'יוני': 6,
    'יולי': 7, 'אוגוסט': 8, 'ספטמבר': 9, 'אוקטובר': 10, 'נובמבר': 11, 'דצמבר': 12,
  };
  const DATE_RE = /^(\d{1,2})\s+ב?([A-Za-z֐-׿]+),?\s*(\d{4})?$/;
  const AGE_RE = /^(?:(\d{1,3})\s+years? old|(?:בן|בת|בגיל)\s+(\d{1,3}))$/i;

  const isBirthdaysPage = () => location.pathname.startsWith('/events/birthdays');

  function profileId(href) {
    try {
      const u = new URL(href, location.origin);
      if (u.hostname !== 'www.facebook.com' && u.hostname !== 'facebook.com') return null;
      if (u.pathname === '/profile.php') return u.searchParams.get('id') ? `id:${u.searchParams.get('id')}` : null;
      const slug = u.pathname.split('/').filter(Boolean)[0];
      return slug ? slug.toLowerCase() : null;
    } catch {
      return null;
    }
  }

  function profileUrl(id) {
    return id.startsWith('id:')
      ? `https://www.facebook.com/profile.php?id=${id.slice(3)}`
      : `https://www.facebook.com/${id}`;
  }

  // The smallest ancestor of a heading that still contains only that one heading.
  function cardOf(heading) {
    let el = heading;
    while (el.parentElement && el.parentElement.querySelectorAll('h2').length === 1) el = el.parentElement;
    return el;
  }

  function parseCards() {
    const main = document.querySelector('[role="main"]');
    if (!main) return [];
    const now = new Date();
    const results = [];
    const seen = new Set();
    let section = -1;
    for (const h of main.querySelectorAll('h2')) {
      const name = h.textContent.trim();
      const card = cardOf(h);
      const link = [...card.querySelectorAll('a[href]')].find((a) => a.textContent.trim() === name)
        || h.querySelector('a[href]') || h.closest('a[href]');
      if (!name || !link) { section++; continue; } // section headings have no profile link
      const id = profileId(link.href);
      // Facebook sometimes keeps a second copy of the page in the DOM; the first copy wins.
      if (!id || seen.has(id)) continue;
      seen.add(id);

      let date = null;
      let age = null;
      for (const line of card.innerText.split('\n').map((s) => s.trim()).filter(Boolean).slice(1, 6)) {
        const dm = line.match(DATE_RE);
        if (dm && MONTHS[dm[2].toLowerCase()]) {
          date = { day: Number(dm[1]), month: MONTHS[dm[2].toLowerCase()], year: dm[3] ? Number(dm[3]) : null };
          continue;
        }
        const am = line.match(AGE_RE);
        if (am) age = Number(am[1] || am[2]);
      }
      // Cards in the first section ("Today's birthdays") show no date, only (sometimes) an age.
      if (!date) {
        if (section !== 0) continue;
        date = { day: now.getDate(), month: now.getMonth() + 1, year: null };
        if (age != null) date.year = now.getFullYear() - age;
      }
      results.push({ id, name, url: profileUrl(id), ...date });
    }
    return results;
  }

  let lastSent = '';

  async function scanWhenReady() {
    let prevCount = -1;
    for (let i = 0; i < 25; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (!isBirthdaysPage()) return;
      const found = parseCards();
      if (found.length > 0 && found.length === prevCount) {
        const key = JSON.stringify(found);
        if (key !== lastSent) {
          lastSent = key;
          chrome.runtime.sendMessage({ type: 'birthdays-scraped', friends: found });
        }
        return;
      }
      prevCount = found.length;
    }
    chrome.runtime.sendMessage({ type: 'birthdays-scraped', friends: [], failed: true });
  }

  // Facebook is a single-page app, so also watch for in-app navigation to the birthdays page.
  let lastPath = '';
  setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      if (isBirthdaysPage()) scanWhenReady();
    }
  }, 1000);
})();
