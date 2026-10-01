import http from 'k6/http';
import { sleep } from 'k6';
import { hit, field, loginStaff, nextWeekday, rampOptions, writeTarget, writeExpect } from './lib.js';

export const options = rampOptions();

const SAMPLE_IMAGE = open('./fixtures/sample-document.jpg', 'b');

// 15-minute hearing slots between 08:00 and 16:45.
function slotFor(n) {
  const minutes = (n % 36) * 15;
  const hh = String(8 + Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function setup() {
  return { token: loginStaff('legal').access };
}

export default function ({ token }) {
  const date = nextWeekday();
  const [year, month] = date.split('-');

  // Scheduling
  const queue = hit('GET', '/legal/queue/', '/legal/queue/', { token });
  const appId = field(queue, '0.id') || 0;

  hit('GET', '/legal/hearing-slots/', `/legal/hearing-slots/?year=${year}&month=${Number(month)}`, { token });
  hit('GET', '/legal/available-slots/', `/legal/available-slots/?date=${date}`, { token });

  // Every VU asks for and then books a slot on the same day, so slots collide.
  const time = slotFor(__VU + __ITER);
  hit('GET', '/legal/check-availability/', `/legal/check-availability/?date=${date}&time=${time}`, { token });

  hit('POST', '/legal/schedule-hearing/<id>/', `/legal/schedule-hearing/${writeTarget(appId)}/`, {
    token,
    body: { hearing_date: date, hearing_time: time },
    expect: writeExpect([200, 201]),
  });

  // Notice of Hearing
  hit('GET', '/legal/notice/<id>/', `/legal/notice/${appId}/`, { token });
  hit('GET', '/legal/notice-signature-status/<id>/', `/legal/notice-signature-status/${appId}/`, { token });

  hit('POST', '/legal/forward-notice/<id>/', `/legal/forward-notice/${writeTarget(appId)}/`, {
    token,
    body: { hearing_officer: 'K6 Hearing Officer' },
    expect: writeExpect(),
  });

  // A wrong password must be refused.
  hit('POST', '/legal/verify-password/', '/legal/verify-password/', {
    token,
    body: { password: 'k6-wrong-password-0' },
    expect: [400],
  });

  hit('POST', '/legal/send-notice/<id>/', `/legal/send-notice/${writeTarget(appId)}/`, {
    token,
    body: {},
    expect: writeExpect(),
  });

  // Previews render DOCX -> PDF without saving anything. 400 while the hearing
  // or the Hearing Officer signature is still missing.
  hit('POST', '/legal/preview-notice/<id>/', `/legal/preview-notice/${appId}/`, {
    token,
    body: {},
    expect: [200, 400],
  });

  hit('GET', '/legal/notice-document/<id>/', `/legal/notice-document/${appId}/`, { token, expect: [200, 404] });

  // Decision / Order
  const decisions = hit('GET', '/legal/decision-queue/', '/legal/decision-queue/', { token });
  const decisionId = field(decisions, '0.id') || 0;

  hit('GET', '/legal/decision/<id>/', `/legal/decision/${decisionId}/`, { token });

  hit('POST', '/legal/draft-decision/<id>/', `/legal/draft-decision/${writeTarget(decisionId)}/`, {
    token,
    body: { decision_type: 'approved' },
    expect: writeExpect([200, 201]),
  });

  hit('POST', '/legal/preview-decision/<id>/', `/legal/preview-decision/${decisionId}/`, {
    token,
    body: {},
    expect: [200, 400],
  });

  hit('GET', '/legal/decision-document/<id>/', `/legal/decision-document/${decisionId}/`, { token, expect: [200, 404] });

  hit('POST', '/legal/forward-to-ctdo/<id>/', `/legal/forward-to-ctdo/${writeTarget(decisionId)}/`, {
    token,
    body: {},
    expect: writeExpect(),
  });

  // Listings
  hit('GET', '/legal/history/', '/legal/history/', { token });
  hit('GET', '/legal/schedule/', '/legal/schedule/', { token });
  hit('GET', '/legal/reports/', '/legal/reports/', { token });

  // Hearing Officer signature upload, mounted outside /api. The token is always
  // invalid here: a real one would stamp this fixture onto an official notice.
  hit('POST', '/sign/<token>/upload/', '/sign/k6-invalid-token/upload/', {
    root: true,
    multipart: true,
    body: { signature: http.file(SAMPLE_IMAGE, 'signature.png', 'image/png') },
    expect: [404],
  });

  sleep(1);
}
