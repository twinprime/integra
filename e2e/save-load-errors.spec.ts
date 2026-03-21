import { test, expect } from '@playwright/test'
import { selectTreeItem } from './helpers/interactions'
import { makeLocalStorageValue } from './fixtures/sample-system'
import { gotoHome } from './helpers/app'

const SAVE_FAILURE_MOCK_SCRIPT = `
  window.showDirectoryPicker = async function() {
    return {
      kind: 'directory',
      name: 'test-dir',
      values: async function*() {},
      getFileHandle: async function(name) {
        return {
          kind: 'file',
          name: name,
          createWritable: async function() {
            return {
              write: async function() { throw new Error('disk full'); },
              close: async function() {}
            };
          }
        };
      },
      getDirectoryHandle: async function() {
        return {
          kind: 'directory',
          name: 'System',
          values: async function*() {},
          getFileHandle: async function(name) {
            return {
              kind: 'file',
              name: name,
              createWritable: async function() {
                return {
                  write: async function() { throw new Error('disk full'); },
                  close: async function() {}
                };
              }
            };
          },
          removeEntry: async function() {}
        };
      },
      removeEntry: async function() {}
    };
  };
`

test.beforeEach(async ({ page }) => {
    await page.addInitScript((value) => {
        localStorage.setItem('integra-system', value)
    }, makeLocalStorageValue())
    await page.addInitScript({ content: SAVE_FAILURE_MOCK_SCRIPT })
})

test('save failure shows an alert and keeps the model marked as unsaved', async ({ page }) => {
    await gotoHome(page)

    await selectTreeItem(page, 'Login')
    const idInput = page.getByLabel('Node ID')
    await idInput.clear()
    await idInput.fill('SignIn')
    await idInput.press('Enter')

    await expect(page.getByTitle('Unsaved changes')).toBeVisible()

    let alertMessage = ''
    page.on('dialog', async (dialog) => {
        alertMessage = dialog.message()
        await dialog.dismiss()
    })

    await page.getByTitle('Save system to YAML file').click()
    await expect.poll(() => alertMessage).toContain('Failed to save system: disk full')
    await expect(page.getByTitle('Unsaved changes')).toBeVisible()
})
