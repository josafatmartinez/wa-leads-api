import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

type BaseSendInput = {
  to: string;
  phoneNumberId: string;
  accessToken: string;
  version: string;
  text: string;
};

type Button = { id: string; title: string };

type ListRow = { id: string; title: string; description?: string };
type ListSection = { title: string; rows: ListRow[] };

function normalizeWhatsappRecipient(phone: string) {
  if (phone.startsWith('521') && phone.length > 3) {
    return `52${phone.slice(3)}`;
  }
  return phone;
}

async function postMessage(
  input: Pick<BaseSendInput, 'phoneNumberId' | 'accessToken' | 'version'>,
  payload: unknown,
): Promise<unknown> {
  const url = `https://graph.facebook.com/${encodeURIComponent(input.version)}/${encodeURIComponent(
    input.phoneNumberId,
  )}/messages`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) {
    logger.error({ status: res.status, body: text }, 'whatsapp send failed');
    throw new Error(`WhatsApp send failed: ${res.status}`);
  }

  try {
    return text ? (JSON.parse(text) as unknown) : {};
  } catch {
    return text;
  }
}

export async function sendText(input: BaseSendInput): Promise<unknown> {
  const normalizedTo = normalizeWhatsappRecipient(input.to);
  return postMessage(input, {
    messaging_product: 'whatsapp',
    to: normalizedTo,
    type: 'text',
    text: { body: input.text },
  });
}

export async function sendButtons(input: BaseSendInput & { buttons: Button[] }): Promise<unknown> {
  const normalizedTo = normalizeWhatsappRecipient(input.to);
  return postMessage(input, {
    messaging_product: 'whatsapp',
    to: normalizedTo,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: input.text },
      action: {
        buttons: input.buttons.map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: b.title },
        })),
      },
    },
  });
}

export async function sendList(
  input: BaseSendInput & { buttonText: string; sections: ListSection[] },
): Promise<unknown> {
  const normalizedTo = normalizeWhatsappRecipient(input.to);
  return postMessage(input, {
    messaging_product: 'whatsapp',
    to: normalizedTo,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: input.text },
      action: {
        button: input.buttonText,
        sections: input.sections.map((s) => ({
          title: s.title,
          rows: s.rows.map((r) => ({
            id: r.id,
            title: r.title,
            ...(r.description ? { description: r.description } : {}),
          })),
        })),
      },
    },
  });
}
