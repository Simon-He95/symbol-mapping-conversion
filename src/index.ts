import { addEventListener, createBottomBar, createRange, getActiveTextEditorLanguageId, getConfiguration, getLineText, getPosition, getSelection, registerCommand, setConfiguration, updateText } from '@vscode-use/utils'
import type { Disposable, ExtensionContext } from 'vscode'

export async function activate(context: ExtensionContext) {
  const disposes: Disposable[] = []
  const map: Record<string, string> = {
    '{': '}',
    '[': ']',
  }
  let { mappings, isEnable, extLanguage } = getConfig()

  const statusBar = createBottomBar({
    position: 'right',
    text: `$(${isEnable ? 'symbol-array' : 'circle-slash'}) Symbol`,
    command: 'symbol-mapping-conversion.toggleStatusBar',
  })

  statusBar.show()

  const updateStatusBar = () => {
    statusBar.text = `$(${isEnable ? 'symbol-array' : 'circle-slash'}) Symbol`
  }

  disposes.push(registerCommand('symbol-mapping-conversion.toggleStatusBar', () => {
    isEnable = !isEnable
    setConfiguration('symbol-mapping-conversion.isEnable', isEnable, true)
    updateStatusBar()
  }))
  let preSelect: null | string = null
  disposes.push(addEventListener('text-change', (e) => {
    const { selectedTextArray } = getSelection()!
    if (e.reason === 1) // 撤销时不再干预
      return

    if (!isEnable)
      return

    const language = getActiveTextEditorLanguageId()

    if (!language)
      return

    if (extLanguage.includes(language))
      return

    const changes = e.contentChanges.filter((c: any) => c.text.trim())

    if (!changes.length) {
      preSelect = selectedTextArray[0] || null
      return
    }

    const updateLists: any = []
    changes.forEach((c: any) => {
      let text = c.text
      let offset = 0
      Object.keys(mappings).forEach((k) => {
        const v = mappings[k]
        if (text.length < k.length && k.endsWith(text)) {
          // 支持少于匹配项，往前贪婪获取字符串
          offset = k.length - text.length
          const lineText = getLineText(c.range.start.line)!
          const start = c.range.start.character - offset
          if (start < 0)
            return
          text = lineText.slice(start, c.range.start.character + text.length)
        }
        text = text.replaceAll(k, v)
      })
      if (text !== c.text) {
        const start = getPosition(c.rangeOffset - offset)
        const end = getPosition(c.rangeOffset + c.text.length)
        const range = createRange(start, end)
        if (preSelect && /['"{\[`]/.test(text))
          text = text + preSelect + (map[text] ?? text)

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
