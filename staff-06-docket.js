import { sleep } from 'k6';
import { hit, field, loginStaff, rampOptions, writeTarget, writeExpect } from './lib.js';

export const options = rampOptions();

export function setup() {
  return { token: loginStaff('analyst').access };
}

export default function ({ token }) {
  const queue = hit('GET', '/payments/paid-queue/', '/payments/paid-queue/', { token });
  const appId = field(queue, '0.id') || 0;

  // Assigns the next Docket Number and forwards the case to Legal.
  hit('POST', '/payments/generate-docket/<id>/', `/payments/generate-docket/${writeTarget(appId)}/`, {
    token,
    body: {},
    expect: writeExpect(),
  });

  sleep(1);
}
