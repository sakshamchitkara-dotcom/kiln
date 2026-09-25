import { useState } from "react";

interface Props {
  onSubmit: (prompt: string) => void;
  disabled?: boolean;
  placeholder: string;
  submitLabel: string;
  big?: boolean;
}

export default function Composer({ onSubmit, disabled, placeholder, submitLabel, big }: Props) {
  const [value, setValue] = useState("");
  const submit = () => {
    const v = value.trim();
    if (!v || disabled) return;
    onSubmit(v);
    setValue("");
  };
  return (
    <form className={big ? "composer composer-big" : "composer"} onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <label className="sr-only" htmlFor={big ? "prompt-home" : "prompt-chat"}>Describe what to build or change</label>
      <textarea
        id={big ? "prompt-home" : "prompt-chat"}
        value={value}
        placeholder={placeholder}
        rows={big ? 3 : 2}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
      />
      <button type="submit" className="btn btn-primary" disabled={disabled || !value.trim()}>{submitLabel}</button>
    </form>
  );
}
