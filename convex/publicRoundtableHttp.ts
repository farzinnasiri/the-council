import { httpAction } from './_generated/server';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'X-Robots-Tag': 'noindex, nofollow',
  };
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(),
      ...(init?.headers ?? {}),
    },
  });
}

function readSlugFromRequest(request: Request) {
  const url = new URL(request.url);
  const prefix = '/public/roundtables/';
  if (!url.pathname.startsWith(prefix)) return null;
  const rawSlug = url.pathname.slice(prefix.length).trim();
  if (!rawSlug) return null;
  return decodeURIComponent(rawSlug);
}

export const optionsPublicRoundtable = httpAction(async () => {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  });
});

export const getPublicRoundtable = httpAction(async (ctx, request) => {
  const slug = readSlugFromRequest(request);
  if (!slug) {
    return jsonResponse({ error: 'Not found' }, { status: 404 });
  }

  const payload = await ctx.runQuery('publicRoundtables:getPublicationPayloadBySlug' as any, {
    slug,
  });
  if (!payload) {
    return jsonResponse({ error: 'Not found' }, { status: 404 });
  }

  return jsonResponse(payload, { status: 200 });
});
