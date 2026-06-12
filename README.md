# 🧩 拼豆 · 等代码的解压时光

等 Claude Code / Codex 写代码的碎片时间里，用「照图拼豆」替代刷短视频。
还能实时显示每个 CC 窗口的进度，**代码跑完时多方式提醒你回来**。

## 这是什么 & 为什么

你有没有过这种时刻：把需求丢给 Claude Code，然后……开始等。

这几分钟说长不长说短不短。手很自然地摸向手机，点开抖音想「就看一条」——半小时后回过神，代码早跑完了，而你完全不记得刚才要干嘛。**短视频最擅长的就是把你的整块注意力剁碎。**

「拼豆」是给这段等待时间的一个温柔替代品：照着图案点亮格子，有柔和音效和完成撒花，纯粹解压、零负担。关键是它**和 Claude Code 联动**——代码跑完会四种方式同时提醒你，把你稳稳地拉回屏幕前。

玩，但别走神。这就是它的全部目的。

## 功能

- **照图拼豆**：选颜色 → 点亮对应编号的格子，柔和音效 + 完成撒花；某色拼完自动切到下一色。
- **无忧 / 自由两种模式**：默认「无忧」——拿错色温柔忽略、闭眼也拼不错；「自由」可放错并用「🔍 检查」找茬。
- **内置图案** 10 张（爱心 / 笑脸 / 小猫 / 蘑菇 / 草莓 …）+「🎲 随手拼一张」，开箱即玩。
- **上传图片自动转模板**：丢一张图，自动量化成拼豆网格。
- **顺手的操作**：滚轮 / 触控板 / 双指以光标为中心缩放，空格拖拽平移，`Ctrl/⌘+Z` 撤销；快捷键数字选色（连按即多位数，`1`→`2` = 12 号，够得到 10+ 的色号）· `[` `]` / `←` `→` 上下一色 · `E` 橡皮 · `H` 高亮 · `F` 适配。
- **进度自动保存**：随时关，下次接着拼；完成作品进「我的作品」廊，可一键 **💾 保存为图片**。
- **CC 联动面板**：多窗口同时显示「运行中 / 等你输入 / 已完成」+ 活跃脉搏 + 耗时。
- **完成提醒四合一**：系统桌面通知 · 提示音 · 页内横幅 · 标签标题闪烁。提示音独立于拼豆静音，**静音也照样响**。
- **防沉迷**：连续玩久了温和提醒（有 CC 会话在跑 →「去看看代码？」，没有 → 让你歇歇眼睛）。

## 启动

需要 Node（已自带，无需安装任何依赖）：

```bash
cd 拼豆
node server.js
```

然后浏览器打开 **http://localhost:4500** （建议收藏成书签，随手就开）。

> 换端口：`PINBEADS_PORT=5000 node server.js`，页面同步访问该端口。

只玩拼豆的话到这一步就够了。想要 **CC 联动**，再配置下面的 hooks。

## 配置 Claude Code 联动（hooks）

把以下内容合并进 `~/.claude/settings.json` 的 `hooks` 字段。
每个事件都用 curl 把 CC 传来的事件转发给本地桥（`|| true` 保证桥没开时也不会卡住 CC）：

```json
{
  "hooks": {
    "PostToolUse": [
      { "matcher": "*", "hooks": [ { "type": "command", "command": "curl -s -X POST -H 'content-type: application/json' --data-binary @- http://localhost:4500/hook || true" } ] }
    ],
    "Notification": [
      { "hooks": [ { "type": "command", "command": "curl -s -X POST -H 'content-type: application/json' --data-binary @- http://localhost:4500/hook || true" } ] }
    ],
    "Stop": [
      { "hooks": [ { "type": "command", "command": "curl -s -X POST -H 'content-type: application/json' --data-binary @- http://localhost:4500/hook || true" } ] }
    ]
  }
}
```

配置后，会话会在它**真正开始干活时**出现在面板：

- `PostToolUse` → 会话首次出现 + 活跃脉搏 + 工具调用计数
- `Notification` → 「🟡 等你输入」+ 提醒
- `Stop` → 「✅ 已完成」+ 四合一完成提醒

> **故意不挂 `SessionStart`**：因为机器上每个 claude 进程（其它 App 标签、后台/无头 `claude -p` 调用等）一启动就会触发它，导致面板冒出一堆"0 次工具调用"的空壳会话。改为只在真正有动作时上报，面板只显示在处理的聊天。
>
> 第一次完成提醒时浏览器会请求「通知权限」，允许后桌面通知才会弹。

## 会话标题

面板会显示每个会话的**真实聊天标题**（和 Claude Code 里一致，如「Bead puzzle game」），而不是一串 id。
标题来自 CC 桌面端的本地会话存储 `~/Library/Application Support/Claude/claude-code-sessions/**/local_*.json`
（读取其中的 `cliSessionId` 与 `title`）。桥每 8 秒刷新一次；标题是 CC 自动生成的，新会话可能要过一会儿才有，
没有时暂时显示 `#` + 会话 id 末 4 位。纯本地只读，拿不到时自动降级，不影响其它功能。

## 文件结构

```
拼豆/
  index.html   # 游戏本体（UI / Canvas / 音效 / CC 面板 / 存档 / 防沉迷，自包含）
  server.js    # 零依赖 Node 桥：serve 页面 + 收 hooks + SSE 实时推送
  sessions.js  # 会话状态机（纯函数，server 与测试共用）
  test/        # node:test 单测（node --test）
  docs/        # 设计文档与实现计划
  assets/      # 静态资源：Fusion Pixel 像素字体（OFL-1.1，许可证随附）
  README.md
```

## 说明

- 进度、设置、作品廊都存在浏览器 localStorage，纯本地，不上传任何数据。
- 桥只监听 `localhost`，仅本机可访问。
- 界面字体为开源像素字体「缝合怪 Fusion Pixel 12px」（OFL-1.1，文件与许可证在 `assets/fonts/`）；字体加载失败时自动回退系统字体。

## 许可证

[MIT](LICENSE)
