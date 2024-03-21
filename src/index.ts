import { addEventListener, createBottomBar, createRange, getActiveTextEditorLanguageId, getConfiguration, getPosition, registerCommand, setConfiguration, updateText } from '@vscode-use/utils'
import type { Disposable, ExtensionContext } from 'vscode'

export async function activate(context: ExtensionContext) {
  const disposes: Disposable[] = []
  let { mappings, isEnable, extLanguage } = getConfig()

  const statusBar = createBottomBar({
    position: 'right',
    color: isEnable ? '#bef264' : '#f87171',
    text: isEnable ? 'symbol-mapping-conversion: ✅' : 'symbol-mapping-conversion: ❌',
    command: 'symbol-mapping-conversion.toggleStatusBar',
  })

  statusBar.show()

  const updateStatusBar = () => {
    statusBar.text = isEnable ? 'symbol-mapping-conversion: ✅' : 'symbol-mapping-conversion: ❌'
    statusBar.color = isEnable ? '#bef264' : '#f87171'
  }

  disposes.push(registerCommand('symbol-mapping-conversion.toggleStatusBar', () => {
    isEnable = !isEnable
    setConfiguration('symbol-mapping-conversion.isEnable', isEnable, true)
    updateStatusBar()
  }))

  disposes.push(addEventListener('text-change', (e) => {
    if (!isEnable)
      return

    const language = getActiveTextEditorLanguageId()

    if (!language)
      return

    if (extLanguage.includes(language))
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
    const config = getConfig()
    mappings = config.mappings
    isEnable = config.isEnable
    extLanguage = config.extLanguage
    updateStatusBar()
  }))

  context.subscriptions.push(...disposes)
}

export function deactivate() {

}

function getConfig() {
  const mappings = getConfiguration('symbol-mapping-conversion.mappings')
  const extLanguage = getConfiguration('symbol-mapping-conversion.extLanguage')
  const isEnable = getConfiguration('symbol-mapping-conversion.isEnable')
  return {
    mappings,
    extLanguage,
    isEnable,
  }
}
