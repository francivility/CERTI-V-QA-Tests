import { sleep } from 'k6';
import { hit, loginApplicant } from './lib.js';

export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<1500'],
    http_req_failed: ['rate<0.05'],
  },
};

const ENDPOINTS = [
  '/accounts/account/',
  '/applications/mine/',
  '/applications/drafts/',
  '/applications/notifications/',
  '/payments/my-payments/',
  '/cpc-types/',
];

// Log in once so the 30s window measures the read routes, not password hashing.
export function setup() {
  return { token: loginApplicant().access };
}

export default function ({ token }) {
  for (const ep of ENDPOINTS) {
    hit('GET', ep, ep, { token });
    sleep(0.5);
  }
}
