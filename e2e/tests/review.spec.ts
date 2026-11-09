import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const golden = join(import.meta.dirname, '../../data/golden');

/** Uploads a golden-set page from the queue and waits for its review screen. */
async function upload(page: Page, id: string): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Upload invoice image').setInputFiles(join(golden, id, 'page.jpg'));
  await expect(page).toHaveURL(/\/documents\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { name: 'page.jpg' })).toBeVisible();
}

const findings = (page: Page) => page.getByRole('list', { name: 'Findings' });

test('an injected bank change is flagged, and approving it needs a written reason', async ({
  page,
}) => {
  await upload(page, 'doc-062');

  await expect(findings(page)).toContainText('Suspicious instructions in the document');
  await expect(findings(page)).toContainText('announces changed bank details');
  await expect(page.getByText('Notice: our bank details have changed.')).toBeVisible();
  // The model returned the IBAN from the payment details, not the one in the notice.
  await expect(page.getByText('FR76 3000 6000 0112 3456 7890 189')).toBeVisible();

  const approve = page.getByRole('button', { name: 'Approve' });
  await expect(approve).toBeDisabled();
  await page.getByLabel(/^Note/).fill('Called the vendor on file: bank details unchanged');
  await approve.click();

  await expect(page.getByRole('region', { name: 'Decision' })).toContainText(
    'Approved by e2e-reviewer',
  );
  await expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'History' })).toContainText(
    'e2e-reviewer approved — “Called the vendor on file: bank details unchanged”',
  );

  await page.getByRole('link', { name: '← Queue' }).click();
  const row = page.getByRole('row').filter({ hasText: 'Atelier Lumière SARL' }).first();
  await expect(row).toContainText('Approved');
});

test('correcting a wrong total clears the flag and keeps what the model extracted', async ({
  page,
}) => {
  await upload(page, 'doc-045');
  await expect(findings(page)).toContainText('51.65 + 4.26 tax = 55.91, total is 40.15');

  await page.getByRole('button', { name: 'Edit Total' }).click();
  await page.getByLabel('Total', { exact: true }).fill('55.91');
  await page.keyboard.press('Enter');

  await expect(page.getByText('All checks passed.')).toBeVisible();
  await expect(page.getByText('extracted: US$40.15')).toBeVisible();
  await expect(page.getByRole('region', { name: 'History' })).toContainText(
    'changed total from US$40.15 to US$55.91',
  );

  // Nothing is flagged any more, so no note is needed.
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByRole('region', { name: 'Decision' })).toContainText(
    'Approved by e2e-reviewer',
  );
});

test('an ambiguous amount is refused instead of guessed', async ({ page }) => {
  await upload(page, 'doc-045');
  await page.getByRole('button', { name: 'Edit Total' }).click();
  await page.getByLabel('Total', { exact: true }).fill('40.1555.91');
  await page.keyboard.press('Enter');

  await expect(page.getByRole('alert')).toHaveText('Enter an amount, e.g. 1,234.56');
  await expect(page.getByRole('region', { name: 'History' })).not.toContainText('changed');
});

test('rejecting needs a reason and locks the document', async ({ page }) => {
  await upload(page, 'doc-057');
  await expect(findings(page)).toContainText('IBAN differs from vendor master data');

  const reject = page.getByRole('button', { name: 'Reject' });
  await expect(reject).toBeDisabled();
  await page.getByLabel(/^Note/).fill('IBAN does not match our records');
  await reject.click();

  await expect(page.getByRole('region', { name: 'Decision' })).toContainText(
    'Rejected by e2e-reviewer',
  );
  await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
});
