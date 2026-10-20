# Expanded Editor

**English** · [Português](README.pt-BR.md)

A full-screen editor for Discord, made for long posts. I've been writing roleplay and fiction in Discord channels for years, and the little message box was never the place for it. So I made a [Vencord](https://vencord.dev) plugin that opens a real writing page over the chat, in Discord's own colors, and sends the text to the channel when you're done.

![Expanded Editor in action](media/demo.gif)

## How to use it

Open it from the **+** in the message box, under **Expanded editor**, or with **Ctrl+Shift+O**. The editor opens with whatever was already typed in the chat, and everything you write goes back to the message box when you close it with **Esc**.

## Features

1. **Write and Preview.** The preview shows the text exactly how Discord will render it, on the same lines you wrote it, so nothing jumps around. **Ctrl+Shift+P** switches.
2. **Formatting.** Bold, italic, underline, strikethrough, spoiler, code, heading (press again for smaller), subtext, quote, list, and an em dash for dialogue. **Ctrl+B**, **Ctrl+I** and **Ctrl+U** work, and **Ctrl+Z** undoes all of it properly.
3. **Counts.** Words, characters against Discord's limit, and reading time, in the footer.
4. **Word goals.** Three goals you set in the plugin settings (1,000, 2,000 and 2,500 by default). A thin bar fills as you write and tells you when you hit it.
5. **Calm mode.** **Ctrl+Shift+F** hides everything but the text. The line you're writing stays in the middle of the screen, and the top bar only comes back when you move the mouse. **Esc** leaves calm mode first, then closes.
6. **Typography.** Four faces (Discord, Serif, Writer and Mono) and sizes from 15 to 22 px, with the line width tuned for each one. Writer uses iA Writer Quattro if you have it installed.
7. **Long messages.** Over the limit (2,000 characters, or 4,000 with Nitro)? The button turns into **Send 2 messages** and the text gets split at a paragraph, then a line, a sentence, a word. It never cuts inside a code block. If you were replying to someone, only the first message goes out as the reply.
8. **Slowmode.** In a slowmode channel, the editor waits out the cooldown between messages and shows the countdown on the button.
9. **Nothing gets lost.** The draft is the same one as the message box and saves while you write. If Vesktop dies on you, the editor reopens with your text. If a send fails halfway, what went out stays sent and the rest stays in the editor so you can try again.
10. **Recent messages.** A side panel with the channel's latest messages and a button to quote them.

**Ctrl+Enter** sends.

## Install

Third-party Vencord plugins have to be built together with Vencord. You'll need [git](https://git-scm.com), [Node.js](https://nodejs.org) and [pnpm](https://pnpm.io).

```bash
git clone https://github.com/Vendicated/Vencord
cd Vencord
pnpm install --frozen-lockfile
git clone https://github.com/sum117/vencord-expanded-editor src/userplugins/expandedEditor
pnpm build
```

Then:

- **Regular Discord:** run `pnpm inject` and pick your install.
- **Vesktop:** run `echo {} > dist/package.json` (Vesktop only accepts the folder with that file in it), then go to Vesktop's settings, **Developer Options → Vencord Location**, and pick the `Vencord/dist` folder. Restart Vesktop.

Turn on **ExpandedEditor** in Discord's settings, under **Vencord → Plugins**, and you're set.

To update:

```bash
cd Vencord
git -C src/userplugins/expandedEditor pull
pnpm build
```

Then restart Discord.

## Limitations

1. Custom `:emoji:` names aren't converted when sending, and there's no mention autocomplete.
2. Attachments stay in the message box. The editor only sends text.
3. Discord cuts drafts at 4,500 characters, so the message box only shows the start of a longer post. The full text stays in the editor.

## Development

The tests run on Node 23 or newer, with no dependencies:

```bash
node --import ./test/resolve-ts.mjs --test test/
```

Licensed GPL-3.0-or-later, same as Vencord.

Made for people who write 3,000-word posts in a Discord channel and regret nothing.
