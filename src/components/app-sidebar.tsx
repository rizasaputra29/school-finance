import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/router"
import { useAuth } from "@/context/AuthContext"
import { useState, useEffect } from "react"
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
  ChevronDown,
  Briefcase,
  Building2,
  BarChart3,
  ClipboardCheck,
  Calendar,
  type LucideIcon,
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

interface NavItem {
  name: string
  href: string
  icon: LucideIcon
  matchPaths?: string[]
}

interface NavGroup {
  label: string
  icon: LucideIcon
  items: NavItem[]
}

const mainNav: NavItem[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Cashflow", href: "/cashflow", icon: ArrowRightLeft },
]

const navGroups: NavGroup[] = [
  {
    label: "Siswa",
    icon: Users,
    items: [
      { name: "Data Siswa", href: "/students", icon: Users },
      { name: "Biaya Siswa", href: "/billing", icon: Receipt },
    ],
  },
  {
    label: "Karyawan",
    icon: Briefcase,
    items: [
      { name: "Data Karyawan", href: "/karyawan", icon: Briefcase, matchPaths: ["/karyawan"] },
      { name: "Gaji & Tunjangan", href: "/karyawan/payroll", icon: Wallet, matchPaths: ["/karyawan/payroll"] },
    ],
  },
  {
    label: "Keuangan",
    icon: Building2,
    items: [
      { name: "Akun (COA)", href: "/accounts", icon: BookOpen },
      { name: "Kas & Bank", href: "/keuangan", icon: Building2 },
    ],
  },
  {
    label: "Laporan",
    icon: FileText,
    items: [
      { name: "Laporan Keuangan", href: "/reports", icon: FileText },
      { name: "Jurnal Umum", href: "/jurnal", icon: FileText },
      { name: "Buku Besar", href: "/buku-besar", icon: Wallet },
    ],
  },
]

const bottomNav: NavGroup[] = [
  {
    label: "Performa",
    icon: BarChart3,
    items: [
      { name: "Performa Sekolah", href: "/performa", icon: BarChart3 },
    ],
  },
]

const adminNavigation: NavItem[] = [
  { name: "Import Data", href: "/admin", icon: Upload },
  { name: "Persetujuan", href: "/admin/approve", icon: ClipboardCheck },
  { name: "Tahun Ajaran", href: "/admin/tahun-ajaran", icon: Calendar },
]

function isActive(pathname: string, item: NavItem): boolean {
  if (item.matchPaths) {
    return item.matchPaths.some(p => pathname === p)
  }
  return pathname === item.href
}

export function AppSidebar() {
  const router = useRouter()
  const { user, isAdmin, logout } = useAuth()
  const { state, toggleSidebar } = useSidebar()
  const isExpanded = state === "expanded"

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    // Need to avoid using router.pathname directly in initial state on server to prevent hydration mismatch
    return initial
  })

  // Set initial expanded state after mount based on current path
  useEffect(() => {
    const timer = setTimeout(() => {
      setExpandedGroups(prev => {
        const next = { ...prev }
        navGroups.forEach(group => {
          if (group.items.some(item => isActive(router.pathname, item))) {
            next[group.label] = true
          }
        })
        bottomNav.forEach(group => {
          if (group.items.some(item => isActive(router.pathname, item))) {
            next[group.label] = true
          }
        })
        // Only set state if something changed to avoid unnecessary re-renders
        return JSON.stringify(prev) !== JSON.stringify(next) ? next : prev
      })
    }, 0)
    
    return () => clearTimeout(timer)
  }, [router.pathname])

  const toggleGroup = (label: string) => {
    setExpandedGroups(prev => ({ ...prev, [label]: !prev[label] }))
  }

  const renderNavItem = (item: NavItem) => {
    const active = isActive(router.pathname, item)
    return (
      <SidebarMenuItem key={item.name}>
        <SidebarMenuButton 
          asChild 
          isActive={active}
          className={`h-10 rounded-xl transition-all ${
            active 
              ? 'bg-[#059DEA] text-white font-medium border-2 border-gray-900' 
              : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
          }`}
        >
          <Link 
            href={item.href} 
            className={`flex items-center gap-3 ${isExpanded ? 'px-3 justify-start' : 'justify-center'}`}
          >
            <item.icon className="h-5 w-5 shrink-0" strokeWidth={2} />
            {isExpanded && <span className="truncate">{item.name}</span>}
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  return (
    <div className="relative">
      <Sidebar 
        collapsible="icon" 
        className="hidden md:flex border-r border-gray-200 bg-white rounded-r-2xl"
      >
        {/* Header with Logo */}
        <SidebarHeader className="border-b border-gray-200 p-4">
          <div className={`flex items-center gap-3 ${!isExpanded ? 'justify-center' : ''}`}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center">
              <Image 
                src="/logo.svg" 
                alt="Al Madeena Islamic School" 
                width={40}
                height={40}
                className="object-contain"
              />
            </div>
            {isExpanded && (
              <div className="flex flex-col overflow-hidden">
                <span className="text-sm font-bold text-gray-900 leading-tight">Al Madeena</span>
                <span className="text-xs text-gray-600 font-medium">Islamic School</span>
              </div>
            )}
          </div>
        </SidebarHeader>
        
        {/* Navigation */}
        <SidebarContent className="py-3 overflow-y-auto">
          {/* Main nav and Grouped sections */}
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1 px-3">
                {mainNav.map(renderNavItem)}
                {navGroups.map((group) => {
                  const isExpandedOpen = expandedGroups[group.label]
                  return (
                    <div key={group.label} className="flex flex-col gap-1">
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          onClick={() => toggleGroup(group.label)}
                          className={`h-10 rounded-xl transition-all cursor-pointer text-gray-700 hover:text-gray-900 hover:bg-gray-100 ${!isExpanded ? 'justify-center' : ''}`}
                        >
                          <div className={`flex items-center w-full ${isExpanded ? 'justify-between' : 'justify-center'}`}>
                            <div className="flex items-center gap-3">
                              <group.icon className="h-5 w-5 shrink-0" strokeWidth={2} />
                              {isExpanded && <span>{group.label}</span>}
                            </div>
                            {isExpanded && (
                              <ChevronDown 
                                className={`h-4 w-4 text-gray-400 transition-transform ${isExpandedOpen ? '' : '-rotate-90'}`} 
                              />
                            )}
                          </div>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      
                      {isExpandedOpen && (
                        <div className={`flex flex-col gap-1 ${isExpanded ? 'ml-3' : 'items-center'}`}>
                          {group.items.map(item => {
                            const active = isActive(router.pathname, item)
                            return (
                              <SidebarMenuItem key={item.name}>
                                <SidebarMenuButton 
                                  asChild 
                                  isActive={active}
                                  className={`h-10 rounded-xl transition-all ${
                                    active 
                                      ? 'bg-[#059DEA] text-white font-medium border-2 border-gray-900' 
                                      : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                                  }`}
                                >
                                  <Link 
                                    href={item.href} 
                                    className={`flex items-center gap-3 ${isExpanded ? 'px-3 justify-start' : 'justify-center w-full'}`}
                                  >
                                    {!isExpanded && <item.icon className="h-5 w-5 shrink-0" strokeWidth={2} />}
                                    {isExpanded && (
                                      <span className="truncate">{item.name}</span>
                                    )}
                                  </Link>
                                </SidebarMenuButton>
                              </SidebarMenuItem>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
                {bottomNav.map((group) => {
                  const isExpandedOpen = expandedGroups[group.label]
                  return (
                    <div key={group.label} className="flex flex-col gap-1">
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          onClick={() => toggleGroup(group.label)}
                          className={`h-10 rounded-xl transition-all cursor-pointer text-gray-700 hover:text-gray-900 hover:bg-gray-100 ${!isExpanded ? 'justify-center' : ''}`}
                        >
                          <div className={`flex items-center w-full ${isExpanded ? 'justify-between' : 'justify-center'}`}>
                            <div className="flex items-center gap-3">
                              <group.icon className="h-5 w-5 shrink-0" strokeWidth={2} />
                              {isExpanded && <span>{group.label}</span>}
                            </div>
                            {isExpanded && (
                              <ChevronDown 
                                className={`h-4 w-4 text-gray-400 transition-transform ${isExpandedOpen ? '' : '-rotate-90'}`} 
                              />
                            )}
                          </div>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                      
                      {isExpandedOpen && (
                        <div className={`flex flex-col gap-1 ${isExpanded ? 'ml-3' : 'items-center'}`}>
                          {group.items.map(item => {
                            const active = isActive(router.pathname, item)
                            return (
                              <SidebarMenuItem key={item.name}>
                                <SidebarMenuButton 
                                  asChild 
                                  isActive={active}
                                  className={`h-10 rounded-xl transition-all ${
                                    active 
                                      ? 'bg-[#059DEA] text-white font-medium border-2 border-gray-900' 
                                      : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'
                                  }`}
                                >
                                  <Link 
                                    href={item.href} 
                                    className={`flex items-center gap-3 ${isExpanded ? 'px-3 justify-start' : 'justify-center w-full'}`}
                                  >
                                    {!isExpanded && <item.icon className="h-5 w-5 shrink-0" strokeWidth={2} />}
                                    {isExpanded && (
                                      <span className="truncate">{item.name}</span>
                                    )}
                                  </Link>
                                </SidebarMenuButton>
                              </SidebarMenuItem>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Divider */}
                {isAdmin && (
                  <div className="border-t border-gray-200 my-2"></div>
                )}

                {/* Admin nav */}
                {isAdmin && adminNavigation.map(renderNavItem)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        {/* Footer with User */}
        <SidebarFooter className="border-t border-gray-200 p-3">
          {user ? (
            <div className={`flex items-center gap-3 ${!isExpanded ? 'justify-center' : ''}`}>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#059DEA] text-white text-xs font-semibold">
                {user.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              {isExpanded && (
                <>
                  <div className="flex flex-1 flex-col overflow-hidden">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {user.name || user.email}
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
                <LogIn className="h-5 w-5 shrink-0 text-gray-700" />
                {isExpanded && <span className="truncate">Login</span>}
              </Link>
            </SidebarMenuButton>
          )}
        </SidebarFooter>
      </Sidebar>

      {/* Toggle Button */}
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