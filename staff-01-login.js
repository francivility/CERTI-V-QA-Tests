import { sleep } from 'k6';
import { hit, loginStaff, rampOptions } from './lib.js';

export const options = rampOptions();

export default function () {
  // Login runs every iteration on purpose: it is the endpoint under load here.
  // The CTDO account is used because /accounts/esignature/ is CTDO/ORD only.
  const { access: token, refresh } = loginStaff('ctdo');

  // A fake credential is rejected: 400 when Google sign-in is unconfigured, 401
  // when it is. This endpoint is throttled to 5/hour per IP, hence 429.
  hit('POST', '/accounts/staff-google/', '/accounts/staff-google/', {
    body: { credential: 'k6-invalid-credential' },
    expect: [400, 401, 429],
  });

  hit('POST', '/accounts/token/refresh/', '/accounts/token/refresh/', { body: { refresh } });

  hit('GET', '/accounts/staff-account/', '/accounts/staff-account/', { token });

  hit('POST', '/accounts/staff-verify-email/', '/accounts/staff-verify-email/', {
    token,
    body: { credential: 'k6-invalid-credential' },
    expect: [400, 401],
  });

  // An address that matches no account: the server answers 200 without sending
  // mail. Throttled to 5/hour per IP, so most calls under load are 429.
  hit('POST', '/accounts/staff-password-reset/request/', '/accounts/staff-password-reset/request/', {
    body: { email: 'k6-nobody@example.com' },
    expect: [200, 429],
  });

  // An invalid reset link must be refused. Throttled to 10/hour per IP.
  hit('POST', '/accounts/staff-password-reset/confirm/', '/accounts/staff-password-reset/confirm/', {
    body: { uid: 'k6', token: 'k6-invalid', password: 'K6NewPass123!', confirm_password: 'K6NewPass123!' },
    expect: [400, 429],
  });

  // Signature metadata only; the image itself is served from /media/.
  hit('GET', '/accounts/esignature/', '/accounts/esignature/', { token });

  sleep(1);
}
