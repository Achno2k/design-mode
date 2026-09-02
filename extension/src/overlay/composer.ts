import type { ItemTriage, SelectionBox, StyleChange, TextChange } from '../lib/protocol.ts';
import { createBoxModel } from './box-model.ts';
import { fill, make, placeNear } from './dom.ts';
import { CHECK_ICON, SLIDERS_ICON } from './icons.ts';
import { createStyleEditor, type CommittedStyleEdits } from './style-editor.ts';

/** What the user produced for one element. */
export interface Draft {
  comment: string;
  styleChanges: StyleChange[];
  textChange?: TextChange;
  styleEffect?: CommittedStyleEdits;
  triage?: ItemTriage;
}

/** What the composer starts with when it reopens on an existing item. */
export interface ComposerInitial {
  comment?: string;
  triage?: ItemTriage;
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
  open(
    element: Element,
    label: ElementLabel,
    onSubmit: (draft: Draft) => void,
    onDismiss: () => void,
    initial?: ComposerInitial,
  ): void;
  /** Open a comment-only composer beside a freehand drawing. */
  openAt(
    box: SelectionBox,
    label: ElementLabel,
    onSubmit: (draft: Draft) => void,
    onDismiss: () => void,
    initial?: ComposerInitial,
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
 * It opens as a single prompt with the element named beneath it. The sliders
 * button expands the editor, whose changes apply to the page immediately, so a
 * change can be demonstrated rather than described. Closing without submitting
 * reverts every live edit.
 */
export function createComposer(layer: HTMLElement, options: ComposerOptions): Composer {
  // Bands are appended before the panel so the composer always paints over them.
  const editor = createStyleEditor({ onChange: () => updateSubmit(), boxModel: createBoxModel(layer) });

  const input = make('textarea', {
    className: 'composer__input',
    attributes: { rows: '1', placeholder: 'Describe these changes…' },
  });

  const expand = iconButton('circle circle--ghost', SLIDERS_ICON, 'Edit this element live');
  const submit = iconButton('circle circle--accent', CHECK_ICON, 'Add selection');
  const cancel = make('button', {
    className: 'pill pill--outline',
    text: 'Cancel',
    attributes: { type: 'button' },
  });

  const tag = make('span', { className: 'composer__tag' });
  const detail = make('span', { className: 'composer__detail' });
  const identity = fill(make('div', { className: 'composer__identity' }), tag, detail);

  const editorPanel = editor.element();
  editorPanel.hidden = true;

  const panel = fill(
    make('div', { className: 'panel composer', attributes: { hidden: '' } }),
    fill(make('div', { className: 'composer__prompt' }), expand, input),
    identity,
    editorPanel,
    fill(make('div', { className: 'composer__footer' }), cancel, submit),
  );
  layer.append(panel);

  let anchor: Element | SelectionBox | null = null;
  let target: Element | null = null;
  let editorAttached = false;
  let onSubmit: ((draft: Draft) => void) | null = null;
  let onDismiss: (() => void) | null = null;
  let triage: ItemTriage | undefined;

  function close(): void {
    const dismissed = onDismiss;
    editor.reset();
    resetPanel();
    dismissed?.();
  }

  /**
   * The submit is disabled rather than silently refusing: a selection with
   * neither a comment nor an edit says nothing, and the button should show that
   * before it is pressed instead of after.
   */
  function updateSubmit(): void {
    submit.disabled = input.value.trim() === '' && !editor.hasEdits();
  }

  function commit(): void {
    const comment = input.value.trim();
    const committed = target === null ? null : editor.commit();
    const styleChanges = committed?.changes ?? [];
    const textChange = committed?.textChange;

    if (comment === '' && styleChanges.length === 0 && textChange === undefined) {
      committed?.revert();
      if (target !== null && editorAttached) editor.attach(target);
      input.focus();
      return;
    }

    const handler = onSubmit;
    const hasEdits = styleChanges.length > 0 || textChange !== undefined;
    // Cleared without reverting, so the live edits stay on screen after adding.
    resetPanel();
    handler?.({
      comment,
      styleChanges,
      ...(textChange === undefined ? {} : { textChange }),
      ...(committed === null || !hasEdits ? {} : { styleEffect: committed }),
      ...(triage === undefined ? {} : { triage }),
    });
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
    triage = undefined;
    updateSubmit();
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
  cancel.addEventListener('click', close);
  input.addEventListener('input', () => {
    updateSubmit();
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

  // Editor fields are ordinary inputs; their keystrokes must not reach the page
  // either, or typing a space into a value would scroll it.
  for (const type of ['keydown', 'keypress', 'keyup'] as const) {
    editorPanel.addEventListener(type, suppressHostKeyEvent);
  }

  function openPanel(next: ElementLabel, initial?: ComposerInitial): void {
    showLabel(next);
    input.value = initial?.comment ?? '';
    triage = initial?.triage;
    panel.removeAttribute('hidden');
    resize();
    updateSubmit();
    reposition();
    input.focus();
  }

  return {
    open(element, next, handler, dismissed, initial) {
      anchor = element;
      target = element;
      editorAttached = false;
      onSubmit = handler;
      onDismiss = dismissed;
      expand.hidden = false;
      openPanel(next, initial);
    },
    openAt(box, next, handler, dismissed, initial) {
      editor.reset();
      anchor = { ...box };
      target = null;
      editorAttached = false;
      onSubmit = handler;
      onDismiss = dismissed;
      expand.hidden = true;
      editorPanel.hidden = true;
      openPanel(next, initial);
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
