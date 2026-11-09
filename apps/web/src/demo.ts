import { useEffect, useState } from 'react';
import { api, type DemoInfo } from './api.ts';

// Asked once per page load: whether this server is the public demo, and what it offers.
let info: Promise<DemoInfo> | null = null;

export function useDemo(): DemoInfo | null {
  const [demo, setDemo] = useState<DemoInfo | null>(null);
  useEffect(() => {
    info ??= api.demo().catch((): DemoInfo => ({ demo: false }));
    void info.then(setDemo);
  }, []);
  return demo;
}
