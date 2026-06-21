/**
 * __tests__/pasteImage.test.ts
 *
 * Unit tests for lib/pasteImage.ts — the textarea image-paste handler (v3.26).
 *
 * Covers:
 *   - image on clipboard → preventDefault + onImage called with a data URL
 *   - plain text on clipboard → no preventDefault, onImage NOT called
 *   - empty clipboard → no-op
 *   - missing filename falls back to "screenshot.png"
 */

import { handleImagePaste } from "@/lib/pasteImage"

type Item = { type: string; getAsFile: () => File | null }

function makeEvent(items: Item[]) {
  const preventDefault = jest.fn()
  const e = {
    clipboardData: { items: items as unknown as DataTransferItemList },
    preventDefault,
  } as unknown as React.ClipboardEvent<HTMLTextAreaElement>
  return { e, preventDefault }
}

function imageItem(name = "shot.png"): Item {
  const file = new File(["binary-bytes"], name, { type: "image/png" })
  return { type: "image/png", getAsFile: () => file }
}

function textItem(): Item {
  return { type: "text/plain", getAsFile: () => null }
}

describe("handleImagePaste", () => {
  it("intercepts an image: preventDefault + onImage with a data URL", async () => {
    const { e, preventDefault } = makeEvent([imageItem("diagram.png")])
    const arg = await new Promise<{ dataUrl: string; filename?: string }>(resolve => {
      handleImagePaste(e, resolve)
    })
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(arg.filename).toBe("diagram.png")
    expect(typeof arg.dataUrl).toBe("string")
    expect(arg.dataUrl.startsWith("data:")).toBe(true)
  })

  it("ignores a plain-text paste: no preventDefault, onImage not called", () => {
    // Text items never trigger the async FileReader path, so this is synchronous.
    const { e, preventDefault } = makeEvent([textItem()])
    const onImage = jest.fn()
    handleImagePaste(e, onImage)
    expect(preventDefault).not.toHaveBeenCalled()
    expect(onImage).not.toHaveBeenCalled()
  })

  it("is a no-op when the clipboard is empty", () => {
    const { e, preventDefault } = makeEvent([])
    const onImage = jest.fn()
    handleImagePaste(e, onImage)
    expect(preventDefault).not.toHaveBeenCalled()
    expect(onImage).not.toHaveBeenCalled()
  })

  it("falls back to screenshot.png when the pasted file has no name", async () => {
    const { e } = makeEvent([imageItem("")])
    const arg = await new Promise<{ filename?: string }>(resolve => {
      handleImagePaste(e, resolve)
    })
    expect(arg.filename).toBe("screenshot.png")
  })
})
