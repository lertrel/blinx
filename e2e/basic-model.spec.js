const { test, expect } = require('@playwright/test');

test.describe('demo/basic-model/basic-model.html', () => {
  test('Form + Table controls work end-to-end', async ({ page }) => {
    await page.goto('/demo/basic-model/basic-model.html');

    // Smoke: page loads and base UI is present.
    await expect(page.getByRole('heading', { name: /Blinx: Model/i })).toBeVisible();
    await expect(page.locator('#form-container')).toBeVisible();
    await expect(page.locator('#table-container')).toBeVisible();

    // Helpers to reach generated fields (label + input inside a wrapper).
    const fieldInput = (fieldKey) =>
      page.locator('#form-container label', { hasText: fieldKey }).locator('..').locator('input, textarea, select');

    const recordIndicator = page.locator('#record-indicator');
    const saveStatus = page.locator('#save-status');
    const tblStatus = page.locator('#tbl-status');

    // Form: initial record indicator.
    await expect(recordIndicator).toHaveText('Record 1 of 3');

    // Form: Next / Previous.
    await page.locator('#btn-next').click();
    await expect(recordIndicator).toHaveText('Record 2 of 3');
    await page.locator('#btn-prev').click();
    await expect(recordIndicator).toHaveText('Record 1 of 3');
    await page.locator('#btn-prev').click();
    await expect(saveStatus).toHaveText('Already at first record.');

    // Form: Save with no changes.
    await page.locator('#btn-save').click();
    await expect(saveStatus).toHaveText('No changes to save.');

    // Form: change a field, then reset should restore it.
    const nameInput = fieldInput('name');
    await expect(nameInput).toHaveValue('Alpha Chair');
    await nameInput.fill('Alpha Chair (edited)');
    await page.locator('#btn-reset').click();
    await expect(saveStatus).toHaveText('Reset done.');
    await expect(nameInput).toHaveValue('Alpha Chair');

    // Form: Create then Delete should adjust record count.
    await page.locator('#btn-create').click();
    await expect(saveStatus).toHaveText('New record created.');
    await expect(recordIndicator).toHaveText('Record 4 of 4');
    await page.locator('#btn-delete').click();
    await expect(saveStatus).toHaveText('Record deleted.');
    await expect(recordIndicator).toHaveText('Record 3 of 3');
    await expect(tblStatus).toHaveText('Rows removed elsewhere; refreshed table.');

    // Table: should render rows/cols and allow selection + delete-selected.
    const tableRoot = page.locator('#table-container');
    const table = tableRoot.locator('table');
    await expect(table).toBeVisible();
    await expect(table.locator('thead th')).toHaveText(['Sel', 'ID', 'Name', 'Price', 'Active', 'Category', 'Release Date']);

    const rows = table.locator('tbody tr');
    await expect(rows).toHaveCount(3);

    // Table: internal pager buttons (created automatically if not provided).
    await expect(tableRoot.getByRole('button', { name: 'Prev' })).toBeVisible();
    await expect(tableRoot.getByRole('button', { name: 'Next' })).toBeVisible();
    await expect(tableRoot.locator('span', { hasText: 'Page:' })).toHaveText('Page: 1');
    await tableRoot.getByRole('button', { name: 'Next' }).click();
    await tableRoot.getByRole('button', { name: 'Prev' }).click();
    await expect(tableRoot.locator('span', { hasText: 'Page:' })).toHaveText('Page: 1');

    // Table: delete selected with nothing selected should show an error status.
    await page.locator('#tbl-delete-selected').click();
    await expect(tblStatus).toHaveText('No rows selected.');

    // Table: create adds a row; delete selected removes it.
    await page.locator('#tbl-create').click();
    await expect(tblStatus).toHaveText('New row created.');
    await expect(rows).toHaveCount(4);

    // Select the first row's checkbox (selection column).
    const firstRowCheckbox = rows.nth(0).locator('input[type="checkbox"]');
    await firstRowCheckbox.check();
    await page.locator('#tbl-delete-selected').click();
    await expect(tblStatus).toHaveText('Selected rows deleted.');
    await expect(rows).toHaveCount(3);

    // Integration: clicking a table row (not the checkbox) should sync form record selection.
    await rows.nth(1).click({ position: { x: 50, y: 10 } });
    await expect(recordIndicator).toHaveText('Record 2 of 3');
  });

  test('Empty state disables navigation + destructive controls (Create stays enabled)', async ({ page }) => {
    await page.goto('/demo/basic-model/basic-model.html');

    const recordIndicator = page.locator('#record-indicator');
    const saveStatus = page.locator('#save-status');

    // Delete all initial records (3) using form controls.
    await expect(recordIndicator).toHaveText('Record 1 of 3');
    await page.locator('#btn-delete').click();
    await expect(saveStatus).toHaveText('Record deleted.');
    await expect(recordIndicator).toHaveText('Record 1 of 2');

    await page.locator('#btn-delete').click();
    await expect(saveStatus).toHaveText('Record deleted.');
    await expect(recordIndicator).toHaveText('Record 1 of 1');

    await page.locator('#btn-delete').click();
    await expect(saveStatus).toHaveText('Record deleted.');
    await expect(recordIndicator).toHaveText('No records');

    // Form: navigation + destructive actions disabled, Create enabled.
    await expect(page.locator('#btn-prev')).toBeDisabled();
    await expect(page.locator('#btn-next')).toBeDisabled();
    await expect(page.locator('#btn-save')).toBeDisabled();
    await expect(page.locator('#btn-delete')).toBeDisabled();
    await expect(page.locator('#btn-create')).toBeEnabled();

    // Table: internal pager buttons disabled, delete-selected disabled, Create enabled.
    const tableRoot = page.locator('#table-container');
    await expect(tableRoot.getByRole('button', { name: 'Prev' })).toBeDisabled();
    await expect(tableRoot.getByRole('button', { name: 'Next' })).toBeDisabled();
    await expect(page.locator('#tbl-delete-selected')).toBeDisabled();
    await expect(page.locator('#tbl-create')).toBeEnabled();
  });
});

