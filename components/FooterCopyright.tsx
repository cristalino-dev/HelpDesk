"use client"
import { useState } from "react"
import APP_VERSION from "@/lib/version"

interface Props {
  fixed?: boolean
  lightColor?: boolean
}

export default function FooterCopyright({ fixed = false, lightColor = false }: Props) {
  const [clicks, setClicks] = useState(0)

  const handleClick = () => {
    const next = clicks + 1
    setClicks(next)
    if (next >= 5) {
      window.open("https://www.linkedin.com/in/alonkerem/", "_blank", "noopener,noreferrer")
      setClicks(0)
    }
  }

  const style: React.CSSProperties = fixed
    ? { position: "fixed", bottom: "16px", left: "50%", transform: "translateX(-50%)", margin: 0, fontSize: "0.72rem", color: "rgba(255,255,255,0.35)", whiteSpace: "nowrap" }
    : { textAlign: "center", padding: "24px 0 32px", fontSize: "0.72rem", color: lightColor ? "rgba(255,255,255,0.35)" : "#d1d5db" }

  const Tag = fixed ? "p" : "footer"

  return (
    <Tag style={style}>
      v{APP_VERSION}{" "}
      <span
        onClick={handleClick}
        style={{ cursor: "default", userSelect: "none" }}
        title=""
      >
        &copy; 2026 AK
      </span>
    </Tag>
  )
}
