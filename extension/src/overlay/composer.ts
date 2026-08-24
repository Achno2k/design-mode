import type { SelectionBox, StyleChange } from '../lib/protocol.ts';
import { fill, make, placeNear } from './dom.ts';
import { CHECK_ICON, CLOSE_ICON, SLIDERS_ICON } from './icons.ts';
import { createStyleEditor } from './style-editor.ts';

/** What the user produced for one element. */
export interface Draft {
  comment: string;
  styleChanges: StyleChange[];
}

/** What the composer is pointed at, split so the tag can be coloured apart. */
export interface ElementLabel {
  /** The lead, such as `<label>` or `Drawing`. */
  tag: string;
  /** The rest, such as `.wc-label` or `3 strokes`. */
  detail: string;
}

/** The panel that opens on the element you clicked. */
export interface Composer {
  open(element: Element, label: ElementLabel, onSubmit: (draft: Draft) => void): void;
  /** Open a comment-only composer beside a freehand drawing. */
  openAt(
    box: SelectionBox,
    label: ElementLabel,
    onSubmit: (draft: Draft) => void,
    onDismiss: () => void,
  ): void;
  close(): void;
  isOpen(): boolean;
}

export interface ComposerOptions {
  /** Space along the bottom the toolbar is using, read at placement time. */
  reservedBottom(): number;
}

/**
 * Ask for a comment, and optionally let the user show what they mean.
 *
 * It opens as a single input. The sliders button expands a style editor whose
 * changes apply to the page immediately, so a change can be demonstrated rather
 * than described. Closing without submitting reverts every live edit.
 */
export function createComposer(layer: HTMLElement, options: ComposerOptions): Composer {
  const editor = createStyleEditor();

  const tag = make('span', { className: 'composer__tag' });
  const detail = make('span', { className: 'composer__detail' });
  const label = fill(make('div', { className: 'composer__label' }), tag, detail);

  const input = make('textarea', {
    className: 'composer__input',
    attributes: { rows: '1', placeholder: 'Describe the change…' },
  });

  const expand = iconButton('circle', SLIDERS_ICON, 'Edit styles live');
  const submit = iconButton('circle circle--accent', CHECK_ICON, 'Add selection');
  const dismiss = iconButton('circle circle--sm', CLOSE_ICON, 'Cancel');

  const editorPanel = editor.element();
  editorPanel.hidden = true;

  const panel = fill(
    make('div', { className: 'panel composer', attributes: { hidden: '' } }),
    label,
    fill(
      make('div', { className: 'composer__bar' }),
      expand,
      fill(make('div', { className: 'composer__field' }), input, dismiss),
      submit,
    ),
    editorPanel,
  );
  layer.append(panel);

  let anchor: Element | SelectionBox | null = null;
  let target: Element | null = null;
  let editorAttached = false;
  let onSubmit: ((draft: Draft) => void) | null = null;
  let onDismiss: (() => void) | null = null;

  function close(): void {
    const dismissed = onDismiss;
    editor.reset();
    resetPanel();
    dismissed?.();
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

  function showLabel(next: ElementLabel): void {
    tag.textContent = next.tag;
    detail.textContent = next.detail;
    detail.hidden = next.detail === '';
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

  /** Keep the panel beside its element and clear of the toolbar. */
  function reposition(): void {
    if (anchor === null) return;
    const box =
      anchor instanceof Element
        ? anchor.getBoundingClientRect()
        : new DOMRect(anchor.x, anchor.y, anchor.width, anchor.height);
    placeNear(panel, box, { reservedBottom: options.reservedBottom() });
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
    open(element, next, handler) {
      anchor = element;
      target = element;
      editorAttached = false;
      onSubmit = handler;
      onDismiss = null;
      expand.hidden = false;
      showLabel(next);
      panel.removeAttribute('hidden');
      resize();

      reposition();
      input.focus();
    },
    openAt(box, next, handler, dismissed) {
      editor.reset();
      anchor = { ...box };
      target = null;
      editorAttached = false;
      onSubmit = handler;
      onDismiss = dismissed;
      expand.hidden = true;
      editorPanel.hidden = true;
      showLabel(next);
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
  const button = make('button', {
    className,
    attributes: { type: 'button', title, 'aria-label': title },
  });
  button.innerHTML = icon;
  return button;
}
