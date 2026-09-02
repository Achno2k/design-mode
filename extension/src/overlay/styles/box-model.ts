/**
 * The margin and padding bands shown while a spacing row is being edited.
 *
 * Devtools colours, because they are the ones people already read: orange for
 * margin, green for padding. Translucent so the page stays legible underneath,
 * and never with a border, which would read as an extra edge on the element.
 * A negative margin gets hatching so it cannot be mistaken for a real gap.
 */
export const BOX_MODEL_CSS = `
.box-band {
  position: fixed;
  box-sizing: border-box;
  pointer-events: none;
}

.box-band--margin { background: rgba(246, 178, 107, 0.4); }
.box-band--padding { background: rgba(126, 231, 135, 0.4); }

.box-band--negative {
  background: repeating-linear-gradient(
    135deg,
    rgba(246, 178, 107, 0.55) 0 3px,
    rgba(246, 178, 107, 0.1) 3px 6px
  );
}
`;
