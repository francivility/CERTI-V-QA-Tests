import { sleep } from 'k6';
import { hit, field, loginStaff, rampOptions, writeTarget, writeExpect } from './lib.js';

export const options = rampOptions();

const SEARCH_TERMS = ['a', 'R5', '2026', 'transport', 'NC'];

export function setup() {
  return { token: loginStaff('receiving').access };
}

export default function ({ token }) {
  const queue = hit('GET', '/applications/receiving-queue/', '/applications/receiving-queue/', { token });
  const appId = field(queue, '0.id') || 0;
  const docId = field(queue, '0.documents.0.id') || 0;

  hit('GET', '/applications/<id>/detail/', `/applications/${appId}/detail/`, { token });

  hit('POST', '/applications/review-document/<doc_id>/', `/applications/review-document/${writeTarget(docId)}/`, {
    token,
    body: { review_status: 'good' },
    expect: writeExpect(),
  });

  hit('POST', '/applications/<id>/forward-to-ctdo/', `/applications/${writeTarget(appId)}/forward-to-ctdo/`, {
    token,
    body: {},
    expect: writeExpect(),
  });

  // An applicant-only action: a staff account has no applicant profile, so the
  // server must refuse it with 400 and leave the application untouched.
  hit('POST', '/applications/<id>/submit-for-review/', `/applications/${appId}/submit-for-review/`, {
    token,
    body: {},
    expect: [400],
  });

  hit('GET', '/applications/application-history/', '/applications/application-history/', { token });
  hit('GET', '/applications/reports/', '/applications/reports/', { token });

  // Substring search over case number, docket number and business name.
  const q = SEARCH_TERMS[(__VU + __ITER) % SEARCH_TERMS.length];
  hit('GET', '/applications/case-search/', `/applications/case-search/?q=${q}`, { token });

  sleep(1);
}
