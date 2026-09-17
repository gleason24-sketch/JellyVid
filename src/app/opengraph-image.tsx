import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The link card. This is what a quote-tweet of the site shows, so it carries
 * the demo: the one selfie, and the promise in the largest type that fits.
 * Rendered at build time from the reel portrait.
 */
export const runtime = 'nodejs';
export const alt = 'JellyVid — put yourself in the movie';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpenGraphImage() {
  const [portrait, archivoBlack] = await Promise.all([
    readFile(join(process.cwd(), 'public', 'reel', 'portrait-og.jpg')),
    // A static TTF, because the OG renderer cannot use next/font's woff2 output.
    readFile(join(process.cwd(), 'src', 'app', 'fonts', 'ArchivoBlack-Regular.ttf')),
  ]);
  const portraitSrc = `data:image/jpeg;base64,${portrait.toString('base64')}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#000',
          color: '#fff',
          fontFamily: 'Archivo Black',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: -120,
            top: -260,
            width: 620,
            height: 620,
            borderRadius: 9999,
            background: 'rgba(255,43,214,0.30)',
            filter: 'blur(120px)',
          }}
        />

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '64px 0 64px 72px',
            width: 760,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 20,
              fontWeight: 800,
              letterSpacing: 5,
              color: '#9b9ba6',
            }}
          >
            <div style={{ width: 10, height: 10, borderRadius: 999, background: '#ff2bd6' }} />
            200 FREE CREDITS · NO SIGNUP
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              marginTop: 24,
              fontSize: 86,
              fontWeight: 400,
              lineHeight: 0.92,
              letterSpacing: -3,
            }}
          >
            <span>PUT YOURSELF</span>
            <span>IN THE</span>
            <span style={{ color: '#ff2bd6' }}>MOVIE.</span>
          </div>

          <div style={{ marginTop: 28, fontSize: 24, color: '#9b9ba6', lineHeight: 1.3, maxWidth: 620 }}>
            One selfie. One tap. A cinematic video of you in it.
          </div>

          <div
            style={{
              marginTop: 38,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              fontSize: 24,
              fontWeight: 800,
            }}
          >
            <span>jellyvid.netlify.app</span>
          </div>
        </div>

        {/* The selfie: what everything on the site was cast from. */}
        <div
          style={{
            position: 'absolute',
            right: 84,
            top: 70,
            width: 372,
            height: 496,
            display: 'flex',
            borderRadius: 26,
            overflow: 'hidden',
            transform: 'rotate(5deg)',
            boxShadow: '0 40px 90px rgba(0,0,0,0.85)',
            border: '3px solid #111',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={portraitSrc}
            alt=""
            width={372}
            height={496}
            style={{ objectFit: 'cover', width: '100%', height: '100%' }}
          />
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: 'Archivo Black', data: archivoBlack, weight: 400, style: 'normal' }],
    },
  );
}
