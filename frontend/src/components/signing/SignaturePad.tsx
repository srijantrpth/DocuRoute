import { useEffect, useRef, useState } from "react";

import { Button, Icon, Modal } from "../ui";
import { cx } from "../../lib/format";

const SCRIPT_STACK = '"Segoe Script", "Bradley Hand", "Snell Roundhand", cursive';

type Props = {
  open: boolean;
  onClose: () => void;
  onApply: (value: string) => void;
  defaultName: string;
  kind: "signature" | "initials";
};

/**
 * Produces either a typed signature (plain text, rendered in an italic serif by the
 * PDF pipeline) or a drawn one (a transparent PNG data URL the server stamps as an
 * image). Both travel over the same string field.
 */
export function SignaturePad({ open, onClose, onApply, defaultName, kind }: Props) {
  const [tab, setTab] = useState<"type" | "draw">("type");
  const [typed, setTyped] = useState("");
  const [hasInk, setHasInk] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const initials = defaultName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  useEffect(() => {
    if (open) {
      setTyped(kind === "initials" ? initials : defaultName);
      setHasInk(false);
    }
  }, [open, defaultName, initials, kind]);

  useEffect(() => {
    if (!open || tab !== "draw") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);
    context.lineWidth = 2.4;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#191c1e";
    setHasInk(false);
  }, [open, tab]);

  const pointFrom = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    last.current = pointFrom(event);
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = canvasRef.current?.getContext("2d");
    const from = last.current;
    if (!context || !from) return;
    const to = pointFrom(event);
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    last.current = to;
    setHasInk(true);
  };

  const end = () => {
    drawing.current = false;
    last.current = null;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const rect = canvas.getBoundingClientRect();
    context.clearRect(0, 0, rect.width, rect.height);
    setHasInk(false);
  };

  const apply = () => {
    if (tab === "type") {
      const value = typed.trim();
      if (value) onApply(value);
      return;
    }
    const canvas = canvasRef.current;
    if (canvas && hasInk) onApply(canvas.toDataURL("image/png"));
  };

  const canApply = tab === "type" ? typed.trim().length > 0 : hasInk;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={kind === "initials" ? "Add your initials" : "Adopt your signature"}
      description="Your typed or drawn mark is flattened into the executed PDF and recorded in the audit trail."
      width="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button icon="check" onClick={apply} disabled={!canApply}>
            Apply
          </Button>
        </>
      }
    >
      <div className="mb-4 inline-flex rounded-lg bg-surface-container-high p-1">
        {(["type", "draw"] as const).map((option) => (
          <button
            key={option}
            onClick={() => setTab(option)}
            className={cx(
              "flex items-center gap-1.5 rounded-md px-4 py-1.5 text-[13px] font-semibold transition-all",
              tab === option
                ? "bg-surface-container-lowest text-primary shadow-[var(--shadow-card)]"
                : "text-on-surface-variant hover:text-on-surface",
            )}
          >
            <Icon name={option === "type" ? "keyboard" : "gesture"} className="text-[16px]" />
            {option === "type" ? "Type" : "Draw"}
          </button>
        ))}
      </div>

      {tab === "type" ? (
        <div>
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            maxLength={kind === "initials" ? 6 : 60}
            placeholder={kind === "initials" ? initials || "AB" : defaultName || "Your name"}
            className="h-12 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-4 text-sm focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/12"
          />
          <div className="mt-3 grid h-32 place-items-center rounded-xl border border-outline-variant bg-surface-container-low">
            <span
              className="px-6 text-center text-4xl text-on-surface"
              style={{ fontFamily: SCRIPT_STACK }}
            >
              {typed || (kind === "initials" ? initials : defaultName)}
            </span>
          </div>
        </div>
      ) : (
        <div>
          <div className="relative rounded-xl border border-outline-variant bg-surface-container-lowest">
            <canvas
              ref={canvasRef}
              onPointerDown={start}
              onPointerMove={move}
              onPointerUp={end}
              onPointerLeave={end}
              className="block h-40 w-full touch-none rounded-xl"
            />
            <div className="pointer-events-none absolute inset-x-8 bottom-8 border-b border-dashed border-outline-variant" />
            {!hasInk && (
              <span className="pointer-events-none absolute inset-0 grid place-items-center text-[13px] text-outline">
                Draw with your mouse, trackpad, or finger
              </span>
            )}
          </div>
          <button
            onClick={clear}
            className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-on-surface-variant transition-colors hover:text-error"
          >
            <Icon name="ink_eraser" className="text-[15px]" />
            Clear
          </button>
        </div>
      )}

      <p className="mt-4 flex items-start gap-1.5 rounded-lg bg-surface-container-low p-3 text-[12px] leading-relaxed text-on-surface-variant">
        <Icon name="gavel" className="mt-px text-[15px]" />
        By applying this mark you agree it is the legal equivalent of your handwritten
        signature. Your IP address and timestamp are recorded in the tamper-evident
        audit trail.
      </p>
    </Modal>
  );
}
