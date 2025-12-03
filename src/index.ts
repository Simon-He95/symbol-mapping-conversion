import type { Disposable, ExtensionContext, TextDocumentContentChangeEvent } from 'vscode'
import { nextTick } from 'node:process'
import { addEventListener, createBottomBar, createRange, getConfiguration, getCopyText, getLineText, getPosition, getSelection, jumpToLine, registerCommand, setConfiguration, updateText } from '@vscode-use/utils'
import { commands, window } from 'vscode'

interface MappingEntry {
  key: string
  replacement: string
  length: number
  pattern: RegExp
}

type MappingConfig = Record<string, Record<string, string>>
type BulkDetectionOverride = Record<string, Partial<BulkDetectionConfig>>
interface AutoPauseConfig {
  enabled: boolean
  triggerCount: number
  durationMs: number
}
interface AutoActionConfig {
  enabled: boolean
  snippet: string
  languageFilter: string[]
  includeReasonVariable?: boolean
}

interface NotificationConfig {
  showSkipToasts: boolean
  detailedTooltip: boolean
}

interface AutoRemediationConfig {
  enabled: boolean
  triggerCount: number
  snippet: string
  pauseAfterRun: boolean
  snippetKey?: string
  languageFilter?: string[]
}

interface BulkDetectionConfig {
  maxChanges: number
  maxCharsPerChange: number
  maxLinesPerChange: number
  maxRecentSize: number
  minFullReplaceLines: number
  highFrequencyInterval: number
  highFrequencyChanges: number
}

const defaultPairMappings: Record<string, string> = {
  '{': '}',
  '[': ']',
  '(': ')',
  '<': '>',
  '\'': '\'',
  '"': '"',
  '`': '`',
}

const defaultBulkDetection: BulkDetectionConfig = {
  maxChanges: 20,
  maxCharsPerChange: 1000,
  maxLinesPerChange: 20,
  maxRecentSize: 2000,
  minFullReplaceLines: 50,
  highFrequencyInterval: 50,
  highFrequencyChanges: 10,
}

const defaultAutoPause: AutoPauseConfig = {
  enabled: false,
  triggerCount: 10,
  durationMs: 60_000,
}

const defaultAutoAction: AutoActionConfig = {
  enabled: false,
  snippet: '',
  languageFilter: [],
  includeReasonVariable: true,
}

const defaultNotifications: NotificationConfig = {
  showSkipToasts: false,
  detailedTooltip: true,
}

const defaultAutoRemediation: AutoRemediationConfig = {
  enabled: false,
  triggerCount: 5,
  snippet: '',
  pauseAfterRun: false,
  snippetKey: '',
  languageFilter: [],
}
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
const BULK_STATS_KEY = 'symbol-mapping-conversion.bulkStats'
const BULK_PROMPT_MILESTONES = [3, 10, 25, 50, 100]
const BULK_PAUSE_STATE_KEY = 'symbol-mapping-conversion.bulkPause'

export async function activate(context: ExtensionContext) {
  const disposes: Disposable[] = []
  const outputChannel = window.createOutputChannel('Symbol Mapping Conversion')
  disposes.push(outputChannel)
  let { mappings, isEnable, extLanguage, copyMap, pairMappings, bulkDetection, bulkDetectionOverrides, autoPause, autoActionOnSkip, notifications, autoRemediation } = getConfig()
  let pairMap: Record<string, string> = {
    ...defaultPairMappings,
    ...pairMappings,
  }
  let bulkDetectionConfig: BulkDetectionConfig = {
    ...defaultBulkDetection,
    ...bulkDetection,
  }
  let lastBulkInfo: { reason: string, languageId: string, timestamp: string } | null = null
  let bulkStats = context.globalState.get<Record<string, { count: number, lastLanguage: string, lastTimestamp: string }>>(BULK_STATS_KEY, {})
  const saveBulkStats = () => {
    context.globalState.update(BULK_STATS_KEY, bulkStats)
  }
  const bulkPromptProgress = new Map<string, number>()
  const autoPauseProgress = new Map<string, number>()
  let autoActionConfig: AutoActionConfig = {
    ...defaultAutoAction,
    ...autoActionOnSkip,
  }
  let notificationConfig: NotificationConfig = {
    ...defaultNotifications,
    ...notifications,
  }
  let autoRemediationConfig: AutoRemediationConfig = {
    ...defaultAutoRemediation,
    ...autoRemediation,
  }
  let autoPauseConfig: AutoPauseConfig = {
    ...defaultAutoPause,
    ...autoPause,
  }
  // ensure tooltip timer variable exists before functions that reference it
  let tooltipResetTimer: NodeJS.Timeout | null = null

  const resetStatusTooltip = () => {
    if (tooltipResetTimer) {
      clearTimeout(tooltipResetTimer)
      tooltipResetTimer = null
    }
    updateBaseTooltip()
  }
  const clearBulkStatsData = (silent = false) => {
    bulkStats = {}
    bulkPromptProgress.clear()
    autoPauseProgress.clear()
    saveBulkStats()
    resetStatusTooltip()
    if (!silent)
      window.showInformationMessage('Bulk-detection stats cleared.')
  }

  // 改进：使用局部变量而非全局变量
  let isProcessing = false
  let debounceTimer: NodeJS.Timeout | null = null
  const changeTracker = {
    lastChangeTime: 0,
    changeCount: 0,
    recentChanges: [] as Array<{ time: number, size: number }>,
  }
  const mappingCache = new Map<string, MappingEntry[]>()
  let bulkDetectionResumeAt = context.globalState.get<number | null>(BULK_PAUSE_STATE_KEY, null)
  let bulkDetectionPauseTimer: NodeJS.Timeout | null = null

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
    command: 'symbol-mapping-conversion.showMenu',
  })

  statusBar.show()
  const getTopBulkStat = () => {
    const entries = Object.entries(bulkStats)
    if (!entries.length)
      return null as null | { reason: string, stat: { count: number, lastLanguage: string, lastTimestamp: string } }
    return entries.reduce((best, [reason, stat]) => {
      if (!best || stat.count > best.stat.count)
        return { reason, stat }
      return best
    }, null as null | { reason: string, stat: { count: number, lastLanguage: string, lastTimestamp: string } })
  }

  const isBulkDetectionPaused = () => {
    return bulkDetectionResumeAt !== null && bulkDetectionResumeAt > Date.now()
  }

  const getPauseRemaining = () => {
    if (!bulkDetectionResumeAt)
      return null
    if (bulkDetectionResumeAt === Number.POSITIVE_INFINITY)
      return Infinity
    return Math.max(0, bulkDetectionResumeAt - Date.now())
  }

  const formatRemaining = (ms: number | null) => {
    if (ms === null)
      return ''
    if (ms === Infinity)
      return '∞'
    const seconds = Math.max(1, Math.round(ms / 1000))
    if (seconds >= 3600)
      return `${Math.round(seconds / 3600)}h`
    if (seconds >= 60)
      return `${Math.round(seconds / 60)}m`
    return `${seconds}s`
  }

  const pauseBulkDetection = (durationMs: number | null) => {
    if (bulkDetectionPauseTimer) {
      clearTimeout(bulkDetectionPauseTimer)
      bulkDetectionPauseTimer = null
    }
    bulkDetectionResumeAt = durationMs === null ? Number.POSITIVE_INFINITY : Date.now() + durationMs
    context.globalState.update(BULK_PAUSE_STATE_KEY, bulkDetectionResumeAt)
    if (durationMs !== null) {
      bulkDetectionPauseTimer = setTimeout(() => {
        bulkDetectionPauseTimer = null
        resumeBulkDetection()
      }, durationMs)
    }
    updateStatusBar()
  }

  function resumeBulkDetection() {
    bulkDetectionResumeAt = null
    context.globalState.update(BULK_PAUSE_STATE_KEY, null)
    if (bulkDetectionPauseTimer) {
      clearTimeout(bulkDetectionPauseTimer)
      bulkDetectionPauseTimer = null
    }
    updateStatusBar()
  }

  const composeBaseTooltip = () => {
    const base = isEnable ? 'Symbol mapping conversion is enabled (click for menu)' : 'Symbol mapping conversion is disabled (click for menu)'
    const pauseInfo = isBulkDetectionPaused() ? `\nBulk detection paused (${formatRemaining(getPauseRemaining())})` : ''
    const top = getTopBulkStat()
    const detailInfo = notificationConfig.detailedTooltip && top
      ? `\nTop skipped: ${(getBulkHint(top.reason)?.title ?? top.reason)} (${top.stat.count}×)`
      : ''
    return `${base}${pauseInfo}${detailInfo}`
  }

  function updateBaseTooltip() {
    statusBar.tooltip = composeBaseTooltip()
  }

  function updateStatusBar() {
    statusBar.text = `$(${isEnable ? 'symbol-array' : 'circle-slash'}) Symbol`
    resetStatusTooltip()
  }

  const refreshBaseTooltipIfIdle = () => {
    if (!tooltipResetTimer)
      updateBaseTooltip()
  }

  if (isBulkDetectionPaused() && bulkDetectionResumeAt !== Number.POSITIVE_INFINITY) {
    const remaining = bulkDetectionResumeAt - Date.now()
    if (remaining > 0) {
      bulkDetectionPauseTimer = setTimeout(() => {
        bulkDetectionPauseTimer = null
        resumeBulkDetection()
      }, remaining)
    }
  }

  updateBaseTooltip()

  const showTemporaryTooltip = (message: string) => {
    if (!message)
      return
    if (tooltipResetTimer) {
      clearTimeout(tooltipResetTimer)
      tooltipResetTimer = null
    }
    statusBar.tooltip = message
    tooltipResetTimer = setTimeout(() => {
      tooltipResetTimer = null
      updateBaseTooltip()
    }, 4000)
  }

  const toggleExtension = () => {
    isEnable = !isEnable
    setConfiguration('symbol-mapping-conversion.isEnable', isEnable, true)
    updateStatusBar()
  }

  const logBulkSkip = (languageId: string, reason: string) => {
    const timestamp = new Date().toLocaleTimeString()
    outputChannel.appendLine(`[${timestamp}] [${languageId}] ${reason}`)
    lastBulkInfo = { reason, languageId, timestamp }
    const stat = bulkStats[reason]
    if (stat) {
      stat.count += 1
      stat.lastLanguage = languageId
      stat.lastTimestamp = timestamp
    }
    else {
      bulkStats[reason] = {
        count: 1,
        lastLanguage: languageId,
        lastTimestamp: timestamp,
      }
    }
    saveBulkStats()
    void maybePromptBulkAdjustment(reason)
    refreshBaseTooltipIfIdle()
    void maybeAutoPauseOnSkip(reason)
    void maybeRunAutoAction(languageId, reason)
    void maybeRunAutoRemediation(languageId, reason)
  }

  disposes.push(registerCommand('symbol-mapping-conversion.toggleStatusBar', () => {
    toggleExtension()
  }))

  disposes.push(registerCommand('symbol-mapping-conversion.showLog', () => {
    outputChannel.show(true)
  }))

  disposes.push(registerCommand('symbol-mapping-conversion.showMenu', async () => {
    const picks: Array<{ label: string, description?: string, detail?: string, value: string }> = []
    if (lastBulkInfo) {
      picks.push({
        label: '$(info) View last skipped change',
        description: `[${lastBulkInfo.timestamp}] ${lastBulkInfo.languageId}`,
        detail: lastBulkInfo.reason,
        value: 'last-bulk',
      })
    }
    picks.push({
      label: isEnable ? '$(circle-slash) Disable conversion' : '$(symbol-array) Enable conversion',
      description: isEnable ? 'Temporarily pause automatic replacements' : 'Turn automatic replacements back on',
      value: 'toggle',
    })
    picks.push({
      label: isBulkDetectionPaused() ? '$(play) Resume bulk detection' : '$(debug-pause) Pause bulk detection…',
      description: isBulkDetectionPaused() ? 'Re-enable all heuristics immediately' : 'Skip bulk detection for a while',
      value: isBulkDetectionPaused() ? 'resume-pause' : 'pause',
    })
    picks.push({
      label: '$(add) Create mapping from selection',
      description: 'Pick text, then save it as a mapping rule',
      value: 'create-mapping',
    })
    picks.push({
      label: '$(gear) Open settings',
      description: 'Tune mappings, pair mappings, or bulk-detection thresholds',
      value: 'settings',
    })
    picks.push({
      label: '$(output) Show log',
      description: 'Open the activity log output channel',
      value: 'log',
    })
    picks.push({
      label: '$(graph) Show bulk insights',
      description: 'Review the heuristics that skipped changes most often',
      value: 'insights',
    })
    picks.push({
      label: '$(trash) Clear bulk insights',
      description: 'Reset collected bulk-detection stats',
      value: 'clear-stats',
    })
    picks.push({
      label: '$(settings-gear) Manage bulk overrides',
      description: 'Review or edit per-language thresholds',
      value: 'manage-overrides',
    })
    picks.push({
      label: '$(history) Show skip history',
      description: 'Quickly review the last few skipped events',
      value: 'skip-history',
    })

    const pick = await window.showQuickPick(picks, {
      placeHolder: 'Symbol mapping actions',
    })
    if (!pick)
      return

    switch (pick.value) {
      case 'toggle':
        toggleExtension()
        break
      case 'settings':
        commands.executeCommand('workbench.action.openSettings', 'symbol-mapping-conversion')
        break
      case 'log':
        outputChannel.show(true)
        break
      case 'insights':
        commands.executeCommand('symbol-mapping-conversion.showInsights')
        break
      case 'create-mapping':
        commands.executeCommand('symbol-mapping-conversion.createMappingFromSelection')
        break
      case 'last-bulk':
        if (lastBulkInfo) {
          window.showInformationMessage(`Last skipped change (${lastBulkInfo.languageId}): ${lastBulkInfo.reason}`)
        }
        break
      case 'pause':
        await promptPauseBulkDetection()
        break
      case 'resume-pause':
        resumeBulkDetection()
        window.showInformationMessage('Bulk detection resumed.')
        break
      case 'clear-stats':
        clearBulkStatsData()
        break
      case 'manage-overrides':
        await manageBulkOverrides()
        break
      case 'skip-history':
        await showSkipHistory()
        break
    }
  }))

  disposes.push(registerCommand('symbol-mapping-conversion.createMappingFromSelection', async () => {
    await createMappingFromSelection()
  }))
  disposes.push(registerCommand('symbol-mapping-conversion.showInsights', async () => {
    await showBulkInsights()
  }))
  disposes.push(registerCommand('symbol-mapping-conversion.clearBulkStats', () => {
    clearBulkStatsData()
  }))
  disposes.push(registerCommand('symbol-mapping-conversion.pauseBulkDetection', async () => {
    await promptPauseBulkDetection()
  }))
  disposes.push(registerCommand('symbol-mapping-conversion.manageBulkOverrides', async () => {
    await manageBulkOverrides()
  }))
  disposes.push(registerCommand('symbol-mapping-conversion.showSkipHistory', async () => {
    await showSkipHistory()
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

    const { languageId } = e.document

    if (!languageId || extLanguage.includes(languageId))
      return

    const changes = e.contentChanges

    // 改进的批量更新检测
    if (!isBulkDetectionPaused()) {
      const bulkReason = detectBulkUpdate(changes, changeTracker, getLanguageBulkConfig(languageId, bulkDetectionConfig))
      if (bulkReason) {
        logBulkSkip(languageId, bulkReason)
        showTemporaryTooltip(`Symbol conversion skipped (${languageId}): ${bulkReason}`)
        if (notificationConfig.showSkipToasts)
          window.showInformationMessage(`Symbol conversion skipped in ${languageId}: ${bulkReason}`)
        return
      }
    }

    const filteredChanges = changes.filter((c: any) => c.text.trim())
    if (!filteredChanges.length)
      return

    // 清理之前的定时器
    clearDebounceTimer()

    debounceTimer = setTimeout(async () => {
      await processTextChange(filteredChanges, languageId)
    }, 50)
  }))

  // 改进的批量更新检测函数
  function detectBulkUpdate(changes: readonly TextDocumentContentChangeEvent[], tracker: typeof changeTracker, config: BulkDetectionConfig): string | null {
    const now = Date.now()
    const totalTextLength = changes.reduce((sum, change) => sum + change.text.length, 0)

    // 更新跟踪器
    tracker.recentChanges.push({ time: now, size: totalTextLength })
    // 只保留最近1秒的变更记录
    tracker.recentChanges = tracker.recentChanges.filter(change => now - change.time < 1000)

    // 策略1: 变更数量 - 放宽限制
    if (config.maxChanges > 0 && changes.length > config.maxChanges) {
      return `change count ${changes.length} > maxChanges ${config.maxChanges}`
    }

    // 策略2: 单个变更内容 - 放宽限制，但排除正常粘贴
    for (const change of changes) {
      // 单次变更超过1000个字符才认为是批量操作
      if (config.maxCharsPerChange > 0 && change.text.length > config.maxCharsPerChange) {
        return `single change size ${change.text.length} > maxCharsPerChange ${config.maxCharsPerChange}`
      }

      // 变更涉及超过20行
      if (config.maxLinesPerChange > 0 && change.range && change.range.end.line - change.range.start.line > config.maxLinesPerChange) {
        return `line span ${change.range.end.line - change.range.start.line} > maxLinesPerChange ${config.maxLinesPerChange}`
      }
    }

    // 策略3: 1秒内的累计变更大小
    const recentTotalSize = tracker.recentChanges.reduce((sum, change) => sum + change.size, 0)
    if (config.maxRecentSize > 0 && recentTotalSize > config.maxRecentSize) {
      return `recent change size ${recentTotalSize} > maxRecentSize ${config.maxRecentSize}`
    }

    // 策略4: 检测全文替换 - 更精确的判断
    const hasFullDocumentReplace = changes.some((change) => {
      return change.range
        && change.range.start.line === 0
        && change.range.start.character === 0
        && change.text.split('\n').length > Math.max(config.minFullReplaceLines, 0) // 超过给定行数才认为是全文替换
    })

    if (config.minFullReplaceLines > 0 && hasFullDocumentReplace) {
      return `change length exceeds full replace threshold ${config.minFullReplaceLines} lines`
    }

    // 策略5: 高频变更检测 - 改进时间窗口逻辑
    if (config.highFrequencyInterval > 0 && now - tracker.lastChangeTime < config.highFrequencyInterval) {
      tracker.changeCount++
      if (config.highFrequencyChanges > 0 && tracker.changeCount > config.highFrequencyChanges) {
        return `high-frequency edits exceeded ${config.highFrequencyChanges} within ${config.highFrequencyInterval}ms`
      }
    }
    else {
      tracker.changeCount = config.highFrequencyInterval > 0 && config.highFrequencyChanges > 0 ? 1 : 0
    }
    tracker.lastChangeTime = now

    return null
  }

  // 改进的文本处理函数
  async function processTextChange(changes: any[], language: string) {
    if (isProcessing)
      return

    isProcessing = true

    try {
      // 获取对应语言的配置
      const languageEntries = getLanguageEntries(language)
      const updateLists: any = []
      let clipboardText: string | undefined

      if (!copyMap) {
        try {
          clipboardText = await getCopyText()
        }
        catch {
          clipboardText = undefined
        }
      }

      for (const c of changes) {
        let text = c.text
        let offset = 0

        if (!copyMap && clipboardText !== undefined && clipboardText === text)
          continue

        languageEntries.forEach((entry) => {
          if (text.length < entry.length && entry.key.endsWith(text)) {
            // 支持少于匹配项，往前贪婪获取字符串
            offset = entry.length - text.length
            const lineText = getLineText(c.range.start.line)!
            const start = c.range.start.character - offset
            if (start < 0)
              return
            if (lineText.slice(start, c.range.start.character + text.length) !== entry.key)
              return
            text = lineText.slice(start, c.range.start.character + text.length)
          }
          entry.pattern.lastIndex = 0
          text = text.replace(entry.pattern, entry.replacement)
        })

        if (text !== c.text) {
          const start = getPosition(c.rangeOffset - offset)
          const end = getPosition(c.rangeOffset + c.text.length)
          const range = createRange(start.position, end.position)

          const matchesSelectionBoundary = preSelect
            && ((preSelect.line === c.range.end.line && preSelect.character === c.range.end.character)
              || (preSelect.line === c.range.start.line && preSelect.character === c.range.start.character))
          const hasPairMapping = pairMap[text] !== undefined
            || text.includes('$1')

          if (matchesSelectionBoundary && hasPairMapping) {
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
              text = text + selectText + (pairMap[text] ?? text)
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

  function getLanguageEntries(language: string) {
    if (!mappingCache.has(language)) {
      const mergedMappings: Record<string, string> = {
        ...base,
        ...(mappings.base ?? {}),
        ...(mappings[language] ?? {}),
      }
      const entries: MappingEntry[] = Object.entries(mergedMappings).map(([key, replacement]) => ({
        key,
        replacement,
        length: key.length,
        pattern: new RegExp(escapeRegExp(key), 'gm'),
      }))
      mappingCache.set(language, entries)
    }
    return mappingCache.get(language)!
  }

  disposes.push(addEventListener('config-change', () => {
    const config = getConfig()
    mappings = config.mappings
    isEnable = config.isEnable
    extLanguage = config.extLanguage
    copyMap = config.copyMap
    pairMap = {
      ...defaultPairMappings,
      ...config.pairMappings,
    }
    bulkDetectionConfig = {
      ...defaultBulkDetection,
      ...config.bulkDetection,
    }
    bulkDetectionOverrides = config.bulkDetectionOverrides
    autoPauseConfig = {
      ...defaultAutoPause,
      ...config.autoPause,
    }
    autoActionConfig = {
      ...defaultAutoAction,
      ...config.autoActionOnSkip,
    }
    notificationConfig = {
      ...defaultNotifications,
      ...config.notifications,
    }
    autoRemediationConfig = {
      ...defaultAutoRemediation,
      ...config.autoRemediation,
    }
    mappingCache.clear()
    updateStatusBar()
  }))

  async function createMappingFromSelection() {
    const editor = window.activeTextEditor
    const defaultKey = editor && !editor.selection.isEmpty ? editor.document.getText(editor.selection) : ''
    const key = await window.showInputBox({
      value: defaultKey,
      prompt: 'Original text to match',
      placeHolder: 'Original text',
      ignoreFocusOut: true,
      validateInput: value => (value && value.length ? undefined : 'Please enter the text to match'),
    })
    if (!key)
      return
    const replacement = await window.showInputBox({
      prompt: `Replacement for "${key}" (leave empty to delete)`,
      placeHolder: 'Replacement text',
      ignoreFocusOut: true,
      value: '',
    })
    if (replacement === undefined)
      return
    const scope = await pickMappingScope(editor?.document.languageId)
    if (!scope)
      return
    const normalizedScope = scope || 'base'
    const nextMappings: MappingConfig = {
      ...mappings,
      base: { ...(mappings.base ?? {}) },
    }
    if (normalizedScope === 'base') {
      nextMappings.base = {
        ...nextMappings.base,
        [key]: replacement,
      }
    }
    else {
      nextMappings[normalizedScope] = {
        ...(mappings[normalizedScope] ?? {}),
        [key]: replacement,
      }
    }
    await setConfiguration('symbol-mapping-conversion.mappings', nextMappings, true)
    mappings = nextMappings
    mappingCache.clear()
    window.showInformationMessage(`Mapping saved for ${normalizedScope === 'base' ? 'base' : normalizedScope}: "${key}" → "${replacement}"`)
  }

  async function pickMappingScope(activeLanguage?: string | null) {
    const languageSet = new Set<string>()
    if (activeLanguage)
      languageSet.add(activeLanguage)
    Object.keys(mappings ?? {}).forEach((lang) => {
      if (lang && lang !== 'base')
        languageSet.add(lang)
    })
    const languageEntries = Array.from(languageSet).sort((a, b) => a.localeCompare(b))
    const picks: Array<{ label: string, description?: string, value: string }> = [
      {
        label: '$(globe) Base (all languages)',
        description: 'Applies to every language',
        value: 'base',
      },
    ]
    if (activeLanguage) {
      picks.push({
        label: `$(file-code) Current language (${activeLanguage})`,
        value: activeLanguage,
      })
    }
    for (const lang of languageEntries) {
      if (lang === activeLanguage)
        continue
      picks.push({
        label: `$(code) ${lang}`,
        value: lang,
      })
    }
    picks.push({
      label: '$(add) Custom language id…',
      value: '__custom',
    })
    const pick = await window.showQuickPick(picks, {
      placeHolder: 'Apply this mapping to…',
      ignoreFocusOut: true,
    })
    if (!pick)
      return null
    if (pick.value === '__custom') {
      const custom = await window.showInputBox({
        prompt: 'Enter language id (e.g. javascript, rust)',
        value: activeLanguage ?? '',
        ignoreFocusOut: true,
        validateInput: value => (value && value.length ? undefined : 'Language id is required'),
      })
      return custom ?? null
    }
    return pick.value
  }

  async function showBulkInsights() {
    const entries = Object.entries(bulkStats)
    if (!entries.length) {
      window.showInformationMessage('No bulk-detection data yet. Trigger some edits first 😊')
      return
    }
    const sorted = entries.sort((a, b) => b[1].count - a[1].count)
    const picks: Array<{ label: string, description: string, detail: string, value: string, settingKey?: string }> = sorted.map(([reason, stat]) => {
      const hint = getBulkHint(reason)
      return {
        label: `$(graph) ${hint?.title ?? reason}`,
        description: `Triggered ${stat.count}× (last ${stat.lastLanguage} @ ${stat.lastTimestamp})`,
        detail: hint?.suggestion ?? reason,
        value: reason,
        settingKey: hint?.settingKey,
      }
    })
    picks.push({
      label: '$(trash) Clear stats',
      description: 'Reset collected bulk-detection data',
      detail: '',
      value: '__clear',
    })
    const pick = await window.showQuickPick(picks, {
      placeHolder: 'Bulk-detection insights',
      ignoreFocusOut: true,
    })
    if (!pick)
      return
    if (pick.value === '__clear') {
      clearBulkStatsData()
      return
    }
    if (pick.settingKey) {
      const action = await window.showQuickPick([
        { label: '$(triangle-right) Relax threshold automatically', value: 'auto' },
        { label: '$(gear) Open setting to fine-tune', value: 'open' },
      ], {
        placeHolder: 'How would you like to handle this threshold?',
        ignoreFocusOut: true,
      })
      if (action?.value === 'auto')
        await relaxBulkThreshold(pick.settingKey)
      else if (action?.value === 'open')
        commands.executeCommand('workbench.action.openSettings', pick.settingKey)
    }
    else {
      window.showInformationMessage(pick.detail || pick.value)
    }
  }

  async function promptPauseBulkDetection() {
    const durationOptions = [
      { label: '$(clock) 1 minute', detail: 'Great for quick bursts', value: 60_000 },
      { label: '$(clock) 5 minutes', detail: 'Take a short break', value: 5 * 60_000 },
      { label: '$(clock) 15 minutes', detail: 'Longer paste/format session', value: 15 * 60_000 },
      { label: '$(debug-pause) Until restart', detail: 'Resume manually when ready', value: null },
    ]
    const pick = await window.showQuickPick(durationOptions, {
      placeHolder: 'Pause bulk detection for…',
      ignoreFocusOut: true,
    })
    if (!pick)
      return
    pauseBulkDetection(pick.value)
    window.showInformationMessage(`Bulk detection paused${pick.value ? ` for ${formatRemaining(pick.value)}.` : ' until restart.'}`)
  }

  async function maybePromptBulkAdjustment(reason: string) {
    const stat = bulkStats[reason]
    if (!stat)
      return
    const lastPrompt = bulkPromptProgress.get(reason) ?? 0
    const milestone = BULK_PROMPT_MILESTONES.find(m => m > lastPrompt && stat.count >= m)
    if (!milestone)
      return
    bulkPromptProgress.set(reason, milestone)
    const hint = getBulkHint(reason)
    const actions: string[] = []
    if (hint?.settingKey) {
      actions.push('Relax threshold')
      actions.push('Open setting')
    }
    actions.push('Show insights')
    const message = hint
      ? `Symbol conversion skipped ${stat.count}× because "${hint.title}".`
      : `Symbol conversion skipped ${stat.count}× for "${reason}".`
    const response = await window.showInformationMessage(message, ...actions)
    if (response === 'Relax threshold' && hint?.settingKey) {
      await relaxBulkThreshold(hint.settingKey)
    }
    else if (response === 'Open setting' && hint?.settingKey) {
      commands.executeCommand('workbench.action.openSettings', hint.settingKey)
    }
    else if (response === 'Show insights') {
      commands.executeCommand('symbol-mapping-conversion.showInsights')
    }
  }

  async function maybeAutoPauseOnSkip(reason: string) {
    if (!autoPauseConfig.enabled || autoPauseConfig.triggerCount <= 0 || isBulkDetectionPaused())
      return
    const stat = bulkStats[reason]
    if (!stat)
      return
    const lastTrigger = autoPauseProgress.get(reason) ?? 0
    if (stat.count - lastTrigger < autoPauseConfig.triggerCount)
      return
    autoPauseProgress.set(reason, stat.count)
    const duration = autoPauseConfig.durationMs && autoPauseConfig.durationMs > 0 ? autoPauseConfig.durationMs : null
    pauseBulkDetection(duration)
    const hint = getBulkHint(reason)
    window.showInformationMessage(`Bulk detection auto-paused${duration ? ` for ${formatRemaining(duration)}` : ' until you resume'} because "${hint?.title ?? reason}".`)
  }

  async function maybeRunAutoAction(languageId: string, reason: string) {
    if (!autoActionConfig.enabled || !autoActionConfig.snippet.trim())
      return
    if (autoActionConfig.languageFilter?.length && !autoActionConfig.languageFilter.includes(languageId))
      return
    const editor = window.activeTextEditor
    if (!editor || editor.document.languageId !== languageId)
      return
    const snippet = autoActionConfig.includeReasonVariable
      ? {
          snippet: autoActionConfig.snippet.replace(/\$REASON\b/g, reason),
        }
      : { snippet: autoActionConfig.snippet }
    await commands.executeCommand('editor.action.insertSnippet', {
      snippet: snippet.snippet,
    })
  }

  async function relaxBulkThreshold(settingKey: string, multiplier = 1.5) {
    const key = settingKey.split('.').pop() as keyof BulkDetectionConfig | undefined
    if (!key)
      return
    const overrides = getConfiguration('symbol-mapping-conversion.bulkDetectionOverrides') ?? {}
    const targetLanguage = lastBulkInfo?.languageId
    const globalConfig = getConfiguration('symbol-mapping-conversion.bulkDetection') ?? {}

    const currentValue = targetLanguage && overrides[targetLanguage]?.[key] !== undefined
      ? overrides[targetLanguage][key]
      : typeof globalConfig[key] === 'number'
        ? globalConfig[key]
        : bulkDetectionConfig[key] ?? defaultBulkDetection[key]

    const baseline = currentValue && currentValue > 0 ? currentValue : defaultBulkDetection[key] || 1
    const nextValue = Math.max(1, Math.round(baseline * multiplier))

    if (targetLanguage) {
      overrides[targetLanguage] = {
        ...(overrides[targetLanguage] ?? {}),
        [key]: nextValue,
      }
      await setConfiguration('symbol-mapping-conversion.bulkDetectionOverrides', overrides, true)
    }
    else {
      const nextConfig = {
        ...globalConfig,
        [key]: nextValue,
      }
      await setConfiguration('symbol-mapping-conversion.bulkDetection', nextConfig, true)
    }

    const updatedGlobal = getConfiguration('symbol-mapping-conversion.bulkDetection') ?? {}
    const updatedOverrides = getConfiguration('symbol-mapping-conversion.bulkDetectionOverrides') ?? {}
    bulkDetectionConfig = {
      ...defaultBulkDetection,
      ...updatedGlobal,
    }
    bulkDetectionOverrides = updatedOverrides
    window.showInformationMessage(`${targetLanguage ? `[${targetLanguage}] ` : ''}Set ${key} to ${nextValue}.`)
  }

  function getLanguageBulkConfig(language: string, baseConfig: BulkDetectionConfig): BulkDetectionConfig {
    const overrides = bulkDetectionOverrides?.[language]
    if (!overrides)
      return baseConfig
    return {
      ...baseConfig,
      ...overrides,
    }
  }

  async function manageBulkOverrides() {
    const overrides = getConfiguration('symbol-mapping-conversion.bulkDetectionOverrides') ?? {}
    const languages = Object.keys(overrides)
    const picks: Array<{ label: string, description?: string, detail?: string, value: string }> = languages.map((lang) => {
      const props = overrides[lang]
      const summary = Object.entries(props).map(([k, v]) => `${k}: ${v}`).join(', ')
      return {
        label: `$(code) ${lang}`,
        description: summary || 'inherit all defaults',
        value: lang,
      }
    })
    picks.push({
      label: '$(add) Add language override',
      description: 'Create overrides for another language id',
      value: '__add',
    })
    const pick = await window.showQuickPick(picks, {
      placeHolder: 'Select a language to manage overrides',
      ignoreFocusOut: true,
    })
    if (!pick)
      return
    if (pick.value === '__add') {
      const lang = await window.showInputBox({
        prompt: 'Language id (e.g. javascript, rust)',
        ignoreFocusOut: true,
        validateInput: value => (value?.trim() ? undefined : 'Language id is required'),
      })
      if (!lang)
        return
      await editLanguageOverride(lang.trim())
    }
    else {
      await editLanguageOverride(pick.value)
    }
  }

  async function editLanguageOverride(language: string) {
    const overrides = getConfiguration('symbol-mapping-conversion.bulkDetectionOverrides') ?? {}
    const current = overrides[language] ?? {}
    const propertyOptions: Array<{ label: string, description?: string, value: keyof BulkDetectionConfig | '__remove' }> = [
      { label: 'maxChanges', value: 'maxChanges', description: describeOverride(current.maxChanges) },
      { label: 'maxCharsPerChange', value: 'maxCharsPerChange', description: describeOverride(current.maxCharsPerChange) },
      { label: 'maxLinesPerChange', value: 'maxLinesPerChange', description: describeOverride(current.maxLinesPerChange) },
      { label: 'maxRecentSize', value: 'maxRecentSize', description: describeOverride(current.maxRecentSize) },
      { label: 'minFullReplaceLines', value: 'minFullReplaceLines', description: describeOverride(current.minFullReplaceLines) },
      { label: 'highFrequencyInterval', value: 'highFrequencyInterval', description: describeOverride(current.highFrequencyInterval) },
      { label: 'highFrequencyChanges', value: 'highFrequencyChanges', description: describeOverride(current.highFrequencyChanges) },
      { label: '$(trash) Remove this language override', value: '__remove', description: '' },
    ]
    const selection = await window.showQuickPick(propertyOptions, {
      placeHolder: `Manage overrides for ${language}`,
      ignoreFocusOut: true,
    })
    if (!selection)
      return
    if (selection.value === '__remove') {
      if (overrides[language]) {
        delete overrides[language]
        await setConfiguration('symbol-mapping-conversion.bulkDetectionOverrides', overrides, true)
        bulkDetectionOverrides = overrides
        window.showInformationMessage(`Removed overrides for ${language}.`)
      }
      return
    }
    const key = selection.value
    const currentValue = current[key]
    const input = await window.showInputBox({
      prompt: `Override value for ${key} (leave empty to inherit)`,
      value: currentValue !== undefined ? String(currentValue) : '',
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value?.trim())
          return undefined
        return Number.isNaN(Number(value)) ? 'Enter a number' : undefined
      },
    })
    if (input === undefined)
      return
    if (!overrides[language])
      overrides[language] = {}
    if (input.trim() === '') {
      delete overrides[language][key]
      if (!Object.keys(overrides[language]).length)
        delete overrides[language]
      window.showInformationMessage(`Cleared ${key} override for ${language}.`)
    }
    else {
      overrides[language][key] = Number(input)
      window.showInformationMessage(`Set ${key} override for ${language} to ${input}.`)
    }
    await setConfiguration('symbol-mapping-conversion.bulkDetectionOverrides', overrides, true)
    bulkDetectionOverrides = overrides
  }

  function describeOverride(value: number | undefined) {
    return value !== undefined ? `override: ${value}` : 'inherit'
  }

  async function maybeRunAutoRemediation(languageId: string, reason: string) {
    if (!autoRemediationConfig.enabled || autoRemediationConfig.triggerCount <= 0)
      return
    const stat = bulkStats[reason]
    if (!stat || stat.count < autoRemediationConfig.triggerCount)
      return
    if (autoRemediationConfig.languageFilter?.length && !autoRemediationConfig.languageFilter.includes(languageId))
      return
    const editor = window.activeTextEditor
    if (!editor || editor.document.languageId !== languageId)
      return
    if (autoRemediationConfig.snippetKey) {
      await commands.executeCommand('editor.action.insertSnippet', {
        name: autoRemediationConfig.snippetKey,
      })
    }
    else if (autoRemediationConfig.snippet.trim()) {
      await commands.executeCommand('editor.action.insertSnippet', {
        snippet: autoRemediationConfig.snippet.replace(/\$REASON\b/g, reason),
      })
    }
    else {
      return
    }
    if (autoRemediationConfig.pauseAfterRun)
      pauseBulkDetection(autoPauseConfig.durationMs)
  }

  // 确保资源清理
  disposes.push({
    dispose: () => {
      clearDebounceTimer()
      isProcessing = false
      changeTracker.recentChanges = []
      if (tooltipResetTimer) {
        clearTimeout(tooltipResetTimer)
        tooltipResetTimer = null
      }
      if (bulkDetectionPauseTimer) {
        clearTimeout(bulkDetectionPauseTimer)
        bulkDetectionPauseTimer = null
      }
    },
  })

  context.subscriptions.push(...disposes)
}

export function deactivate() {

}

function getConfig() {
  const mappings = getConfiguration('symbol-mapping-conversion.mappings') as MappingConfig | undefined
  const extLanguage = getConfiguration('symbol-mapping-conversion.extLanguage')
  const isEnable = getConfiguration('symbol-mapping-conversion.isEnable')
  const copyMap = getConfiguration('symbol-mapping-conversion.copyMap')
  const pairMappings = getConfiguration('symbol-mapping-conversion.pairMappings')
  const bulkDetection = getConfiguration('symbol-mapping-conversion.bulkDetection')
  const bulkDetectionOverrides = getConfiguration('symbol-mapping-conversion.bulkDetectionOverrides') as BulkDetectionOverride | undefined
  const autoPause = getConfiguration('symbol-mapping-conversion.autoPause') as AutoPauseConfig | undefined
  const autoActionOnSkip = getConfiguration('symbol-mapping-conversion.autoActionOnSkip') as AutoActionConfig | undefined
  const notifications = getConfiguration('symbol-mapping-conversion.notifications') as NotificationConfig | undefined
  return {
    mappings: mappings ?? {},
    extLanguage: extLanguage ?? [],
    isEnable: isEnable ?? true,
    copyMap: copyMap ?? false,
    pairMappings: pairMappings ?? defaultPairMappings,
    bulkDetection: bulkDetection ?? defaultBulkDetection,
    bulkDetectionOverrides: bulkDetectionOverrides ?? {},
    autoPause: autoPause ?? defaultAutoPause,
    autoActionOnSkip: autoActionOnSkip ?? defaultAutoAction,
    notifications: notifications ?? defaultNotifications,
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getBulkHint(reason: string) {
  const hints = [
    {
      match: 'change count',
      title: 'Too many edits at once',
      settingKey: 'symbol-mapping-conversion.bulkDetection.maxChanges',
      suggestion: 'Increase maxChanges to allow more simultaneous edits before skipping.',
    },
    {
      match: 'single change size',
      title: 'Single change too large',
      settingKey: 'symbol-mapping-conversion.bulkDetection.maxCharsPerChange',
      suggestion: 'Raise maxCharsPerChange if large paste operations should still convert.',
    },
    {
      match: 'line span',
      title: 'Edit spans lots of lines',
      settingKey: 'symbol-mapping-conversion.bulkDetection.maxLinesPerChange',
      suggestion: 'Increase maxLinesPerChange to tolerate multi-line replacements.',
    },
    {
      match: 'recent change size',
      title: 'Burst of edits detected',
      settingKey: 'symbol-mapping-conversion.bulkDetection.maxRecentSize',
      suggestion: 'Bump maxRecentSize if rapid typing or macros should still run.',
    },
    {
      match: 'full replace threshold',
      title: 'Looks like full document replace',
      settingKey: 'symbol-mapping-conversion.bulkDetection.minFullReplaceLines',
      suggestion: 'Lower minFullReplaceLines if whole-file operations should convert.',
    },
    {
      match: 'high-frequency edits',
      title: 'High-frequency edit storm',
      settingKey: 'symbol-mapping-conversion.bulkDetection.highFrequencyChanges',
      suggestion: 'Increase highFrequencyChanges or interval to avoid throttling fast typing.',
    },
  ]
  return hints.find(hint => reason.includes(hint.match)) || null
}
