/** Lifecycle state herdr reports for an agent occupying a pane. */
export type AgentStatus = 'idle' | 'working' | 'blocked' | 'done' | 'unknown';

/**
 * One entry from `herdr agent list`.
 *
 * Field names are snake_case because this mirrors the CLI's JSON verbatim.
 * Only the fields this daemon actually reads are declared; herdr returns more.
 */
export interface HerdrAgent {
  /** Agent kind, e.g. "claude" or "codex". */
  agent: string;
  agent_status: AgentStatus;
  /** Working directory of the pane itself. */
  cwd: string;
  /** Working directory of whatever is running in the foreground of that pane. */
  foreground_cwd?: string;
  /** True for the single pane the herdr UI currently has focused. */
  focused: boolean;
  pane_id: string;
  workspace_id: string;
  /**
   * Monotonically increasing across the whole session, bumped whenever an agent
   * changes state. The highest value is therefore the most recently active
   * agent — this is how "the session I was last working in" is resolved.
   */
  state_change_seq: number;
  /** Terminal title with herdr's status glyph removed — human readable. */
  terminal_title_stripped?: string;
  /**
   * Identity of the agent process in the pane. A pane id outlives the agent
   * that was in it, so this is what says "still the same session" after a
   * review was sent there.
   */
  agent_session?: { kind: string; value: string };
}

/** An agent the extension may send a review to, flattened for the popup. */
export interface Target {
  paneId: string;
  workspaceId: string;
  /** What the user sees in the picker, e.g. "Add live wallet preview in phone frame". */
  label: string;
  agent: string;
  status: AgentStatus;
  cwd: string;
  focused: boolean;
  lastActiveSeq: number;
}
