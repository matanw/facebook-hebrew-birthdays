// Hebrew calendar helpers built on the browser's built-in Intl Hebrew calendar.
// All Gregorian dates are handled as UTC-noon Date objects to avoid DST/timezone drift.

const DAY = 864e5;
const fmt = new Intl.DateTimeFormat('en-u-ca-hebrew', {
  timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric',
});

const MONTH_KEYS = {
  'Tishri': 'tishri', 'Heshvan': 'heshvan', 'Kislev': 'kislev', 'Tevet': 'tevet',
  'Shevat': 'shevat', 'Adar': 'adar', 'Adar I': 'adar1', 'Adar II': 'adar2',
  'Nisan': 'nisan', 'Iyar': 'iyar', 'Sivan': 'sivan', 'Tamuz': 'tamuz', 'Av': 'av', 'Elul': 'elul',
};

export const MONTH_NAMES_HE = {
  tishri: 'תשרי', heshvan: 'חשוון', kislev: 'כסלו', tevet: 'טבת', shevat: 'שבט',
  adar: 'אדר', adar1: 'אדר א׳', adar2: 'אדר ב׳', nisan: 'ניסן', iyar: 'אייר',
  sivan: 'סיוון', tamuz: 'תמוז', av: 'אב', elul: 'אלול',
};

export function utcDate(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function today() {
  const n = new Date();
  return utcDate(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

export function addDays(date, n) {
  return new Date(date.getTime() + n * DAY);
}

export function daysBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / DAY);
}

export function toHebrew(date) {
  const parts = fmt.formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return { day: Number(get('day')), month: MONTH_KEYS[get('month')], year: Number(get('year')) };
}

export function isLeapYear(hYear) {
  return ((7 * hYear + 1) % 19) < 7;
}

// Per Hebrew year: { monthKey: { start: Date, length: number } }
const yearCache = new Map();

function monthTable(hYear) {
  if (yearCache.has(hYear)) return yearCache.get(hYear);
  const table = {};
  // Rosh Hashana of hYear falls between Sep 5 and Oct 5 of Gregorian year hYear - 3761.
  let d = utcDate(hYear - 3761, 9, 1);
  let started = false;
  for (let i = 0; i < 420; i++, d = addDays(d, 1)) {
    const h = toHebrew(d);
    if (h.year < hYear) continue;
    if (h.year > hYear) break;
    started = true;
    if (!table[h.month]) table[h.month] = { start: d, length: 0 };
    table[h.month].length++;
  }
  if (!started) throw new Error(`Hebrew year ${hYear} not found`);
  yearCache.set(hYear, table);
  return table;
}

const MONTH_ORDER = ['tishri', 'heshvan', 'kislev', 'tevet', 'shevat', 'adar1', 'adar2', 'adar',
  'nisan', 'iyar', 'sivan', 'tamuz', 'av', 'elul'];

// Which month a Hebrew birthday falls on in a given Hebrew year (same rules as Hebcal).
function birthdayMonthIn(month, hYear) {
  const leap = isLeapYear(hYear);
  if (month === 'adar' && leap) return 'adar2';
  if ((month === 'adar1' || month === 'adar2') && !leap) return 'adar';
  return month;
}

// Gregorian date of a Hebrew birthday in Hebrew year hYear.
export function birthdayInYear(hBirth, hYear) {
  const table = monthTable(hYear);
  let month = birthdayMonthIn(hBirth.month, hYear);
  let day = hBirth.day;
  if (day > table[month].length) {
    // 30 Heshvan / 30 Kislev / 30 Adar I in a year where that month has 29 days → 1st of next month.
    const present = MONTH_ORDER.filter((m) => table[m]);
    month = present[present.indexOf(month) + 1];
    day = 1;
  }
  return addDays(table[month].start, day - 1);
}

// Hebrew birth date from a Gregorian birth date (born after sunset → next day).
export function hebrewBirthDate(year, month, day, afterSunset) {
  let d = utcDate(year, month, day);
  if (afterSunset) d = addDays(d, 1);
  return toHebrew(d);
}

// Next Hebrew birthday on or after `from`. Returns { date, hebrew, age }.
export function nextHebrewBirthday(hBirth, from = today()) {
  const hNow = toHebrew(from).year;
  for (const hYear of [hNow, hNow + 1]) {
    if (hYear <= hBirth.year) continue;
    const date = birthdayInYear(hBirth, hYear);
    if (date >= from) {
      return { date, hebrew: toHebrew(date), age: hYear - hBirth.year };
    }
  }
  return null;
}

const ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
const TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
const HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת'];

export function gematriya(n) {
  let s = '';
  let h = Math.floor(n / 100);
  while (h > 4) { s += 'ת'; h -= 4; }
  s += HUNDREDS[h];
  const rest = n % 100;
  if (rest === 15) s += 'טו';
  else if (rest === 16) s += 'טז';
  else s += TENS[Math.floor(rest / 10)] + ONES[rest % 10];
  if (s.length === 1) return s + '׳';
  return s.slice(0, -1) + '״' + s.slice(-1);
}

export function formatHebrew(h, withYear = true) {
  const base = `${gematriya(h.day)} ב${MONTH_NAMES_HE[h.month]}`;
  return withYear ? `${base} ${gematriya(h.year % 1000)}` : base;
}
