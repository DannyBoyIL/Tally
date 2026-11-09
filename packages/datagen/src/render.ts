import { chromium } from 'playwright';
import { renderHtml, viewportWidth } from './layouts.ts';
import type { PrintSpec } from './spec.ts';

export interface RenderJob {
  spec: PrintSpec;
  path: string;
}

/** Screenshots each document as a JPEG: the image the extractor will see. */
export async function renderImages(jobs: RenderJob[]): Promise<void> {
  const browser = await chromium.launch();
  try {
    // 1.5x keeps small print legible without producing oversized images.
    const page = await browser.newPage({ deviceScaleFactor: 1.5 });
    for (const { spec, path } of jobs) {
      // A short viewport lets fullPage crop to the content (receipts are shorter than any default).
      await page.setViewportSize({ width: viewportWidth(spec), height: 100 });
      await page.setContent(renderHtml(spec), { waitUntil: 'load' });
      await page.screenshot({ path, fullPage: true, type: 'jpeg', quality: 85 });
    }
  } finally {
    await browser.close();
  }
}
