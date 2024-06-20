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

- You can configure `extLanguage` to exclude unwanted processing in these types of files, such as ['vue'], etc.

- Custom configuration `symbol-mapping-conversion.mappings`, you can add some rules in `settings`, for example, you encounter `¥`: `💰`, `love`:`💗`, `RMB`: `💴`, `US$`:`💵`

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
