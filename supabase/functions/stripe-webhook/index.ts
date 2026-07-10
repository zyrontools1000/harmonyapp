const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')!;

const APP_REDIRECT_URL = 'https://my.harmonyapp.app/home.html';
const WEBHOOK_TOLERANCE_SECONDS = 300;

type SubscriptionStatus = 'active' | 'past_due' | 'canceled';

// ---------- Stripe webhook signature verification (Web Crypto, no SDK) ----------

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function verifyStripeSignature(payload: string, header: string, secret: string): Promise<boolean> {
  const timestampMatch = header.match(/t=(\d+)/);
  const signatures = [...header.matchAll(/v1=([0-9a-f]+)/g)].map((m) => m[1]);
  if (!timestampMatch || signatures.length === 0) return false;

  const timestamp = timestampMatch[1];
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > WEBHOOK_TOLERANCE_SECONDS) {
    console.error('Webhook timestamp outside tolerance', age);
    return false;
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signatureBytes = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  const expectedHex = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return signatures.some((sig) => timingSafeEqual(expectedHex, sig));
}

// ---------- Stripe REST API (fetch only, used when event payload lacks data) ----------

async function stripeGet(path: string): Promise<any> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
  });
  if (!res.ok) {
    throw new Error(`Stripe API GET ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

// ---------- Helpers ----------

function generateRandomPassword(length = 16): string {
  const chars =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function mapSubscriptionStatus(stripeStatus: string): SubscriptionStatus {
  switch (stripeStatus) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
    case 'incomplete':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
    case 'paused':
    default:
      return 'canceled';
  }
}

// ---------- Supabase Auth Admin (fetch only, no supabase-js) ----------

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const perPage = 200;
  let page = 1;
  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${perPage}`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (!res.ok) throw new Error(`listUsers failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    const users: any[] = data.users ?? [];
    const match = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (users.length < perPage) return null;
    page += 1;
  }
}

async function createAuthUser(email: string): Promise<string> {
  const password = generateRandomPassword(16);
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });

  if (res.ok) {
    const data = await res.json();
    return data.id;
  }

  const errorBody = await res.text();
  if (res.status === 422 || /already registered|already exists/i.test(errorBody)) {
    const existingUserId = await findAuthUserIdByEmail(email);
    if (existingUserId) return existingUserId;
  }
  throw new Error(`createAuthUser failed: ${res.status} ${errorBody}`);
}

async function ensureAuthUser(email: string): Promise<string> {
  const existingUserId = await findAuthUserIdByEmail(email);
  if (existingUserId) return existingUserId;
  return await createAuthUser(email);
}

async function generateMagicLink(email: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'magiclink',
      email,
      options: { redirect_to: APP_REDIRECT_URL },
    }),
  });
  if (!res.ok) {
    throw new Error(`generate_link failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const link = data.action_link ?? data.properties?.action_link;
  if (!link) throw new Error('generate_link response missing action_link');
  return link;
}

// ---------- Supabase profiles table via PostgREST (fetch only) ----------

async function upsertProfileByEmail(params: {
  email: string;
  subscriptionStatus: SubscriptionStatus;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
}) {
  const { email, subscriptionStatus, stripeCustomerId, stripeSubscriptionId } = params;

  const selectRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}&select=id`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );
  if (!selectRes.ok) {
    throw new Error(`profiles select failed: ${selectRes.status} ${await selectRes.text()}`);
  }
  const existing = await selectRes.json();

  if (existing.length > 0) {
    const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${existing[0].id}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        subscription_status: subscriptionStatus,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
      }),
    });
    if (!updateRes.ok) {
      throw new Error(`profiles update failed: ${updateRes.status} ${await updateRes.text()}`);
    }
  } else {
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        email,
        subscription_status: subscriptionStatus,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
      }),
    });
    if (!insertRes.ok) {
      throw new Error(`profiles insert failed: ${insertRes.status} ${await insertRes.text()}`);
    }
  }
}

async function updateSubscriptionStatusByCustomerId(
  stripeCustomerId: string,
  subscriptionStatus: SubscriptionStatus,
  stripeSubscriptionId?: string,
) {
  const updatePayload: Record<string, unknown> = { subscription_status: subscriptionStatus };
  if (stripeSubscriptionId) updatePayload.stripe_subscription_id = stripeSubscriptionId;

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?stripe_customer_id=eq.${encodeURIComponent(stripeCustomerId)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(updatePayload),
    },
  );
  if (!res.ok) {
    throw new Error(`profiles update-by-customer failed: ${res.status} ${await res.text()}`);
  }
  const updated = await res.json();
  if (!updated.length) {
    console.warn(`No profile found for stripe_customer_id=${stripeCustomerId}`);
  }
}

// ---------- Brevo welcome email ----------

function buildWelcomeEmailHtml(magicLink: string): string {
  const escapedLink = magicLink.replace(/"/g, '&quot;');
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#0D0618;font-family:Arial, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0D0618;padding:40px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#150B26;border-radius:16px;padding:32px;">
            <tr>
              <td style="color:#F5EEFF;font-size:22px;font-weight:bold;text-align:center;padding-bottom:16px;">
                Welcome to HarmonyApp &#10022;
              </td>
            </tr>
            <tr>
              <td style="color:#C9BDE0;font-size:15px;text-align:center;padding-bottom:24px;">
                Your access has been activated. Tap the button below to enter the app.
              </td>
            </tr>
            <tr>
              <td style="background-color:#3A0E12;border:1px solid #E5484D;border-radius:8px;padding:12px 16px;color:#FFB4B8;font-size:13px;text-align:center;">
                &#9888;&#65039; This link works for 24 hours only
              </td>
            </tr>
            <tr><td style="height:24px;"></td></tr>
            <tr>
              <td align="center">
                <a href="${escapedLink}" style="display:inline-block;background:linear-gradient(90deg,#F2C94C,#F2879C);color:#1A0B2E;font-weight:bold;font-size:15px;text-decoration:none;padding:14px 32px;border-radius:999px;">
                  TAP HERE TO ENTER THE APP
                </a>
              </td>
            </tr>
            <tr><td style="height:32px;"></td></tr>
            <tr>
              <td style="background-color:#2A1B0E;border:1px solid #F2C94C;border-radius:8px;padding:20px;">
                <div style="color:#F2C94C;font-weight:bold;font-size:14px;margin-bottom:12px;">Set a permanent password</div>
                <div style="color:#E8D9B0;font-size:13px;margin-bottom:8px;">Step 1: Go to my.harmonyapp.app</div>
                <div style="color:#E8D9B0;font-size:13px;margin-bottom:8px;">Step 2: Type your email and tap "Forgot password?"</div>
                <div style="color:#E8D9B0;font-size:13px;">Step 3: Check your email for a reset link</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendWelcomeEmail(email: string, magicLink: string) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': BREVO_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'HarmonyApp Team', email: 'support@harmonyapp.app' },
      to: [{ email }],
      subject: '✦ Your HarmonyApp access is ready',
      htmlContent: buildWelcomeEmailHtml(magicLink),
    }),
  });
  if (!res.ok) {
    throw new Error(`Brevo send failed: ${res.status} ${await res.text()}`);
  }
}

// ---------- Event handlers ----------

async function handleCheckoutCompleted(session: any) {
  let email = session.customer_email ?? session.customer_details?.email ?? null;
  let stripeCustomerId = session.customer ?? null;
  const stripeSubscriptionId = session.subscription ?? null;

  if ((!email || !stripeCustomerId) && session.id) {
    try {
      const fullSession = await stripeGet(`/checkout/sessions/${session.id}?expand[]=customer`);
      email =
        email ??
        fullSession.customer_details?.email ??
        fullSession.customer_email ??
        (typeof fullSession.customer === 'object' ? fullSession.customer?.email : null) ??
        null;
      stripeCustomerId =
        stripeCustomerId ??
        (typeof fullSession.customer === 'string' ? fullSession.customer : fullSession.customer?.id) ??
        null;
    } catch (err) {
      console.error('Failed to fetch full checkout session from Stripe', err);
    }
  }

  if (!email || !stripeCustomerId) {
    console.error('checkout.session.completed missing email or customer id', session.id);
    return;
  }

  await ensureAuthUser(email);
  await upsertProfileByEmail({
    email,
    subscriptionStatus: 'active',
    stripeCustomerId,
    stripeSubscriptionId,
  });

  try {
    const magicLink = await generateMagicLink(email);
    await sendWelcomeEmail(email, magicLink);
  } catch (err) {
    console.error('Failed to send welcome email', err);
  }
}

// ---------- HTTP entrypoint ----------

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const signature = req.headers.get('stripe-signature');
  const body = await req.text();

  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  const isValid = await verifyStripeSignature(body, signature, STRIPE_WEBHOOK_SECRET);
  if (!isValid) {
    console.error('Webhook signature verification failed');
    return new Response('Webhook signature verification failed', { status: 400 });
  }

  let event: { type: string; data: { object: any } };
  try {
    event = JSON.parse(body);
  } catch (err) {
    console.error('Invalid JSON payload', err);
    return new Response('Invalid JSON payload', { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        await handleCheckoutCompleted(event.data.object);
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        await updateSubscriptionStatusByCustomerId(
          subscription.customer,
          mapSubscriptionStatus(subscription.status),
          subscription.id,
        );
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await updateSubscriptionStatusByCustomerId(subscription.customer, 'canceled', subscription.id);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await updateSubscriptionStatusByCustomerId(invoice.customer, 'past_due');
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error(`Error handling event ${event.type}`, err);
    return new Response(`Error handling event: ${(err as Error).message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
