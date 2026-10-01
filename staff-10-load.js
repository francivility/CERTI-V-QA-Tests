import { sleep } from 'k6';
import { hit, loginStaff } from './lib.js';

export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<1500'],
    http_req_failed: ['rate<0.05'],
  },
};

// Each staff role and the queue its dashboard opens on.
const DASHBOARDS = [
  ['receiving', '/applications/receiving-queue/'],
  ['ctdo', '/applications/ctdo-queue/'],
  ['analyst', '/payments/assessment-queue/'],
  ['cashier', '/payments/payment-queue/'],
  ['legal', '/legal/queue/'],
  ['ord', '/legal/ord-queue/'],
  ['records', '/records/release-queue/'],
];

export default function () {
  // Login runs every iteration on purpose: concurrent sign-ins are the load here.
  const [role, queue] = DASHBOARDS[(__VU - 1) % DASHBOARDS.length];
  const { access: token } = loginStaff(role);

  // The dashboard re-fetches its queue while it stays open.
  for (let i = 0; i < 3; i++) {
    hit('GET', queue, queue, { token });
    sleep(0.5);
  }
}
