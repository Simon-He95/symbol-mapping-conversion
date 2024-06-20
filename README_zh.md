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

- 可以配置 `extLanguage` 去排除不希望在这些类型的文件中处理，比如 ['vue'] 等

- 自定义配置 `symbol-mapping-conversion.mappings`, 可以在 `settings` 去追加一些规则，比如你遇到 `¥`: `💰`，`爱心`:`💗`，`人民币`: `💴`，`美金`:`💵`

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
