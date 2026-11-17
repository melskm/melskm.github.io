export default function Background() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-[#060a0b]" />
      <div className="absolute -top-48 left-[15%] h-[36rem] w-[36rem] rounded-full bg-emerald-400/[0.07] blur-[130px]" />
      <div className="absolute top-1/4 -left-48 h-[30rem] w-[30rem] rounded-full bg-teal-300/[0.05] blur-[120px]" />
      <div className="absolute top-1/3 -right-48 h-[32rem] w-[32rem] rounded-full bg-cyan-300/[0.045] blur-[130px]" />
      <div className="absolute -bottom-32 left-[30%] h-[30rem] w-[44rem] rounded-full bg-orange-400/[0.05] blur-[140px]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.45)_100%)]" />
    </div>
  )
}
