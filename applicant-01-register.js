import { sleep } from 'k6';
import { hit, field, rampOptions } from './lib.js';

export const options = rampOptions();

export default function () {
  const unique = `${__VU}_${__ITER}_${Date.now()}`;
  const username = `k6reg_${unique}`;
  const email = `k6reg_${unique}@example.com`;

  // Stages the registration: two password hashes and a verification email per call.
  const step1 = hit('POST', '/accounts/register/step1/', '/accounts/register/step1/', {
    body: { username, email, password: 'Testpass123!', account_type: 'personal' },
    expect: [201],
  });
  const token = field(step1, 'access');
  const code = field(step1, 'code') || 'NOCODE';

  // The real code only exists in the email, so a wrong one must be rejected.
  hit('POST', '/accounts/register/verify-email/', '/accounts/register/verify-email/', {
    token,
    body: { code: '000000' },
    expect: [400],
  });

  // Inside the 60s resend cooldown the server answers 429.
  hit('POST', '/accounts/register/resend-email/', '/accounts/register/resend-email/', {
    token,
    body: {},
    expect: [200, 429],
  });

  // Step 2 is gated on a verified email, so an unverified registration gets 403.
  hit('POST', '/accounts/register/step2/', '/accounts/register/step2/', {
    token,
    body: {
      business_name: 'K6 Load Test',
      mobile_number: '09171234567',
      tin: '123456789',
      date_of_birth: '1990-01-01',
      address: 'Legazpi City, Albay',
    },
    expect: [403],
  });

  hit('GET', '/accounts/register/state/', '/accounts/register/state/', { token });

  // Laptop-side polling for the phone verification result.
  for (let i = 0; i < 3; i++) {
    hit('GET', '/accounts/register/verify/status/<code>/', `/accounts/register/verify/status/${code}/`, { token });
  }

  // Discards the staged registration so the run leaves no rows behind.
  hit('POST', '/accounts/register/abandon/', '/accounts/register/abandon/', {
    token,
    body: {},
    expect: [204],
  });

  sleep(1);
}
