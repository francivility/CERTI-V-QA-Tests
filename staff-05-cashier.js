import { sleep } from 'k6';
import { hit, field, loginStaff, rampOptions, writeTarget, writeExpect } from './lib.js';

export const options = rampOptions();

export function setup() {
  return { token: loginStaff('cashier').access };
}

export default function ({ token }) {
  const queue = hit('GET', '/payments/payment-queue/', '/payments/payment-queue/', { token });
  const queuedId = field(queue, '0.id') || 0;

  // With MUTATE every VU confirms the same queued payment at once, which is the
  // concurrent-cashier case; the server answers 200 for an already-paid one.
  hit('POST', '/payments/receive-payment/<id>/', `/payments/receive-payment/${writeTarget(queuedId)}/`, {
    token,
    body: { method: 'onsite', or_number: `K6-${__VU}-${__ITER}` },
    expect: writeExpect([200, 201]),
  });

  // Receipt reads use an already-paid application.
  const history = hit('GET', '/payments/payment-history/', '/payments/payment-history/', { token });
  const paidId = field(history, '0.id') || queuedId;

  hit('GET', '/payments/receipt/<id>/', `/payments/receipt/${paidId}/`, { token });

  // Builds the official receipt spreadsheet on every call.
  hit('GET', '/payments/receipt-document/<id>/', `/payments/receipt-document/${paidId}/`, { token });

  hit('POST', '/payments/receipt-update/<id>/', `/payments/receipt-update/${writeTarget(paidId)}/`, {
    token,
    body: { or_number: `K6-${__VU}-${__ITER}` },
    expect: writeExpect(),
  });

  hit('POST', '/payments/send-receipt/<id>/', `/payments/send-receipt/${writeTarget(paidId)}/`, {
    token,
    body: {},
    expect: writeExpect(),
  });

  hit('GET', '/payments/payment-reports/', '/payments/payment-reports/', { token });

  sleep(1);
}
