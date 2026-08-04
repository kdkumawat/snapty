import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { url } = await request.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: 'Invalid URL protocol' }, { status: 400 });
    }
    const response = await fetch(parsedUrl.toString(), {
      headers: { 'User-Agent': 'SnapKit/1.0' },
    });
    if (!response.ok) {
      return NextResponse.json({ error: `Failed to fetch image: ${response.status}` }, { status: 400 });
    }
    const contentType = response.headers.get('content-type') || 'image/png';
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'URL does not point to an image' }, { status: 400 });
    }
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const dataURL = `data:${contentType};base64,${base64}`;
    return NextResponse.json({ dataURL });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to import image' }, { status: 500 });
  }
}
