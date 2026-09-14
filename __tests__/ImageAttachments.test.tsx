/**
 * __tests__/ImageAttachments.test.tsx — the attachment picker and list (v3.84).
 *
 * Files as well as images; a stored file is a download link with its name and
 * size; and a file that cannot be attached is named on screen with the reason.
 * Until v3.84 anything that was not an image vanished without a word.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import ImageAttachments, { isImageAttachment } from "@/components/ImageAttachments"

const pick = (container: HTMLElement, files: File[]) => {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(input, { target: { files } })
}

describe("ImageAttachments — showing what is attached", () => {
  it("shows a stored PDF as a download link with its name and size", () => {
    render(<ImageAttachments readonly onChange={() => {}} images={[
      { dataUrl: "/api/attachments/a1", filename: "חשבונית.pdf", mimeType: "application/pdf", size: 250_000 },
    ]} />)
    const link = screen.getByRole("link")
    expect(link.getAttribute("href")).toBe("/api/attachments/a1")
    expect(link.getAttribute("download")).toBe("חשבונית.pdf")
    expect(link.textContent).toContain("חשבונית.pdf")
    expect(link.textContent).toContain("244 KB")
  })

  it("shows a stored image as a thumbnail", () => {
    render(<ImageAttachments readonly onChange={() => {}} images={[
      { dataUrl: "/api/attachments/a2", filename: "shot.png", mimeType: "image/png" },
    ]} />)
    expect(screen.getByRole("img").getAttribute("src")).toBe("/api/attachments/a2")
    expect(screen.queryByRole("link")).toBeNull()
  })

  it("treats a stored row with no type as an image — before v3.84 only images were allowed", () => {
    expect(isImageAttachment({ dataUrl: "/api/attachments/old" })).toBe(true)
    expect(isImageAttachment({ dataUrl: "data:application/pdf;base64,YQ==" })).toBe(false)
    expect(isImageAttachment({ dataUrl: "x", mimeType: "text/csv" })).toBe(false)
  })

  it("renders nothing read-only when there is nothing attached", () => {
    const { container } = render(<ImageAttachments readonly onChange={() => {}} images={[]} />)
    expect(container.innerHTML).toBe("")
  })
})

describe("ImageAttachments — adding", () => {
  it("offers every allowed type in the picker, and not SVG", () => {
    const { container } = render(<ImageAttachments images={[]} onChange={() => {}} />)
    const accept = (container.querySelector('input[type="file"]') as HTMLInputElement).accept
    expect(accept).toContain("application/pdf")
    expect(accept).toContain(".docx")
    expect(accept).toContain("image/png")
    expect(accept).not.toContain("svg")
  })

  it("adds an allowed file", async () => {
    const onChange = jest.fn()
    const { container } = render(<ImageAttachments images={[]} onChange={onChange} />)
    pick(container, [new File(["%PDF"], "a.pdf", { type: "application/pdf" })])
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    expect(onChange.mock.calls[0][0]).toEqual([expect.objectContaining({ filename: "a.pdf", mimeType: "application/pdf" })])
  })

  it("adds several files in one go, keeping them all", async () => {
    const onChange = jest.fn()
    const { container } = render(<ImageAttachments images={[]} onChange={onChange} />)
    pick(container, [
      new File(["%PDF"], "a.pdf", { type: "application/pdf" }),
      new File(["png"], "b.png", { type: "image/png" }),
    ])
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(onChange.mock.calls[0][0].map((i: { filename: string }) => i.filename)).toEqual(["a.pdf", "b.png"])
  })

  it("names a file it will not attach, with the reason, instead of dropping it", async () => {
    const onChange = jest.fn()
    const onError = jest.fn()
    const { container } = render(<ImageAttachments images={[]} onChange={onChange} onError={onError} />)
    pick(container, [new File(["MZ"], "setup.exe", { type: "application/x-msdownload" })])
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("setup.exe"))
    expect(onChange).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith([expect.stringContaining("setup.exe")])
  })
})
