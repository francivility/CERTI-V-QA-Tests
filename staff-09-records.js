import { sleep } from 'k6';
import { hit, field, loginStaff, rampOptions, writeTarget, writeExpect } from './lib.js';

export const options = rampOptions();

// Renewal windows the Records Officer can ask for, in days.
const WINDOWS = [30, 60, 90, 180, 365];

export function setup() {
  return { token: loginStaff('records').access };
}

export default function ({ token }) {
  const queue = hit('GET', '/records/release-queue/', '/records/release-queue/', { token });
  const appId = field(queue, '0.id') || 0;

  hit('POST', '/records/release-cpc/<id>/', `/records/release-cpc/${writeTarget(appId)}/`, {
    token,
    body: { claim_method: 'soft_copy' },
    expect: writeExpect([200, 201]),
  });

  hit('GET', '/records/history/', '/records/history/', { token });

  // Date-range scan over certificate expiry dates.
  const days = WINDOWS[(__VU + __ITER) % WINDOWS.length];
  hit('GET', '/records/expiry-monitor/', `/records/expiry-monitor/?days=${days}`, { token });

  hit('GET', '/records/reports-summary/', '/records/reports-summary/', { token });

  sleep(1);
}
