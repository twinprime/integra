import { test, expect } from '@playwright/test'
import { selectTreeItem } from './helpers/interactions'
import { makeLocalStorageValue } from './fixtures/sample-system'
import { gotoHome } from './helpers/app'

// ─── In-memory mock for window.showDirectoryPicker (save) ─────────────────────

/**
 * Injects a mock `showDirectoryPicker` that captures written file content into
 * `globalThis.__savedFiles` (a plain object keyed by filename). Also sets
 * `globalThis.__pickerCalled = true` when the picker is invoked.
 */
const SAVE_MOCK_SCRIPT = `
  globalThis.__pickerCalled = false;
  globalThis.__savedFiles = {};
  window.showDirectoryPicker = async function() {
    globalThis.__pickerCalled = true;
    var files = globalThis.__savedFiles;
    function makeWritable(key) {
      return {
        write: async function(content) { files[key] = content; },
        close: async function() {}
      };
    }
    var subdir = {
      kind: 'directory',
      name: 'System',
      values: async function*() {},
      getFileHandle: async function(name) {
        return { kind: 'file', name: name, createWritable: async function() { return makeWritable('sub/' + name); } };
      },
      removeEntry: async function() {}
    };
    return {
      kind: 'directory',
      name: 'test-dir',
      values: async function*() {},
      getFileHandle: async function(name) {
        return { kind: 'file', name: name, createWritable: async function() { return makeWritable(name); } };
      },
      getDirectoryHandle: async function() { return subdir; },
      removeEntry: async function() {}
    };
  };
`

// ─── In-memory mock for window.showDirectoryPicker (load) ────────────────────

/**
 * Injects a mock `showDirectoryPicker` that returns an in-memory directory
 * containing a single YAML file for a minimal "Loaded System" component.
 */
const LOAD_MOCK_SCRIPT = `
  var LOADED_YAML = [
    'uuid: e2e-loaded-uuid',
    'id: LoadedSystem',
    'name: Loaded System',
    'type: component',
    'subComponents: []',
    'actors: []',
    'useCaseDiagrams: []',
    'interfaces: []'
  ].join('\\n') + '\\n';

  window.showDirectoryPicker = async function() {
    return {
      kind: 'directory',
      name: 'test-dir',
      values: async function*() {
        yield {
          kind: 'file',
          name: 'root.yaml',
          getFile: async function() { return { text: async function() { return LOADED_YAML; } }; }
        };
      },
      getFileHandle: async function(name) {
        return {
          kind: 'file', name: name,
          createWritable: async function() { return { write: async function() {}, close: async function() {} }; }
        };
      },
      removeEntry: async function() {}
    };
  };
`

// ─── Shared setup ─────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
    const lsValue = makeLocalStorageValue()
    await page.addInitScript((value) => {
        localStorage.setItem('integra-system', value)
    }, lsValue)
})

// ─── Button visibility ────────────────────────────────────────────────────────

test.describe('toolbar button visibility', () => {
    test('Save button is visible in the toolbar', async ({ page }) => {
        await gotoHome(page)
        await expect(page.getByTitle('Save system to YAML file')).toBeVisible()
    })

    test('Load button is visible in the toolbar', async ({ page }) => {
        await gotoHome(page)
        await expect(page.getByTitle('Load system from YAML file')).toBeVisible()
    })
})

// ─── Unsaved changes indicator ────────────────────────────────────────────────

test.describe('unsaved changes indicator', () => {
    test('yellow dot appears after modifying the loaded fixture', async ({ page }) => {
        await gotoHome(page)

        // No unsaved changes initially
        await expect(page.getByTitle('Unsaved changes')).not.toBeVisible()

        // Rename the "Login" use-case node to dirty the state
        await selectTreeItem(page, 'Login')
        const idInput = page.getByLabel('Node ID')
        await idInput.clear()
        await idInput.fill('SignIn')
        await idInput.press('Enter')

        // The unsaved-changes indicator (yellow dot) should now be visible
        await expect(page.getByTitle('Unsaved changes')).toBeVisible()
    })
})

// ─── Save flow (mocked showDirectoryPicker) ───────────────────────────────────

test.describe('save flow with mocked directory picker', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ content: SAVE_MOCK_SCRIPT })
    })

    test('clicking Save invokes showDirectoryPicker and writes YAML files', async ({ page }) => {
        await gotoHome(page)

        // Make a change so the system is dirty and the save path is meaningful
        await selectTreeItem(page, 'Login')
        const idInput = page.getByLabel('Node ID')
        await idInput.clear()
        await idInput.fill('SignIn')
        await idInput.press('Enter')

        await expect(page.getByTitle('Unsaved changes')).toBeVisible()

        // Click Save — should trigger the mock picker
        await page.getByTitle('Save system to YAML file').click()

        // Wait for the mock to register the call
        await page.waitForFunction(
            () => (globalThis as unknown as { __pickerCalled: boolean }).__pickerCalled === true
        )

        const pickerCalled = await page.evaluate(
            () => (globalThis as unknown as { __pickerCalled: boolean }).__pickerCalled
        )
        expect(pickerCalled).toBe(true)

        // At least the root YAML file should have been written
        const savedFiles = await page.evaluate(
            () => (globalThis as unknown as { __savedFiles: Record<string, string> }).__savedFiles
        )
        const filenames = Object.keys(savedFiles)
        expect(filenames.some((f) => f.endsWith('.yaml'))).toBe(true)
    })

    test('unsaved indicator disappears after a successful save', async ({ page }) => {
        await gotoHome(page)

        // Dirty the state
        await selectTreeItem(page, 'Login')
        const idInput = page.getByLabel('Node ID')
        await idInput.clear()
        await idInput.fill('SignIn')
        await idInput.press('Enter')
        await expect(page.getByTitle('Unsaved changes')).toBeVisible()

        // Save
        await page.getByTitle('Save system to YAML file').click()
        await page.waitForFunction(
            () => (globalThis as unknown as { __pickerCalled: boolean }).__pickerCalled === true
        )

        // After a successful save markSaved() is called, so the indicator should vanish
        await expect(page.getByTitle('Unsaved changes')).not.toBeVisible()
    })

    test('cancelling the directory picker (AbortError) shows no error alert', async ({ page }) => {
        // Override to throw AbortError like a real user cancellation
        await page.addInitScript({
            content: `
        window.showDirectoryPicker = async function() {
          throw new DOMException('User aborted', 'AbortError');
        };
      `,
        })

        await gotoHome(page)

        // Capture any dialog that appears
        let alertShown = false
        page.on('dialog', (dialog) => {
            alertShown = true
            void dialog.dismiss()
        })

        await page.getByTitle('Save system to YAML file').click()
        // Short wait to let any async alert surface
        await page.waitForTimeout(300)

        expect(alertShown).toBe(false)
    })
})

// ─── Load flow (mocked showDirectoryPicker) ───────────────────────────────────

test.describe('load flow with mocked directory picker', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript({ content: LOAD_MOCK_SCRIPT })
    })

    test('clicking Load reads YAML from the mock directory and updates the tree', async ({
        page,
    }) => {
        // Navigate directly to /file so that clicking Load stays on the same page.
        // handleLoad only redirects when the current pathname is not /file, so
        // starting here avoids a full navigation (and the addInitScript re-runs
        // that would overwrite localStorage with the fixture system).
        await page.goto('/file')

        // Dismiss any confirmation dialog (none expected on clean state, but be safe)
        page.on('dialog', (dialog) => void dialog.accept())

        await page.getByTitle('Load system from YAML file').click()

        // The root component name "Loaded System" should appear in the tree
        await expect(
            page.getByRole('treeitem').filter({ hasText: 'Loaded System' }).first()
        ).toBeVisible()
    })
})
