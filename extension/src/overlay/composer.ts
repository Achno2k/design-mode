import type { SelectionBox, StyleChange } from '../lib/protocol.ts';
import { fill, make, placeNear } from './dom.ts';
import { CHECK_ICON, CLOSE_ICON, SLIDERS_ICON } from './icons.ts';
import { createStyleEditor } from './style-editor.ts';

/** What the user produced for one element. */
export interface Draft {
  comment: string;
  styleChanges: StyleChange[];
}

/** The panel that opens on the element you clicked. */
export interface Composer {
  open(element: Element, description: string, onSubmit: (draft: Draft) => void): void;
  /** Open a comment-only composer beside a freehand drawing. */
  openAt(
    box: SelectionBox,
    description: string,
    onSubmit: (draft: Draft) => void,
    onDismiss: () => void,
  ): void;
  close(): void;
  isOpen(): boolean;
}

/**
 * Ask for a comment, and optionally let the user show what they mean.
 *
 * It opens as a single input. The sliders button expands a style editor whose
 * changes apply to the page immediately, so a change can be demonstrated rather
 * than described. Closing without submitting reverts every live edit.
 */
/** Height of the tray plus its offset, so the composer never lands on top of it. */
const TRAY_BAND = 190;

export function createComposer(layer: HTMLElement): Composer {
  const editor = createStyleEditor();

  const label = make('div', { className: 'composer__label' });
  const input = make('textarea', {
    className: 'composer__input',
    attributes: { rows: '1', placeholder: 'Describe the change…' },
  });

  const expand = iconButton('circle', SLIDERS_ICON, 'Edit styles live');
  const submit = iconButton('circle circle--accent', CHECK_ICON, 'Add selection');
  const dismiss = iconButton('circle circle--quiet', CLOSE_ICON, 'Cancel');

  const editorPanel = editor.element();
  editorPanel.hidden = true;

  const panel = fill(
    make('div', { className: 'panel composer', attributes: { hidden: '' } }),
    label,
    fill(make('div', { className: 'composer__bar' }), expand, input, dismiss, submit),
    editorPanel,
  );
  layer.append(panel);

  let anchor: Element | SelectionBox | null = null;
  let target: Element | null = null;
  let editorAttached = false;
  let onSubmit: ((draft: Draft) => void) | null = null;
  let onDismiss: (() => void) | null = null;

  function close(): void {
    const dismiss = onDismiss;
    editor.reset();
    resetPanel();
    dismiss?.();
  }

  function commit(): void {
    const comment = input.value.trim();
    const styleChanges = target === null ? [] : editor.commit();

    // A selection with neither a comment nor an edit says nothing.
    if (comment === '' && styleChanges.length === 0) {
      input.focus();
      return;
    }

    const handler = onSubmit;
    // Cleared without reverting, so the live edits stay on screen after adding.
    resetPanel();
    handler?.({ comment, styleChanges });
  }

  function resetPanel(): void {
    panel.setAttribute('hidden', '');
    editorPanel.hidden = true;
    expand.hidden = false;
    expand.classList.remove('circle--on');
    input.value = '';
    resize();
    anchor = null;
    target = null;
    editorAttached = false;
    onSubmit = null;
    onDismiss = null;
  }

  function toggleEditor(): void {
    if (target === null) return;

    editorPanel.hidden = !editorPanel.hidden;
    expand.classList.toggle('circle--on', !editorPanel.hidden);
    if (!editorPanel.hidden && !editorAttached) {
      editor.attach(target);
      editorAttached = true;
    }

    // Opening the editor makes the panel much taller, which can push it off the
    // bottom of the screen, so it is placed again at its new size.
    reposition();
  }

  /** Keep the panel beside its element and clear of the tray. */
  function reposition(): void {
    if (anchor === null) return;
    const box = anchor instanceof Element
      ? anchor.getBoundingClientRect()
      : new DOMRect(anchor.x, anchor.y, anchor.width, anchor.height);
    placeNear(panel, box, { reservedBottom: TRAY_BAND });
  }

  /** Grow the input with its content instead of showing a scrollbar. */
  function resize(): void {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  }

  expand.addEventListener('click', toggleEditor);
  submit.addEventListener('click', commit);
  dismiss.addEventListener('click', close);
  input.addEventListener('input', () => {
    resize();
    reposition();
  });

  const suppressHostKeyEvent = (event: KeyboardEvent): void => {
    event.stopPropagation();
  };

  input.addEventListener('keydown', (event) => {
    // Keep every composer keystroke out of the host page.
    event.stopPropagation();

    if (event.key !== 'Enter') return;

    if (event.shiftKey) {
      // Let the textarea insert a newline.
      return;
    }

    event.preventDefault();
    commit();
  });
  input.addEventListener('keypress', suppressHostKeyEvent);
  input.addEventListener('keyup', suppressHostKeyEvent);

  return {
    open(element, description, handler) {
      anchor = element;
      target = element;
      editorAttached = false;
      onSubmit = handler;
      onDismiss = null;
      expand.hidden = false;
      label.textContent = description;
      panel.removeAttribute('hidden');
      resize();

      reposition();
      input.focus();
    },
    openAt(box, description, handler, dismiss) {
      editor.reset();
      anchor = { ...box };
      target = null;
      editorAttached = false;
      onSubmit = handler;
      onDismiss = dismiss;
      expand.hidden = true;
      editorPanel.hidden = true;
      label.textContent = description;
      panel.removeAttribute('hidden');
      resize();

      reposition();
      input.focus();
    },
    close,
    isOpen: () => !panel.hasAttribute('hidden'),
  };
}

function iconButton(className: string, icon: string, title: string): HTMLButtonElement {
  const button = make('button', { className, attributes: { type: 'button', title } });
  button.innerHTML = icon;
  return button;
}
