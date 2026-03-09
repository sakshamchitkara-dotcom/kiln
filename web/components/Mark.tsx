export function Mark({ firing = false }: { firing?: boolean }) {
  return (
    <svg className={firing ? "mark firing" : "mark"} viewBox="0 0 32 32" width="22" height="22" aria-hidden>
      <path d="M4 28V14a12 12 0 0 1 24 0v14z" fill="var(--cobalt)" />
      <rect className="mark-door" x="11" y="18" width="10" height="10" rx="1" />
    </svg>
  );
}
