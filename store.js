import { hebrewBirthDate, nextHebrewBirthday, today, daysBetween } from './hebdate.js';

export const DEFAULT_SETTINGS = {
  daysBefore: 1,      // extra reminder N days before (0 = only on the day)
  notifyHour: 8,      // don't notify before this local hour
  autoSync: true,     // background sync from Facebook
  syncEveryDays: 3,
};

export async function load() {
  const { friends = {}, settings = {}, notified = {}, lastSync = null } =
    await chrome.storage.local.get(['friends', 'settings', 'notified', 'lastSync']);
  return { friends, settings: { ...DEFAULT_SETTINGS, ...settings }, notified, lastSync };
}

export async function saveFriends(friends) {
  await chrome.storage.local.set({ friends });
}

// The effective birth year: one the user typed wins over one read from Facebook.
export function birthYear(f) {
  return f.manualYear ?? f.year ?? null;
}

// Friends with a known birth year, enriched with their next Hebrew birthday.
export function upcoming(friends, from = today()) {
  const list = [];
  for (const f of Object.values(friends)) {
    const y = birthYear(f);
    if (!y || f.hidden) continue;
    const hBirth = hebrewBirthDate(y, f.month, f.day, !!f.afterSunset);
    const next = nextHebrewBirthday(hBirth, from);
    if (!next) continue;
    list.push({ ...f, hBirth, next, inDays: daysBetween(from, next.date) });
  }
  return list.sort((a, b) => a.inDays - b.inDays);
}

// Merge freshly scraped friends into storage without overwriting user edits.
export function mergeScraped(friends, scraped) {
  let added = 0;
  for (const s of scraped) {
    const prev = friends[s.id];
    if (!prev) added++;
    friends[s.id] = {
      ...prev,
      id: s.id,
      name: s.name,
      url: s.url,
      day: s.day,
      month: s.month,
      year: s.year ?? prev?.year ?? null,
      source: 'facebook',
      updated: Date.now(),
    };
  }
  return added;
}
