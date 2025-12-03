<p align="center">
<img height="200" src="./icon.png" alt="smc">
</p>
<p align="center"> <a href="./README.md">English</a> | 简体中文</p>

符号映射转换的插件，可以自定义配置转换和对应的符号映射，可以配置生效的文件类型，和可以有一个底部栏状态切换开关和快捷键控制是否启用插件。

## 🚀 Feat

- 我们支持针对特定语言来定制转换，比如我在 `rust` 环境, 因为 `rust` 不能用 `'`, 我希望我输入的 `'` 转换成 `"`, 就可以使用下面的方式 👇

```json
{
  "symbol-mapping-conversion.mappings": {
    "rust": {
      "'": "\""
    },
    "base": {
      "cosnt": "const",
      "improt": "import",
      "Bearer ": ""
    }
  }
}
```

## 🤔️ Think

- 你可以发挥你的想象力，比如：我希望在输入到钱的时候，自动转换成💰，或者在输入到心的时候，自动转换成❤️，或者在输入到笑的时候，自动转换成😊，等等

- 你也可以作为中英文输入法时输入符号的解决方案

- 发挥你的想象力，可以做很多有趣的事情

## Base Default

```ts
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
```

## 💪 Power

- 可以通过底部栏的开关控制是否启动插件

- 可以通过`cmd + shift + p` 选择 Switch the symbol-mapping-conversion bottom status bar 命令去控制开关

- 点击底部状态栏可以打开快捷菜单（切换、打开设置或查看日志），批量跳过的原因会记录在日志中方便排查。

- 使用 `Create Mapping From Selection` 命令即可选中文本后直接选择替换内容和作用语言，免去手动修改 JSON。

- 通过 `Show Bulk Insights` 命令可以快速查看哪些批量检测规则频繁触发（统计会在多次会话间保留），并一键跳转到对应设置修改阈值；当同一规则多次触发时，系统会自动提示你使用“一键放宽阈值”（支持 `bulkDetectionOverrides` 针对特定语言单独调整）或打开设置，也可以启用 `autoPause` 让批量检测在多次跳过后自动暂停，此外还可以通过 `Pause Bulk Detection` 在大规模操作时临时跳过检测（暂停状态会在重载后持续到计时结束或手动恢复），配套的 `Clear Bulk Insights` 命令可以在需要时重置统计。

- 想进一步自动化？配置 `autoActionOnSkip`（支持 `$1`、`$REASON` 等 VS Code 片段占位符），这样只要在指定语言中发生跳过，就会自动执行该片段；配合 `notifications` 控制提示/通知，以及 `autoRemediation` 在跳过次数超限时自动执行修复片段（可指定 VS Code 片段名称）或暂停检测。

- 如果不想开通知也想回顾历史，可使用 `Show Skip History` 快速查看最近的跳过记录。

- 可以配置 `extLanguage` 去排除不希望在这些类型的文件中处理，比如 ['vue'] 等

- 自定义配置 `symbol-mapping-conversion.mappings`, 可以在 `settings` 去追加一些规则，比如你遇到 `¥`: `💰`，`爱心`:`💗`，`人民币`: `💴`，`美金`:`💵`

- 新增 `symbol-mapping-conversion.pairMappings` 可配置成你习惯的成对符号，选择文本时包裹就能按照你的偏好执行。

- 如果批量检测太敏感或不够敏感，可以通过 `symbol-mapping-conversion.bulkDetection` 调整阈值。

## :coffee:

[请我喝一杯咖啡](https://github.com/Simon-He95/sponsor)

## License

[MIT](./license)

## Sponsors

<p align="center">
  <a href="https://cdn.jsdelivr.net/gh/Simon-He95/sponsor/sponsors.svg">
    <img src="https://cdn.jsdelivr.net/gh/Simon-He95/sponsor/sponsors.png"/>
  </a>
</p>
