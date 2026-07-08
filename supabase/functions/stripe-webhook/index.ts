import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function generateRandomPassword(length = 12): string {
  const chars =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function mapSubscriptionStatus(stripeStatus: string): 'active' | 'past_due' | 'canceled' {
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

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const perPage = 200;
  let page = 1;
  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    );
    if (match) return match.id;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function ensureAuthUser(email: string): Promise<string> {
  const password = generateRandomPassword(12);
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (!error && data.user) {
    return data.user.id;
  }

  if (error && (error.status === 422 || /already registered|already exists/i.test(error.message))) {
    const existingUserId = await findAuthUserIdByEmail(email);
    if (existingUserId) return existingUserId;
  }

  throw error ?? new Error(`Could not create or find auth user for ${email}`);
}

async function upsertProfileByEmail(params: {
  email: string;
  subscriptionStatus: 'active' | 'past_due' | 'canceled';
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
}) {
  const { email, subscriptionStatus, stripeCustomerId, stripeSubscriptionId } = params;

  const { data: existing, error: selectError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (selectError) throw selectError;

  if (existing) {
    const { error } = await supabaseAdmin
      .from('profiles')
      .update({
        subscription_status: subscriptionStatus,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
      })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabaseAdmin.from('profiles').insert({
      email,
      subscription_status: subscriptionStatus,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
    });
    if (error) throw error;
  }
}

async function updateSubscriptionStatusByCustomerId(
  stripeCustomerId: string,
  subscriptionStatus: 'active' | 'past_due' | 'canceled',
  stripeSubscriptionId?: string,
) {
  const updatePayload: Record<string, unknown> = { subscription_status: subscriptionStatus };
  if (stripeSubscriptionId) updatePayload.stripe_subscription_id = stripeSubscriptionId;

  const { error, count } = await supabaseAdmin
    .from('profiles')
    .update(updatePayload, { count: 'exact' })
    .eq('stripe_customer_id', stripeCustomerId);
  if (error) throw error;

  if (!count) {
    console.warn(`No profile found for stripe_customer_id=${stripeCustomerId}`);
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const email = session.customer_email ?? session.customer_details?.email ?? null;
  const stripeCustomerId = (session.customer as string) ?? null;
  const stripeSubscriptionId = (session.subscription as string) ?? null;

  if (!email || !stripeCustomerId) {
    console.error('checkout.session.completed missing email or customer id', session.id);
    return;
  }

  const existingUserId = await findAuthUserIdByEmail(email);
  if (!existingUserId) {
    await ensureAuthUser(email);
  }

  await upsertProfileByEmail({
    email,
    subscriptionStatus: 'active',
    stripeCustomerId,
    stripeSubscriptionId,
  });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const stripeCustomerId = subscription.customer as string;
  const status = mapSubscriptionStatus(subscription.status);
  await updateSubscriptionStatusByCustomerId(stripeCustomerId, status, subscription.id);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const signature = req.headers.get('stripe-signature');
  const body = await req.text();

  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      STRIPE_WEBHOOK_SECRET,
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    console.error('Webhook signature verification failed', err);
    return new Response(`Webhook signature verification failed: ${(err as Error).message}`, {
      status: 400,
    });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      }
      case 'customer.subscription.updated': {
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await updateSubscriptionStatusByCustomerId(
          subscription.customer as string,
          'canceled',
          subscription.id,
        );
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await updateSubscriptionStatusByCustomerId(invoice.customer as string, 'past_due');
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
