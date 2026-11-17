export default function Card({ className = '', children }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.03]
        shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_8px_30px_rgba(0,0,0,0.35)]
        backdrop-blur-md ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(120%_90%_at_20%_0%,rgba(255,255,255,0.05),transparent_60%)]" />
      {children}
    </div>
  )
}
