import { sleep } from 'k6';
import { hit, field, loginApplicant, rampOptions } from './lib.js';

export const options = rampOptions();

export function setup() {
  return { token: loginApplicant().access };
}

export default function ({ token }) {
  const payments = hit('GET', '/payments/my-payments/', '/payments/my-payments/', { token });

  // Per-application reads use the applicant's first application; with none, id 0
  // keeps the route covered and the resulting 404 flags the missing seed data.
  const id = field(payments, '0.id') || 0;

  hit('GET', '/payments/my-bill/<id>/', `/payments/my-bill/${id}/`, { token });

  // 400 when the application is not awaiting payment.
  hit('POST', '/payments/<id>/choose-method/', `/payments/${id}/choose-method/`, {
    token,
    body: { method: 'online' },
    expect: [200, 400],
  });

  // Calls Xendit synchronously. 400 = not awaiting payment / no SOA, 502 = Xendit rejected or unconfigured.
  hit('POST', '/payments/<id>/xendit/checkout/', `/payments/${id}/xendit/checkout/`, {
    token,
    body: {},
    expect: [200, 400, 502],
  });

  hit('GET', '/payments/<id>/xendit/status/', `/payments/${id}/xendit/status/`, { token });

  // 404 until the cashier confirms the payment.
  hit('GET', '/payments/my-receipt/<id>/', `/payments/my-receipt/${id}/`, { token, expect: [200, 404] });

  hit('GET', '/applications/notifications/', '/applications/notifications/', { token });
  hit('POST', '/applications/notifications/read/', '/applications/notifications/read/', { token, body: {} });

  // 400 until the application is approved and released.
  hit('GET', '/records/my-cpc/<id>/', `/records/my-cpc/${id}/`, { token, expect: [200, 400] });
  hit('GET', '/records/my-cpc/<id>/document/', `/records/my-cpc/${id}/document/`, { token, expect: [200, 400, 404] });

  // 404 until a Notice of Hearing has been sent.
  hit('GET', '/legal/applicant-notice/<id>/', `/legal/applicant-notice/${id}/`, { token, expect: [200, 404] });

  sleep(1);
}
