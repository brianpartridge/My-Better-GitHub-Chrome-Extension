# PR Tab Shortcuts

Personal Chrome extension. On any GitHub pull request page:

| Key | Tab           |
|-----|---------------|
| 1   | Conversation  |
| 2   | Commits       |
| 3   | Checks        |
| 4   | Files changed |

Shortcuts are ignored while typing in comment boxes or other inputs, and when a
modifier key (Ctrl/Cmd/Alt) is held.

## Viewed state in the file tree

On a PR's **Files changed** tab, the file tree on the left mirrors each file's
**Viewed** checkbox, and updates as you toggle it:

- Viewed files are dimmed with a green ✓; unviewed files show ○.
- Directories show a `viewed/total` count, and turn dim with a ✓ once every
  file under them is viewed.

## Install

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select this folder

## After editing the code

Click the reload icon (circular arrow) on this extension's card in
`chrome://extensions`, then refresh any open GitHub tabs.
