import { recipeFromPhotos } from '../../server/core.mjs';

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  }
  const { status, body } = await recipeFromPhotos(payload.images, env.ANTHROPIC_API_KEY);
  return Response.json(body, { status });
}
