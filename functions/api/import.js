import { importFromUrl } from '../../server/core.mjs';

export async function onRequestGet({ request }) {
  const { status, body } = await importFromUrl(new URL(request.url).searchParams.get('url'));
  return Response.json(body, { status });
}
