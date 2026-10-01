import http from 'k6/http';
import { sleep } from 'k6';
import { hit, field, loginApplicant, rampOptions } from './lib.js';

export const options = rampOptions();

const SAMPLE_IMAGE = open('./fixtures/sample-document.jpg', 'b');

export function setup() {
  return { token: loginApplicant().access };
}

export default function ({ token }) {
  // Create a verification session (this is what generates the QR code)
  const session = hit('POST', '/verification/session/', '/verification/session/', { token, body: {} });
  const code = field(session, 'code') || 'NOCODE';

  // Poll session status — simulates the laptop waiting for the phone
  for (let i = 0; i < 3; i++) {
    hit('GET', '/verification/session/<code>/', `/verification/session/${code}/`, { token });
  }

  // Phone submits selfie frames + ID photo. The fixture has no face, so the
  // server is expected to answer 200 with status "failed", never verifying anyone.
  hit('POST', '/verification/submit/<code>/', `/verification/submit/${code}/`, {
    multipart: true,
    body: {
      frame: http.file(SAMPLE_IMAGE, 'frame.jpg', 'image/jpeg'),
      id_image: http.file(SAMPLE_IMAGE, 'id.jpg', 'image/jpeg'),
      id_type: 'drivers_license',
      blink_count: '2',
    },
  });

  // QR bridge for documents: the bridge code is chosen by the laptop, no login needed.
  const bridge = `k6-${__VU}-${__ITER}-${Date.now()}`;

  hit('POST', '/applications/qr-bridge/upload/<code>/', `/applications/qr-bridge/upload/${bridge}/`, {
    multipart: true,
    body: { image: http.file(SAMPLE_IMAGE, 'capture.jpg', 'image/jpeg') },
  });

  // Laptop polling for phone-uploaded images
  let uploadId = 0;
  for (let i = 0; i < 3; i++) {
    const pending = hit('GET', '/applications/qr-bridge/pending/<code>/', `/applications/qr-bridge/pending/${bridge}/`);
    uploadId = field(pending, '0.id') || uploadId;
  }

  hit('GET', '/applications/qr-bridge/download/<id>/', `/applications/qr-bridge/download/${uploadId}/`);

  // Consuming removes the pending row, so the run cleans up after itself.
  hit('POST', '/applications/qr-bridge/consume/<id>/', `/applications/qr-bridge/consume/${uploadId}/`, { body: {} });

  sleep(1);
}
