'use client';

/**
 * Live device-frame preview. Mirrors drawDeviceFrameCanvas in
 * lib/editor/device-frames.ts (same constants, same colors), rendered with
 * Konva shapes. Rendered twice around the image: `behind` draws the chrome
 * under the screenshot (bezel bodies, title bar), `overlay` draws details that
 * sit on top of the image edge (notch, camera, home indicator).
 */
import React from 'react';
import { Rect, Circle, Line, Group, Text } from 'react-konva';
import type { DeviceFrame } from '@/types/editor';

type Props = {
  frame: DeviceFrame;
  frameUrl?: string;
  outerW: number;
  outerH: number;
  inner: { x: number; y: number; w: number; h: number };
  pass: 'behind' | 'overlay';
};

export default function DeviceFrameKonva({ frame, frameUrl, outerW, outerH, inner, pass }: Props) {
  if (frame === 'none') return null;

  const url = frameUrl?.trim() || 'snapty.pages.dev';

  if (frame === 'browser') {
    if (pass === 'behind') {
      const barH = inner.y;
      const dotY = barH / 2;
      const pillX = 80;
      const pillW = Math.max(120, outerW - pillX - 16);
      return (
        <Group listening={false}>
          <Rect x={0} y={0} width={outerW} height={barH} fill="#e5e7eb" />
          <Circle x={16} y={dotY} radius={6} fill="#ef4444" />
          <Circle x={36} y={dotY} radius={6} fill="#eab308" />
          <Circle x={56} y={dotY} radius={6} fill="#22c55e" />
          <Rect x={pillX} y={dotY - 12} width={pillW} height={24} fill="#ffffff" stroke="#d1d5db" strokeWidth={1} />
          <Text
            x={pillX}
            y={dotY - 8}
            width={pillW}
            align="center"
            text={url}
            fontSize={12}
            fill="#9ca3af"
            fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
            listening={false}
            perfectDrawEnabled={false}
          />
        </Group>
      );
    }
    return null;
  }

  if (frame === 'iphone' || frame === 'ipad' || frame === 'android') {
    const bezel = frame === 'iphone' ? 18 : frame === 'android' ? 18 : 16;
    const radius = frame === 'iphone' ? 34 : frame === 'android' ? 28 : 22;
    if (pass === 'behind') {
      return (
        <Group listening={false}>
          <Rect x={0} y={0} width={outerW} height={outerH} cornerRadius={radius} fill="#1a1a1a" />
          <Rect
            x={bezel / 2 - 0.5}
            y={bezel / 2 - 0.5}
            width={outerW - bezel + 1}
            height={outerH - bezel + 1}
            cornerRadius={Math.max(6, radius - bezel / 2)}
            stroke="rgba(255,255,255,0.18)"
            strokeWidth={1}
            fill="transparent"
          />
        </Group>
      );
    }
    if (frame === 'iphone') {
      const notchW = Math.min(outerW * 0.34, 140);
      return (
        <Group listening={false}>
          <Rect
            x={(outerW - notchW) / 2}
            y={inner.y - 26 + bezel}
            width={notchW}
            height={26}
            fill="#1a1a1a"
          />
        </Group>
      );
    }
    if (frame === 'android') {
      return (
        <Group listening={false}>
          <Circle x={outerW / 2} y={inner.y + 4} radius={6} fill="#000000" />
        </Group>
      );
    }
    return (
      <Group listening={false}>
        <Line
          points={[outerW / 2 - 30, inner.y + inner.h + bezel - 7, outerW / 2 + 30, inner.y + inner.h + bezel - 7]}
          stroke="rgba(255,255,255,0.5)"
          strokeWidth={3}
          lineCap="round"
        />
      </Group>
    );
  }

  // macbook
  if (pass === 'behind') {
    return (
      <Group listening={false}>
        <Rect x={0} y={0} width={outerW} height={inner.y} fill="#3a3a3a" />
        <Circle x={outerW / 2} y={inner.y / 2} radius={3} fill="#1a1a1a" />
        <Line
          points={[0, outerH - 12, outerW * 0.06, outerH, outerW * 0.94, outerH, outerW, outerH - 12]}
          closed
          fill="#c0c0c0"
          stroke="#c0c0c0"
          strokeWidth={1}
        />
        <Rect x={0} y={outerH - 12} width={outerW} height={2} fill="rgba(0,0,0,0.18)" />
      </Group>
    );
  }
  return (
    <Group listening={false}>
      <Rect
        x={2}
        y={inner.y - 1}
        width={outerW - 4}
        height={inner.h + 2}
        stroke="rgba(255,255,255,0.14)"
        strokeWidth={1}
        fill="transparent"
      />
    </Group>
  );
}
