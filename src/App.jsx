import Background from './components/Background'
import Sidebar from './components/Sidebar'
import SupabaseStatus from './components/SupabaseStatus'
import MiniCard from './components/cards/MiniCard'
import FeaturedCard from './components/cards/FeaturedCard'
import DiaryCard from './components/cards/DiaryCard'
import PanelPrimaryCard from './components/cards/PanelPrimaryCard'
import PanelSecondaryCard from './components/cards/PanelSecondaryCard'
import HeatmapCard from './components/cards/HeatmapCard'
import SleepCard from './components/cards/SleepCard'
import DayCounterCard from './components/cards/DayCounterCard'
import RoomCard from './components/cards/RoomCard'
import GlobeCard from './components/cards/GlobeCard'
import WideCard from './components/cards/WideCard'

export default function App() {
  return (
    <div className="min-h-screen">
      <Background />
      <Sidebar />

      <main className="relative z-10 px-3 pb-20 pt-3 sm:px-4 lg:pb-6 lg:pl-24 lg:pr-4 lg:pt-4">
        <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:auto-rows-[9.5rem] lg:grid-cols-12 lg:grid-flow-dense">
          <div className="grid grid-cols-3 gap-3 sm:col-span-2 sm:gap-4 lg:col-span-3 lg:row-span-1">
            <MiniCard />
            <MiniCard />
            <MiniCard />
          </div>

          <FeaturedCard className="h-56 sm:col-span-2 sm:h-auto lg:col-span-3 lg:row-span-3 lg:h-auto" />
          <DiaryCard className="sm:col-span-2 lg:col-span-6 lg:row-span-6 lg:max-h-none" />
          <PanelPrimaryCard className="h-40 sm:h-auto lg:col-span-3 lg:row-span-2 lg:h-auto" />
          <PanelSecondaryCard className="h-40 sm:h-auto lg:col-span-3 lg:row-span-2 lg:h-auto" />
          <HeatmapCard className="h-56 sm:h-auto lg:col-span-3 lg:row-span-2 lg:h-auto" />

          <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:gap-4 lg:col-span-3 lg:row-span-2">
            <SleepCard />
            <DayCounterCard />
          </div>

          <RoomCard className="h-64 sm:col-span-2 sm:h-auto lg:col-span-5 lg:row-span-3 lg:h-auto" />
          <GlobeCard className="h-64 sm:h-auto lg:col-span-2 lg:row-span-3 lg:h-auto" />
          <WideCard className="h-64 sm:col-span-2 sm:h-auto lg:col-span-5 lg:row-span-3 lg:h-auto" />
        </div>
      </main>
      <SupabaseStatus />
    </div>
  )
}
