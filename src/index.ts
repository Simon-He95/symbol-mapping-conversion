import { getLocale, message } from '@vscode-use/utils'
import type { Disposable, ExtensionContext } from 'vscode'

export async function activate(context: ExtensionContext) {
  const disposes: Disposable[] = []
  const lan = getLocale()
  const isZh = lan.includes('zh')
  message.info(isZh ? '你好' : 'Hello')

  context.subscriptions.push(...disposes)
}

export function deactivate() {

}
