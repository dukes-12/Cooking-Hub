export const onRequestGet = ({ env }) => Response.json({ ok: true, photo: !!env.ANTHROPIC_API_KEY });
