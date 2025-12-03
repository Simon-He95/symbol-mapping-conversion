<p align="center">
<img height="200" src="./icon.png" alt="smc">
</p>
<p align="center"> English | <a href="./README_zh.md">简体中文</a></p>

The plug-in for symbol mapping conversion can customize the configuration conversion and the corresponding symbol mapping, configure the effective file type, and can have a bottom bar status switch and shortcut key to control whether the plug-in is enabled.

## 🚀 Feat

- We support custom conversion for specific languages. For example, if I am in the `rust` environment, and `rust` cannot use `'`, I want the `'` I input to be converted to `"`. I can use the following method 👇

```
{
 "symbol-mapping-conversion.mappings": {
    "rust" :{
      "'":"\""
    },
    "base":{
      "cosnt": "const",
      "improt": "import",
      "Bearer ": ""
    }
  }
}
```

## 🤔️ Think

- You can use your imagination, for example: I want to automatically convert to 💰 when I enter money, or automatically convert to ❤️ when I enter the heart, or automatically convert to 😊 when I enter laughter, etc.

- You can also use it as a solution for input symbols in Chinese and English.

- Use your imagination and you can do a lot of interesting things.

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

- You can control whether to start the plug-in through the switch in the bottom bar.

- You can control the switch by selecting the Switch the symbol-mapping-conversion bottom status bar command by `cmd + shift + p`

- Click the bottom status bar entry to open a quick menu (toggle, open settings, or jump to the activity log). Bulk-skip reasons are recorded in that log for easy troubleshooting.

- Use the `Create Mapping From Selection` command to select some text, choose the replacement and target language/base, and save a new rule without editing JSON manually.

- Leverage `Show Bulk Insights` to review which bulk-detection rule skipped changes most often (the stats persist across sessions) and jump straight into the related settings with a single click—after repeated skips you'll automatically get a nudge with shortcuts to auto-relax the right threshold (either globally or per language via `bulkDetectionOverrides`), `autoPause` can pause detection automatically after enough skips, `Pause Bulk Detection` (which now persists across reloads until the timer expires or you resume manually) gives you a temporary escape hatch for large edits, and `Clear Bulk Insights` lets you reset the counters whenever you need a fresh baseline.

- Need more automation? Configure `autoActionOnSkip` with a VS Code snippet (supports `$1`, `$REASON`, etc.) so that whenever a skip happens in selected languages the snippet runs automatically, use the `notifications` block to toggle detailed tooltips/toasts, and enable `autoRemediation` if you want a cleanup snippet (either inline or via a named VS Code snippet) with optional pause to trigger after too many skips.

- Want to review what happened earlier? `Show Skip History` lists the latest skipped events when you don’t want to keep toast notifications enabled.

- You can configure `extLanguage` to exclude unwanted processing in these types of files, such as ['vue'], etc.

- Custom configuration `symbol-mapping-conversion.mappings`, you can add some rules in `settings`, for example, you encounter `¥`: `💰`, `love`:`💗`, `RMB`: `💴`, `US$`:`💵`

- Define your own pairing symbols through `symbol-mapping-conversion.pairMappings` so wrapping selections can follow exactly the brackets or quotes you prefer.

- Tweak the smarter bulk-detection guard with `symbol-mapping-conversion.bulkDetection` if the defaults are too sensitive (or not sensitive enough) for your workflow.

## :coffee:

[buy me a cup of coffee](https://github.com/Simon-He95/sponsor)

## License

[MIT](./license)

## Sponsors

<p align="center">
  <a href="https://cdn.jsdelivr.net/gh/Simon-He95/sponsor/sponsors.svg">
    <img src="https://cdn.jsdelivr.net/gh/Simon-He95/sponsor/sponsors.png"/>
  </a>
</p>
