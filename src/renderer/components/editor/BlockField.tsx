// A block-id field with autocomplete from the content pack's placeable blocks (a native
// <datalist>). Used by Replace ("with"), Stairs ("stair block") and the Re-theme rows
// (label omitted, placeholder = "keep").
interface BlockFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Block ids to suggest. */
  options: string[];
  /** Unique id linking the input to its datalist. */
  listId: string;
  /** Shown while empty (e.g. Re-theme's "keep unchanged"). */
  placeholder?: string;
}

export function BlockField({ label, value, onChange, options, listId, placeholder }: BlockFieldProps) {
  return (
    <label className="editor-field">
      {label && <span className="editor-label">{label}</span>}
      <input
        className="editor-input"
        list={listId}
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {options.map((id) => (
          <option key={id} value={id} />
        ))}
      </datalist>
    </label>
  );
}
