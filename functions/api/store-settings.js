export async function onRequest(context) {
  const { request, env } = context;
  const targetUrl = new URL(request.url);

  // Route through the configured Pages → Worker Service Binding while
  // preserving the Worker API pathname and incoming request details.
  targetUrl.protocol = "https:";
  targetUrl.hostname = "clothing-store-api";

  const init = {
    method: request.method,
    headers: new Headers(request.headers)
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  return env.API.fetch(new Request(targetUrl.toString(), init));
}
