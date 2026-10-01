import { sleep } from 'k6';
import { STAFF, hit, field, loginStaff, rampOptions, writeTarget, writeExpect } from './lib.js';

export const options = rampOptions();

export function setup() {
  return { ctdo: loginStaff('ctdo').access, ord: loginStaff('ord').access };
}

export default function ({ ctdo, ord }) {
  // CTDO endorsement
  const endorsements = hit('GET', '/legal/ctdo-endorsement-queue/', '/legal/ctdo-endorsement-queue/', { token: ctdo });
  const endorseId = field(endorsements, '0.id') || 0;

  hit('GET', '/legal/decision-for-endorsement/<id>/', `/legal/decision-for-endorsement/${endorseId}/`, { token: ctdo });

  // Stamps the stored signature image into the Decision DOCX and converts it to PDF.
  hit('POST', '/legal/attach-ctdo-signature/<id>/', `/legal/attach-ctdo-signature/${writeTarget(endorseId)}/`, {
    token: ctdo,
    body: { password: STAFF.ctdo.password },
    expect: writeExpect(),
  });

  hit('POST', '/legal/endorse-decision/<id>/', `/legal/endorse-decision/${writeTarget(endorseId)}/`, {
    token: ctdo,
    body: {},
    expect: writeExpect(),
  });

  // ORD approval
  const approvals = hit('GET', '/legal/ord-queue/', '/legal/ord-queue/', { token: ord });
  const approveId = field(approvals, '0.id') || 0;

  hit('GET', '/legal/decision-for-approval/<id>/', `/legal/decision-for-approval/${approveId}/`, { token: ord });

  hit('POST', '/legal/attach-ord-signature/<id>/', `/legal/attach-ord-signature/${writeTarget(approveId)}/`, {
    token: ord,
    body: { password: STAFF.ord.password },
    expect: writeExpect(),
  });

  hit('POST', '/legal/approve-decision/<id>/', `/legal/approve-decision/${writeTarget(approveId)}/`, {
    token: ord,
    body: {},
    expect: writeExpect(),
  });

  hit('GET', '/legal/ord-reports/', '/legal/ord-reports/', { token: ord });
  hit('GET', '/legal/ord-history/', '/legal/ord-history/', { token: ord });
  hit('GET', '/legal/ord-schedule/', '/legal/ord-schedule/', { token: ord });

  sleep(1);
}
