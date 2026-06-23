import TabBar from '@/components/TabBar'

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-cream min-h-screen pb-16">
      {children}
      <TabBar />
    </div>
  )
}
