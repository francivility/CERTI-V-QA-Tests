import http from 'k6/http';
import { check } from 'k6';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

// Every API route is mounted under /api (see backend/certiv_backend/urls.py).
export const API = `${BASE_URL}/api`;

export const APPLICANT = {
  username: __ENV.APPLICANT_USER || 'testapplicant',
  password: __ENV.APPLICANT_PASS || 'Testpass123!',
};

// One TMS account per staff role. Override with -e STAFF_<ROLE>_USER=... and -e STAFF_PASS=...
const STAFF_PASS = __ENV.STAFF_PASS || 'Testpass123';
export const STAFF = {
  receiving: { username: __ENV.STAFF_RECEIVING_USER || 'officer1', password: STAFF_PASS },
  ctdo: { username: __ENV.STAFF_CTDO_USER || 'ctdouser', password: STAFF_PASS },
  analyst: { username: __ENV.STAFF_ANALYST_USER || 'analyst1', password: STAFF_PASS },
  cashier: { username: __ENV.STAFF_CASHIER_USER || 'cashier1', password: STAFF_PASS },
  legal: { username: __ENV.STAFF_LEGAL_USER || 'legal1', password: STAFF_PASS },
  ord: { username: __ENV.STAFF_ORD_USER || 'orduser', password: STAFF_PASS },
  records: { username: __ENV.STAFF_RECORDS_USER || 'records1', password: STAFF_PASS },
};

// Staff workflow POSTs are one-way transitions on real applications (forward,
// decide, issue, pay, schedule, sign, release). By default they are aimed at
// id 0 so the route, auth and validation are exercised without moving any
// case through the pipeline. Run with -e MUTATE=1 to act on real queue items.
export const MUTATE = __ENV.MUTATE === '1';

export function writeTarget(id) {
  return MUTATE ? id || 0 : 0;
}

export function writeExpect(ok = [200]) {
  return MUTATE ? ok.concat([400]) : [400, 404];
}

// Shared ramp profile for the workflow scripts. Override with -e PEAK_VUS=50.
export function rampOptions(peak = Number(__ENV.PEAK_VUS) || 20) {
  return {
    stages: [
      { duration: '10s', target: Math.ceil(peak / 2) },
      { duration: '20s', target: peak },
      { duration: '5s', target: 0 },
    ],
    thresholds: {
      http_req_duration: ['p(95)<1500'],
      http_req_failed: ['rate<0.05'],
    },
  };
}

// Pulls the exception out of a Django debug page so a 500 is diagnosable from the k6 log.
function explain(res) {
  const body = typeof res.body === 'string' ? res.body : '';
  const title = body.match(/<title>\s*([^<]*?)\s+at\s/);
  const value = body.match(/<pre class="exception_value">([^<]*)/);
  if (title || value) {
    return `${title ? title[1] : 'Exception'}: ${value ? value[1].replace(/&quot;/g, '"') : ''}`;
  }
  return body.slice(0, 200).replace(/\s+/g, ' ');
}

const logged = {};

/**
 * One tagged request against the API.
 * `expect` lists the statuses that count as a pass; anything else fails the
 * check and counts toward http_req_failed. Pass `multipart: true` when `body`
 * is a form object containing http.file() parts, and `root: true` for the few
 * routes mounted outside /api.
 */
export function hit(method, name, path, { body = null, token = null, expect = [200], multipart = false, root = false } = {}) {
  const headers = {};
  if (body !== null && !multipart) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const label = `${method} ${name}`;
  const res = http.request(
    method,
    `${root ? BASE_URL : API}${path}`,
    body !== null && !multipart ? JSON.stringify(body) : body,
    { headers, tags: { name: label }, responseCallback: http.expectedStatuses(...expect) }
  );

  check(res, { [`${label} -> ${expect.join('|')}`]: (r) => expect.includes(r.status) });

  // Log each distinct failure once, from the first VU only, to keep the output readable.
  const key = `${label}:${res.status}`;
  if (!expect.includes(res.status) && __VU <= 1 && !logged[key]) {
    logged[key] = true;
    console.error(`${label} -> ${res.status} (${res.error || explain(res)})`);
  }
  return res;
}

// res.json() throws on non-JSON bodies (e.g. a Django debug page), so read fields defensively.
export function field(res, selector) {
  try {
    const value = res.json(selector);
    return value === undefined ? null : value;
  } catch (_) {
    return null;
  }
}

// Returns { access, refresh }, with both null when login fails.
export function loginApplicant() {
  const res = hit('POST', '/accounts/login/', '/accounts/login/', { body: APPLICANT });
  return { access: field(res, 'access'), refresh: field(res, 'refresh') };
}

// Same shape as loginApplicant, for a key of STAFF.
export function loginStaff(role) {
  const res = hit('POST', '/accounts/staff-login/', '/accounts/staff-login/', { body: STAFF[role] });
  return { access: field(res, 'access'), refresh: field(res, 'refresh') };
}

// Next Mon-Fri date at least `minDays` ahead, as YYYY-MM-DD (hearings cannot be same-day).
export function nextWeekday(minDays = 3) {
  const d = new Date(Date.now() + minDays * 86400000);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
