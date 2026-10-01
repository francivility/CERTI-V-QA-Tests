import { sleep } from 'k6';
import { hit, field, loginStaff, rampOptions, writeTarget, writeExpect } from './lib.js';

export const options = rampOptions();

export function setup() {
  return { token: loginStaff('analyst').access };
}

export default function ({ token }) {
  const queue = hit('GET', '/payments/assessment-queue/', '/payments/assessment-queue/', { token });
  const queuedId = field(queue, '0.id') || 0;

  const fees = hit('GET', '/payments/fees/', '/payments/fees/', { token });
  const feeId = field(fees, '0.id');

  hit('POST', '/payments/issue-soa/<id>/', `/payments/issue-soa/${writeTarget(queuedId)}/`, {
    token,
    body: { fee_ids: feeId ? [feeId] : [] },
    expect: writeExpect([200, 201]),
  });

  hit('POST', '/payments/forward-to-cashier/<id>/', `/payments/forward-to-cashier/${writeTarget(queuedId)}/`, {
    token,
    body: {},
    expect: writeExpect(),
  });

  // Reads of an issued SOA use an already-assessed application.
  const history = hit('GET', '/payments/assessment-history/', '/payments/assessment-history/', { token });
  const assessedId = field(history, '0.id') || queuedId;

  hit('GET', '/payments/soa/<id>/', `/payments/soa/${assessedId}/`, { token });

  // Builds the Payment Order Slip as DOCX and converts it to PDF on every call.
  hit('GET', '/payments/pos-document/<id>/', `/payments/pos-document/${assessedId}/`, { token });

  hit('POST', '/payments/send-pos/<id>/', `/payments/send-pos/${writeTarget(assessedId)}/`, {
    token,
    body: {},
    expect: writeExpect(),
  });

  hit('GET', '/payments/assessment-reports/', '/payments/assessment-reports/', { token });

  const overdue = hit('GET', '/payments/overdue-queue/', '/payments/overdue-queue/', { token });
  const overdueId = field(overdue, '0.id') || 0;

  hit('POST', '/payments/<id>/confirm-expire/', `/payments/${writeTarget(overdueId)}/confirm-expire/`, {
    token,
    body: {},
    expect: writeExpect(),
  });

  sleep(1);
}
