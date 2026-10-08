import * as React from 'react';

export type FormFactor = 'phone' | 'compact' | 'full';

/**
 * Excalidraw's layout tiers (packages/common/src/editorInterface.ts): phone up
 * to 599px wide (or a short landscape screen), the full styles panel from
 * 1440px, and a compact icon column in between.
 */
function read(): FormFactor {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w <= 599 || (h < 500 && w < 1000)) return 'phone';
  return w < 1440 ? 'compact' : 'full';
}

export function useFormFactor(): FormFactor {
  const [value, setValue] = React.useState<FormFactor>('full');
  React.useEffect(() => {
    const update = () => setValue(read());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return value;
}
