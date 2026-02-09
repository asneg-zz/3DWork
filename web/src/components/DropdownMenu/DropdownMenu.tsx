import { useState, useRef, useEffect, type ReactNode, type CSSProperties } from "react";

const wrapperStyle: CSSProperties = {
  position: "relative",
  display: "inline-block",
};

const triggerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "4px",
  padding: "6px 12px",
  background: "#2a2a30",
  color: "#ddd",
  border: "1px solid #444",
  borderRadius: "4px",
  cursor: "pointer",
  fontSize: "13px",
};

const triggerOpenStyle: CSSProperties = {
  ...triggerStyle,
  background: "#3a3a44",
  borderColor: "#5a7aaa",
};

const panelStyle: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 4px)",
  left: "0",
  minWidth: "180px",
  background: "#2a2a30",
  border: "1px solid #444",
  borderRadius: "6px",
  boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
  zIndex: 1000,
  padding: "4px 0",
};

const itemStyle: CSSProperties = {
  display: "block",
  width: "100%",
  padding: "8px 14px",
  background: "none",
  color: "#ddd",
  border: "none",
  textAlign: "left",
  cursor: "pointer",
  fontSize: "13px",
};

interface DropdownMenuProps {
  label: string;
  children: ReactNode;
}

export function DropdownMenu({ label, children }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div style={wrapperStyle} ref={ref}>
      <button
        style={open ? triggerOpenStyle : triggerStyle}
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        {label} <span style={{ fontSize: "10px", opacity: 0.7 }}>&#9662;</span>
      </button>
      {open && (
        <div style={panelStyle} onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

const itemDisabledStyle: CSSProperties = {
  ...itemStyle,
  color: "#666",
  cursor: "default",
};

export function DropdownItem({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      style={disabled ? itemDisabledStyle : itemStyle}
      onClick={disabled ? undefined : onClick}
      type="button"
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = "#3a3a44";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "none";
      }}
    >
      {children}
    </button>
  );
}
