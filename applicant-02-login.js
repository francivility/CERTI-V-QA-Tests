import { sleep } from 'k6';
import { APPLICANT, hit, field, loginApplicant, rampOptions } from './lib.js';

export const options = rampOptions();

// Deliberately wrong, so the password-gated endpoints below reject the request.
const WRONG_PASSWORD = 'k6-wrong-password-0';

export default function () {
  // Login runs every iteration on purpose: it is the endpoint under load here.
  const { access: token, refresh } = loginApplicant();

  hit('GET', '/accounts/account/', '/accounts/account/', { token });
  hit('GET', '/accounts/notification-preferences/', '/accounts/notification-preferences/', { token });

  // Re-submitting the current username is a server-side no-op, so it never burns the 14-day cooldown.
  hit('POST', '/accounts/change-username/', '/accounts/change-username/', {
    token,
    body: { new_username: APPLICANT.username, password: APPLICANT.password },
  });

  // change-password and delete-account are sent with a wrong password: every VU
  // shares one test account, so a successful call would lock out or delete it
  // mid-run. The request still exercises auth and the password hash check.
  hit('POST', '/accounts/change-password/', '/accounts/change-password/', {
    token,
    body: { current_password: WRONG_PASSWORD, new_password: 'K6NewPass123!' },
    expect: [400],
  });

  const refreshed = hit('POST', '/accounts/token/refresh/', '/accounts/token/refresh/', {
    body: { refresh },
  });

  hit('POST', '/accounts/delete-account/', '/accounts/delete-account/', {
    token: field(refreshed, 'access') || token,
    body: { password: WRONG_PASSWORD, reason: 'k6 load test' },
    expect: [400],
  });

  // A fake credential is rejected: 400 when Google sign-in is unconfigured, 401 when it is.
  hit('POST', '/accounts/google/', '/accounts/google/', {
    body: { credential: 'k6-invalid-credential' },
    expect: [400, 401],
  });

  sleep(1);
}
