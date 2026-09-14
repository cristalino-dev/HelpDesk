import type { PendingImage } from "@/components/ImageAttachments"
import { prepareAttachment } from "@/lib/prepareAttachment"

/**
 * Call this in the onPaste handler of any textarea that should accept
 * pasted images (screenshots, Ctrl+V from clipboard, etc.).
 *
 * If the clipboard contains an image:
 *   - Prevents the default paste action
 *   - Prepares it like any other attachment (lib/prepareAttachment.ts, v3.84):
 *     a 4K screenshot is shrunk, one still too large is refused
 *   - Calls onImage with the result, or onError with "name — reason"
 *
 * If the clipboard contains only text, does nothing — normal text
 * pasting proceeds as usual.
 */
export function handleImagePaste(
  e: React.ClipboardEvent<HTMLTextAreaElement>,
  onImage: (img: PendingImage) => void,
  onError?: (message: string) => void,
) {
  const items = Array.from(e.clipboardData.items)
  const imageItem = items.find(i => i.type.startsWith("image/"))
  if (!imageItem) return            // plain text paste — let it through
  e.preventDefault()
  const file = imageItem.getAsFile()
  if (!file) return
  void prepareAttachment(file, "screenshot.png").then(result => {
    if (result.ok) onImage(result.item)
    else if (onError) onError(`${result.name} — ${result.reason}`)
    else console.warn(`[paste] ${result.name}: ${result.reason}`)
  })
}
