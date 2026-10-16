export async function onRequest(context) {
  if (context.request.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed." }), {
      status: 405,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
    });
  }

  const api = context.env.API;
  if (!api) {
    return new Response(JSON.stringify({ success: false, error: "API service binding is not configured." }), {
      status: 500,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
    });
  }

  const response = await api.fetch(new Request("https://internal/api/upload-image", {
    method: "POST",
    headers: context.request.headers,
    body: context.request.body
  }));

  return new Response(response.body, {
    status: response.status,
    headers: response.headers
  });
}
