import Link from "next/link"
import { useRouter } from "next/router"
import { useAuth } from "@/context/AuthContext"
import {
  LayoutDashboard,
  ArrowRightLeft,
  Users,
  BookOpen,
  Upload,
  FileText,
  LogOut,
  LogIn,
  Wallet,
  Receipt,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Cashflow", href: "/cashflow", icon: ArrowRightLeft },
  { name: "Biaya Siswa", href: "/billing", icon: Receipt },
  { name: "Data Siswa", href: "/students", icon: Users },
  { name: "Akun", href: "/accounts", icon: BookOpen },
  { name: "Laporan", href: "/reports", icon: FileText },
]

const adminNavigation = [
  { name: "Import Data", href: "/admin", icon: Upload },
]

export function AppSidebar() {
  const router = useRouter()
  const { user, isAdmin, logout } = useAuth()
  const { state, toggleSidebar } = useSidebar()
  const isExpanded = state === "expanded"

  return (
    <div className="relative">
      <Sidebar 
        collapsible="icon" 
        className="hidden md:flex border-r border-gray-200 bg-white rounded-r-2xl"
      >
        {/* Header with Logo */}
        <SidebarHeader className="border-b border-gray-200 p-4">
          <div className={`flex items-center gap-3 ${!isExpanded ? 'justify-center' : ''}`}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#c6ef4e]">
              <Wallet className="h-5 w-5 text-gray-900" />
            </div>
            {isExpanded && (
              <div className="flex flex-col overflow-hidden">
                <span className="text-base font-bold text-gray-900">Keuangan</span>
                <span className="text-xs text-gray-500">Sekolah</span>
              </div>
            )}
          </div>
        </SidebarHeader>
        
        {/* Navigation */}
        <SidebarContent className="py-4">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1 px-3">
                {navigation.map((item) => {
                  const isActive = router.pathname === item.href
                  return (
                    <SidebarMenuItem key={item.name}>
                      <SidebarMenuButton 
                        asChild 
                        isActive={isActive}
                        className={`h-10 rounded-xl transition-all ${
                          isActive 
                            ? 'bg-[#c6ef4e] text-gray-900 font-medium' 
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                        }`}
                      >
                        <Link 
                          href={item.href} 
                          className={`flex items-center gap-3 ${isExpanded ? 'px-3 justify-start' : 'justify-center'}`}
                        >
                          <item.icon className="h-5 w-5 shrink-0 text-gray-900" strokeWidth={2} />
                          {isExpanded && <span className="truncate">{item.name}</span>}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {isAdmin && (
            <SidebarGroup className="mt-4 border-t border-gray-200 pt-4">
              <SidebarGroupContent>
                <SidebarMenu className="gap-1 px-3">
                  {adminNavigation.map((item) => {
                    const isActive = router.pathname === item.href
                    return (
                      <SidebarMenuItem key={item.name}>
                        <SidebarMenuButton 
                          asChild 
                          isActive={isActive}
                          className={`h-10 rounded-xl transition-all ${
                            isActive 
                              ? 'bg-[#c6ef4e] text-gray-900 font-medium' 
                              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                          }`}
                        >
                          <Link 
                            href={item.href} 
                            className={`flex items-center gap-3 ${isExpanded ? 'px-3 justify-start' : 'justify-center'}`}
                          >
                            <item.icon className="h-5 w-5 shrink-0 text-gray-900" strokeWidth={2} />
                            {isExpanded && <span className="truncate">{item.name}</span>}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>

        {/* Footer with User */}
        <SidebarFooter className="border-t border-gray-200 p-3">
          {user ? (
            <div className={`flex items-center gap-3 ${!isExpanded ? 'justify-center' : ''}`}>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700 text-xs font-semibold">
                {user.role === 'admin' ? 'A' : 'G'}
              </div>
              {isExpanded && (
                <>
                  <div className="flex flex-1 flex-col overflow-hidden">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {user.role === 'admin' ? 'Admin' : 'Guest'}
                    </span>
                  </div>
                  <button
                    onClick={logout}
                    className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-all"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          ) : (
            <SidebarMenuButton
              asChild
              className="h-10 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-100"
            >
              <Link 
                href="/login" 
                className={`flex items-center gap-3 ${isExpanded ? 'px-3 justify-start' : 'justify-center'}`}
              >
                <LogIn className="h-5 w-5 shrink-0 text-gray-900" />
                {isExpanded && <span className="truncate">Login</span>}
              </Link>
            </SidebarMenuButton>
          )}
        </SidebarFooter>
      </Sidebar>

      {/* Toggle Button - Positioned at right edge, vertically centered */}
      <button
        onClick={toggleSidebar}
        className="hidden md:flex fixed top-1/2 -translate-y-1/2 z-20 h-10 w-10 items-center justify-center rounded-full bg-[#f7f7f7] text-gray-600 hover:text-gray-900 transition-all"
        style={{ 
          left: isExpanded ? 'calc(16rem - 16px)' : 'calc(5rem - 16px)',
          transition: 'left 0.2s ease-in-out'
        }}
      >
        {isExpanded ? (
          <ChevronLeft className="h-5 w-5" />
        ) : (
          <ChevronRight className="h-5 w-5" />
        )}
      </button>
    </div>
  )
}