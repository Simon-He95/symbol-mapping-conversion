import { nextTick } from 'node:process'
import { addEventListener, createBottomBar, createRange, getActiveTextEditorLanguageId, getConfiguration, getCopyText, getCurrentFileUrl, getLineText, getPosition, getSelection, jumpToLine, registerCommand, setConfiguration, updateText } from '@vscode-use/utils'
import type { Disposable, ExtensionContext, TextDocumentContentChangeEvent } from 'vscode'

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

  // 改进：使用局部变量而非全局变量
  let isProcessing = false
  let debounceTimer: NodeJS.Timeout | null = null
  const changeTracker = {
    lastChangeTime: 0,
    changeCount: 0,
    recentChanges: [] as Array<{ time: number, size: number }>,
  }

  // 确保定时器被清理
  const clearDebounceTimer = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
  }

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
    // 防止递归触发
    if (isProcessing) {
      return
    }

    // 撤销/重做操作不处理
    if (e.reason === 1 || e.reason === 2) {
      return
    }

    if (!isEnable)
      return

    const uri = e.document.uri
    const currentFileUrl = getCurrentFileUrl()

    if (uri.fsPath !== currentFileUrl)
      return

    const language = getActiveTextEditorLanguageId()

    if (!language || extLanguage.includes(language))
      return

    const changes = e.contentChanges

    // 改进的批量更新检测
    if (detectBulkUpdate(changes, changeTracker)) {
      // eslint-disable-next-line no-console
      console.log('检测到批量更新，跳过符号转换')
      return
    }

    const filteredChanges = changes.filter((c: any) => c.text.trim())
    if (!filteredChanges.length)
      return

    // 清理之前的定时器
    clearDebounceTimer()

    debounceTimer = setTimeout(async () => {
      await processTextChange(filteredChanges, language)
    }, 50)
  }))

  // 改进的批量更新检测函数
  function detectBulkUpdate(changes: readonly TextDocumentContentChangeEvent[], tracker: typeof changeTracker): boolean {
    const now = Date.now()
    const totalTextLength = changes.reduce((sum, change) => sum + change.text.length, 0)

    // 更新跟踪器
    tracker.recentChanges.push({ time: now, size: totalTextLength })
    // 只保留最近1秒的变更记录
    tracker.recentChanges = tracker.recentChanges.filter(change => now - change.time < 1000)

    // 策略1: 变更数量 - 放宽限制
    if (changes.length > 20) {
      return true
    }

    // 策略2: 单个变更内容 - 放宽限制，但排除正常粘贴
    for (const change of changes) {
      // 单次变更超过1000个字符才认为是批量操作
      if (change.text.length > 1000) {
        return true
      }

      // 变更涉及超过20行
      if (change.range && change.range.end.line - change.range.start.line > 20) {
        return true
      }
    }

    // 策略3: 1秒内的累计变更大小
    const recentTotalSize = tracker.recentChanges.reduce((sum, change) => sum + change.size, 0)
    if (recentTotalSize > 2000) {
      return true
    }

    // 策略4: 检测全文替换 - 更精确的判断
    const hasFullDocumentReplace = changes.some((change) => {
      return change.range
        && change.range.start.line === 0
        && change.range.start.character === 0
        && change.text.split('\n').length > 50 // 超过50行才认为是全文替换
    })

    if (hasFullDocumentReplace) {
      return true
    }

    // 策略5: 高频变更检测 - 改进时间窗口逻辑
    if (now - tracker.lastChangeTime < 50) { // 50ms内的连续变更
      tracker.changeCount++
      if (tracker.changeCount > 10) { // 连续10次变更
        return true
      }
    }
    else {
      tracker.changeCount = 1
    }
    tracker.lastChangeTime = now

    return false
  }

  // 改进的文本处理函数
  async function processTextChange(changes: any[], language: string) {
    if (isProcessing)
      return

    isProcessing = true

    try {
      // 获取对应语言的配置
      const _base = Object.assign(base, mappings.base)
      const languageMappings = Object.assign(_base, mappings[language])
      const updateLists: any = []

      for (const c of changes) {
        let text = c.text
        let offset = 0

        if (!copyMap) {
          const copyText = await getCopyText()
          if (copyText === text)
            continue
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
          const range = createRange(start.position, end.position)

          if (preSelect && ((preSelect.line === c.range.end.line && preSelect.character === c.range.end.character) || (preSelect.line === c.range.start.line && preSelect.character === c.range.start.character)) && /['"{[`(]/.test(text)) {
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
            else {
              text = text + selectText + (map[text] ?? text)
            }
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

      if (updateLists.length > 0) {
        updateText((edit) => {
          updateLists.forEach((list: any) => {
            edit.replace(list.range, list.text)
          })
        })
      }
    }
    catch (error) {
      console.error('处理文本变更时出错:', error)
    }
    finally {
      // 立即重置，不需要延迟
      isProcessing = false
    }
  }

  disposes.push(addEventListener('config-change', () => {
    const config = getConfig()
    mappings = config.mappings
    isEnable = config.isEnable
    extLanguage = config.extLanguage
    copyMap = config.copyMap
    updateStatusBar()
  }))

  // 确保资源清理
  disposes.push({
    dispose: () => {
      clearDebounceTimer()
      isProcessing = false
      changeTracker.recentChanges = []
    },
  })

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
