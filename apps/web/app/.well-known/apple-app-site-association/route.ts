export const dynamic = "force-dynamic";

export function GET() {
  const appId = process.env.APPLE_APP_ID;
  if (!appId || !/^[A-Z0-9]{10}\.com\.domusbase\.app$/.test(appId)) {
    console.error("aasa_app_id_missing");
    return new Response(null, { status: 404 });
  }
  return Response.json({ applinks: { details: [{ appIDs: [appId], components: [
    { "/": "/owner/bank/oauth-app", comment: "Plaid OAuth return" }
  ] }] } }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
