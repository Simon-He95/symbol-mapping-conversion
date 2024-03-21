import { addEventListener, createRange, getConfiguration, getPosition, updateText } from '@vscode-use/utils'
import type { Disposable, ExtensionContext } from 'vscode'

export async function activate(context: ExtensionContext) {
  const disposes: Disposable[] = []
  let mappings = getConfiguration('symbol-mapping-conversion.mappings')
  const isRun = true
  disposes.push(addEventListener('text-change', (e) => {
    if (!isRun)
      return
    const changes = e.contentChanges.filter((c: any) => c.text.trim())
    if (!changes.length)
      return
    const updateLists: any = []
    changes.forEach((c: any) => {
      let text = c.text
      Object.keys(mappings).forEach((k) => {
        const v = mappings[k]
        text = text.replaceAll(k, v)
      })
      if (text !== c.text) {
        const start = getPosition(c.rangeOffset)
        const end = getPosition(c.rangeOffset + c.text.length)
        const range = createRange(start, end)
        updateLists.push({
          range,
          text,
        })
      }
    })
    if (!updateLists.length)
      return
    updateText((edit) => {
      updateLists.forEach((list: any) => {
        edit.replace(list.range, list.text)
      })
    })
  }))

  disposes.push(addEventListener('config-change', () => {
    mappings = getConfiguration('symbol-mapping-conversion.mappings')
  }))

  context.subscriptions.push(...disposes)
}

export function deactivate() {

}
