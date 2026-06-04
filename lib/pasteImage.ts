import type { PendingImage } from "@/components/ImageAttachments"

/**
 * Call this in the onPaste handler of any textarea that should accept
 * pasted images (screenshots, Ctrl+V from clipboard, etc.).
 *
 * If the clipboard contains an image:
 *   - Prevents the default paste action
 *   - Converts the image to a data URL
 *   - Calls onImage with the result
 *
 * If the clipboard contains only text, does nothing — normal text
 * pasting proceeds as usual.
 */
export function handleImagePaste(
  e: React.ClipboardEvent<HTMLTextAreaElement>,
  onImage: (img: PendingImage) => void,
) {
  const items = Array.from(e.clipboardData.items)
  const imageItem = items.find(i => i.type.startsWith("image/"))
  if (!imageItem) return            // plain text paste — let it through
  e.preventDefault()
  const file = imageItem.getAsFile()
  if (!file) return
  const reader = new FileReader()
  reader.onload = ev => {
    const dataUrl = ev.target?.result as string
    onImage({ dataUrl, filename: file.name || "screenshot.png" })
  }
  reader.readAsDataURL(file)
}
