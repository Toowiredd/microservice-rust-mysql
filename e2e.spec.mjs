import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

const TEST_EVENTS = [
  {
    timestamp: "2025-09-05T10:00:00Z",
    source: "Shell",
    event_type: "CommandExecuted",
    data: { command: "ls -l", exit_code: 0 }
  },
  {
    timestamp: "2025-09-05T10:01:00Z",
    source: "ClaudeHook",
    event_type: "UserPromptSubmit",
    data: { prompt: "How do I test this feature?" }
  },
  {
    timestamp: "2025-09-05T10:02:00Z",
    source: "Shell",
    event_type: "CommandExecuted",
    data: { command: "npm run test", exit_code: 1, error: "1 test failed" }
  },
  {
    timestamp: "2025-09-05T10:03:00Z",
    source: "LogFile",
    event_type: "ErrorLog",
    data: { level: "error", message: "Failed to connect to database" }
  }
];

test.beforeAll(async () => {
  console.log('Starting services...');
  execSync('docker compose up -d', { stdio: 'inherit' });
  // Increased wait time to ensure services are fully up
  await new Promise(resolve => setTimeout(resolve, 20000));

  console.log('Initializing database...');
  try {
    execSync('curl -s --retry 5 --retry-delay 2 http://localhost:8080/init');
  } catch (e) {
    console.error("Failed to init DB, showing docker logs...");
    execSync('docker compose logs', { stdio: 'inherit' });
    throw e;
  }

  console.log('Ingesting test data...');
  for (const event of TEST_EVENTS) {
    const eventString = JSON.stringify(event).replace(/'/g, "'\\''");
    execSync(`curl -s -X POST http://localhost:8080/ingest -H "Content-Type: application/json" -d '${eventString}'`);
  }
});

test.afterAll(async () => {
  console.log('Stopping services...');
  execSync('docker compose down', { stdio: 'inherit' });
});

test('Filter and Search Functionality', async ({ page }) => {
  await page.goto('http://localhost:8090');

  console.log('1. Initial load - expecting 4 events');
  await expect(page.locator('.card')).toHaveCount(4);

  console.log('2. Test filter by source');
  await page.locator('#source-filter').fill('Shell');
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('.card')).toHaveCount(2);
  await expect(page.getByText('Shell: CommandExecuted').first()).toBeVisible();
  console.log('   - Found 2 "Shell" events. Correct.');

  console.log('3. Test full-text search');
  await page.locator('#source-filter').fill(''); // Clear previous filter
  await page.locator('#search-query').fill('database');
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(page.getByText('LogFile: ErrorLog')).toBeVisible();
  console.log('   - Found 1 "database" event. Correct.');

  console.log('4. Test clickable filter');
  // First, clear filters to show all events again
  await page.locator('#search-query').fill('');
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('.card')).toHaveCount(4);

  // Now click the link
  await page.getByRole('link', { name: 'ClaudeHook' }).click();
  await expect(page.locator('.card')).toHaveCount(1);
  await expect(page.getByText('ClaudeHook: UserPromptSubmit')).toBeVisible();
  console.log('   - Clicked "ClaudeHook", found 1 event. Correct.');

  console.log('Taking final screenshot...');
  await page.screenshot({ path: 'verification.png' });
});
