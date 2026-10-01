import http from 'k6/http';
import { sleep } from 'k6';
import { hit, field, loginApplicant, rampOptions } from './lib.js';

export const options = rampOptions();

const SAMPLE_IMAGE = open('./fixtures/sample-document.jpg', 'b');

export function setup() {
  return { token: loginApplicant().access };
}

export default function ({ token }) {
  // Reference data dropdowns
  const cpcTypes = hit('GET', '/cpc-types/', '/cpc-types/');
  const cpcId = field(cpcTypes, '0.id') || 0;

  const reqTypes = hit('GET', '/requirement-types/', `/requirement-types/?cpc_type=${cpcId}`);
  const requirementId = field(reqTypes, '0.id') || 0;

  // /routes/ requires ?cpc_type and answers 400 without it.
  const routes = hit('GET', '/routes/', `/routes/?cpc_type=${cpcId}`);
  const routeId = field(routes, '0.id');

  const propTypes = hit('GET', '/proprietorship-types/', '/proprietorship-types/');
  const proprietorshipId = field(propTypes, '0.id');

  // Draft lifecycle
  const draft = hit('POST', '/applications/drafts/create/', '/applications/drafts/create/', {
    token,
    body: { cpc_type: cpcId, route: routeId, proprietorship_type: proprietorshipId },
    expect: [201],
  });
  const draftId = field(draft, 'id') || 0;

  hit('GET', '/applications/drafts/', '/applications/drafts/', { token });

  // The fixture is not a real requirement document, so content validation may
  // reject it with 400; that is still a handled response, not a failure.
  const upload = hit('POST', '/applications/drafts/<id>/documents/', `/applications/drafts/${draftId}/documents/`, {
    token,
    multipart: true,
    body: {
      requirement_type: String(requirementId),
      file: http.file(SAMPLE_IMAGE, 'requirement.jpg', 'image/jpeg'),
    },
    expect: [200, 201, 400],
  });
  const documentId = field(upload, 'id');

  if (documentId) {
    hit('DELETE', '/applications/drafts/<id>/documents/<doc_id>/', `/applications/drafts/${draftId}/documents/${documentId}/`, { token });
  }

  // The draft is incomplete, so finalize must refuse it with 400 rather than create an application.
  hit('POST', '/applications/drafts/<id>/finalize/', `/applications/drafts/${draftId}/finalize/`, {
    token,
    body: {},
    expect: [400],
  });

  // Cleanup only: discard the draft so the run leaves no rows behind.
  if (draftId) {
    hit('DELETE', '/applications/drafts/<id>/delete/', `/applications/drafts/${draftId}/delete/`, { token });
  }

  // Applicant's own applications
  const mine = hit('GET', '/applications/mine/', '/applications/mine/', { token });
  const appId = field(mine, '0.id');

  if (appId) {
    hit('GET', '/applications/mine/<id>/', `/applications/mine/${appId}/`, { token });
    hit('GET', '/applications/<id>/documents/', `/applications/${appId}/documents/`, { token });
  }

  // resubmit resets ANY application to pending_receiving with no ownership or
  // state check, so by default it targets id 0 (expects 404) to avoid rewinding
  // a real application. Set -e RESUBMIT_APP_ID=<id> to exercise the real path.
  const resubmitId = __ENV.RESUBMIT_APP_ID || 0;
  hit('POST', '/applications/<id>/resubmit/', `/applications/${resubmitId}/resubmit/`, {
    token,
    body: {},
    expect: __ENV.RESUBMIT_APP_ID ? [200, 400] : [404],
  });

  // Petition and operator sheet: the form is a GET, the generated DOCX is a POST.
  hit('GET', '/applications/petition-form/<cpc_id>/', `/applications/petition-form/${cpcId}/`, { token });
  hit('POST', '/applications/petition-document/<cpc_id>/', `/applications/petition-document/${cpcId}/`, {
    token,
    body: { values: {} },
  });
  hit('GET', '/applications/operator-sheet-form/', '/applications/operator-sheet-form/', { token });
  hit('POST', '/applications/operator-sheet-document/', '/applications/operator-sheet-document/', {
    token,
    body: { blank: true },
  });

  sleep(1);
}
