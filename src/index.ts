import { nextTick } from 'node:process'
import { addEventListener, createBottomBar, createRange, getActiveTextEditorLanguageId, getConfiguration, getCopyText, getCurrentFileUrl, getLineText, getPosition, getSelection, jumpToLine, registerCommand, setConfiguration, updateText } from '@vscode-use/utils'
import type { Disposable, ExtensionContext } from 'vscode'

const base = {
  '【': '[',
  '】': ']',
  '（': '(',
  '）': ')',
  '《': '<',
  '》': '>',
  '「': '{',
  '」': '}',
  '¥': '$',
  '……': '^',
  '。': '.',
  '，': ',',
  '：': ':',
  '；': ';',
  '？': '?',
  '！': '!',
  '“': '"',
  '”': '"',
  '‘': '\'',
  '’': '\'',
  '～': '~',
  '·': '`',
}
export async function activate(context: ExtensionContext) {
  const disposes: Disposable[] = []
  const map: Record<string, string> = {
    '{': '}',
    '[': ']',
  }
  let { mappings, isEnable, extLanguage, copyMap } = getConfig()

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

  let preSelect: any = null
  disposes.push(addEventListener('selection-change', (e) => {
    if (e.kind && e.kind !== 1)
      preSelect = getSelection()
  }))

  disposes.push(addEventListener('text-change', async (e) => {
    if (e.reason === 1) // 撤销时不再干预
      return
    if (!isEnable)
      return

    const uri = e.document.uri
    const currentFileUrl = getCurrentFileUrl()

    if (uri.fsPath !== currentFileUrl)
      return

    const language = getActiveTextEditorLanguageId()

    if (!language)
      return

    if (extLanguage.includes(language))
      return

    const changes = e.contentChanges.filter((c: any) => c.text.trim())

    if (!changes.length)
      return
    // 获取对应语言的配置
    const _base = Object.assign(base, mappings.base)
    const languageMappings = Object.assign(_base, mappings[language])
    const updateLists: any = []
    for (const c of changes) {
      let text = c.text
      let offset = 0
      if (!copyMap) {
        // 不干预复制粘贴的情况，只考虑输入
        const copyText = await getCopyText()
        if (copyText === text)
          return
      }

      Object.keys(languageMappings).forEach((k) => {
        const v = languageMappings[k]
        const reg = new RegExp(k, 'gm')
        if (text.length < k.length && k.endsWith(text)) {
          // 支持少于匹配项，往前贪婪获取字符串
          offset = k.length - text.length
          const lineText = getLineText(c.range.start.line)!
          const start = c.range.start.character - offset
          if (start < 0)
            return
          if (lineText.slice(start, c.range.start.character + text.length) !== k)
            return
          text = lineText.slice(start, c.range.start.character + text.length)
        }
        text = text.replace(reg, v)
      })
      if (text !== c.text) {
        const start = getPosition(c.rangeOffset - offset)
        const end = getPosition(c.rangeOffset + c.text.length)
        const range = createRange(start, end)
        if (preSelect && ((preSelect.line === c.range.end.line && preSelect.character === c.range.end.character) || (preSelect.line === c.range.start.line && preSelect.character === c.range.start.character)) && /['"{\[`\(]/.test(text)) {
          const selectText = preSelect.selectedTextArray[0]
          if (text.includes('$1')) {
            // 针对需要光标移动到指定位置的场景
            const offset = text.indexOf('$1')
            const [_pre, _end] = text.split('$1')
            text = _pre + selectText + _end
            nextTick(() => {
              jumpToLine([end.line, end.character + offset - 1 + selectText.length])
            })
          }
          else { text = text + selectText + (map[text] ?? text) }
        }
        else if (text.includes('$1')) {
          // 针对需要光标移动到指定位置的场景
          const offset = text.indexOf('$1')
          text = text.replace('$1', '')
          nextTick(() => {
            jumpToLine([end.line, end.character + offset - 1])
          })
        }
        updateLists.push({
          range,
          text,
        })
      }
    }

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
    copyMap = config.copyMap
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
  const copyMap = getConfiguration('symbol-mapping-conversion.copyMap')
  return {
    mappings,
    extLanguage,
    isEnable,
    copyMap,
  }
}
