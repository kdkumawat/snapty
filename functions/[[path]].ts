export async function onRequest(context: any) {
  const { request, next, params } = context;
  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/import-url')) {
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'content-type': 'application/json' },
      });
    }

    try {
      const { url: targetUrl } = await request.json();
      if (!targetUrl || typeof targetUrl !== 'string') {
        return new Response(JSON.stringify({ error: 'URL is required' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }

      const parsedUrl = new URL(targetUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return new Response(JSON.stringify({ error: 'Invalid URL protocol' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }

      const response = await fetch(parsedUrl.toString(), {
        headers: { 'User-Agent': 'SnapKit/1.0' },
      });

      if (!response.ok) {
        return new Response(JSON.stringify({ error: `Failed to fetch image: ${response.status}` }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }

      const contentType = response.headers.get('content-type') || 'image/png';
      if (!contentType.startsWith('image/')) {
        return new Response(JSON.stringify({ error: 'URL does not point to an image' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }

      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const dataURL = `data:${contentType};base64,${base64}`;

      return new Response(JSON.stringify({ dataURL }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    } catch {
      return new Response(JSON.stringify({ error: 'Failed to import image' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }
  }

  return next();
}
