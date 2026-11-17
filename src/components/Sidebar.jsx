const dot = 'h-10 w-10 shrink-0 rounded-full border border-white/[0.07] bg-white/[0.04]'

export default function Sidebar() {
  return (
    <aside
      className="fixed z-20 flex border-white/[0.06] bg-white/[0.02] backdrop-blur-xl
        bottom-0 left-0 right-0 h-16 flex-row items-center justify-center gap-4 border-t
        lg:bottom-0 lg:left-0 lg:right-auto lg:top-0 lg:h-auto lg:w-20 lg:flex-col lg:justify-start lg:gap-5 lg:border-r lg:border-t-0 lg:py-6"
    >
      <div className="hidden h-11 w-11 shrink-0 rounded-full bg-gradient-to-br from-emerald-300/40 to-teal-500/20 shadow-[0_0_24px_rgba(52,211,153,0.25)] lg:block" />
      <div className="hidden h-px w-8 bg-white/[0.08] lg:block" />
      <div className={dot} />
      <div className={dot} />
      <div className={dot} />
      <div className={dot} />
      <div className="hidden lg:block lg:flex-1" />
      <div className={dot} />
    </aside>
  )
}
