// A block-id field with autocomplete from the content pack's placeable blocks (a native
// <datalist>). Used by Replace ("with") and Stairs ("stair block").
interface BlockFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Block ids to suggest. */
  options: string[];
  /** Unique id linking the input to its datalist. */
  listId: string;
}

export function BlockField({ label, value, onChange, options, listId }: BlockFieldProps) {
  return (
    <label className="editor-field">
      <span className="editor-label">{label}</span>
      <input
        className="editor-input"
        list={listId}
        value={value}
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
