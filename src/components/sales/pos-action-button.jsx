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
      className="relative flex min-h-[2.75rem] flex-col items-center justify-center gap-0.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold uppercase leading-tight text-slate-700 shadow-sm hover:border-[#185FA5]/30 hover:bg-[#E6F1FB]/50 disabled:opacity-40"
    >
      <span className={`relative text-sm leading-none ${iconClass}`}>
        {icon}
        {badge > 0 ? (
          <span className="absolute -right-2.5 -top-2 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-[#185FA5] px-1 text-[9px] font-bold leading-none text-white">
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </span>
      {label}
    </button>
  );
}
