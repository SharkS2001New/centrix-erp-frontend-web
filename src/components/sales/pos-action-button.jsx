export function PosActionButton({ label, title, icon, iconClass, disabled, onClick, badge = 0 }) {
  return (
    <button
      type="button"
      title={title ?? label}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        onClick?.(e);
      }}
      className="pos-cart-action-btn relative flex min-h-[2.75rem] flex-col items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold uppercase leading-tight disabled:cursor-not-allowed"
    >
      <span className={`pos-cart-action-icon relative text-sm leading-none ${iconClass ?? ""}`}>
        {icon}
        {badge > 0 ? (
          <span className="absolute -right-2.5 -top-2 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-[var(--theme-primary)] px-1 text-[9px] font-bold leading-none text-[var(--theme-primary-fg)]">
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </span>
      <span className="pos-cart-action-label">{label}</span>
    </button>
  );
}
