import { sleep } from 'k6';
import { hit, field, loginStaff, rampOptions, writeTarget, writeExpect } from './lib.js';

export const options = rampOptions();

export function setup() {
  return { token: loginStaff('ctdo').access };
}

export default function ({ token }) {
  const queue = hit('GET', '/applications/ctdo-queue/', '/applications/ctdo-queue/', { token });
  const appId = field(queue, '0.id') || 0;
  const docId = field(queue, '0.documents.0.id') || 0;

  // Flag then unflag the same document, so a MUTATE run leaves it as it found it.
  hit('POST', '/applications/flag-document/<doc_id>/', `/applications/flag-document/${writeTarget(docId)}/`, {
    token,
    body: { remarks: 'k6 load test flag' },
    expect: writeExpect(),
  });

  hit('POST', '/applications/unflag-document/<doc_id>/', `/applications/unflag-document/${writeTarget(docId)}/`, {
    token,
    body: {},
    expect: writeExpect(),
  });

  hit('POST', '/applications/<id>/ctdo-decision/', `/applications/${writeTarget(appId)}/ctdo-decision/`, {
    token,
    body: {},
    expect: writeExpect(),
  });

  hit('GET', '/applications/ctdo-history/', '/applications/ctdo-history/', { token });

  // Aggregated counts, recomputed from the transactional tables on every call.
  hit('GET', '/legal/ctdo-reports/', '/legal/ctdo-reports/', { token });

  sleep(1);
}
