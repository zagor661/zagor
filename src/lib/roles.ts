// ============================================================
// System ról — Kitchen Ops v2
// 4 role z grupami modułów, bottom nav, sekcjami
// ============================================================

export type RoleType = 'kitchen' | 'hall' | 'manager' | 'owner'

export function normalizeRole(role: string): RoleType {
  switch (role) {
    case 'kitchen': return 'kitchen'
    case 'hall': return 'hall'
    case 'manager': return 'manager'
    case 'owner': return 'owner'
    case 'admin': return 'owner'
    case 'worker': return 'kitchen'
    default: return 'kitchen'
  }
}

export interface ModuleConfig {
  href: string
  icon: string
  title: string
  subtitle: string
  borderColor: string
  bgColor: string
}

export interface ModuleSection {
  title: string
  items: ModuleConfig[]
}

export interface BottomNavItem {
  icon: string
  label: string
  href: string
}

export interface RoleConfig {
  key: RoleType
  label: string
  labelPl: string
  icon: string
  color: string
  bgColor: string
  gradientFrom: string
  gradientTo: string
  description: string
  modules: ModuleConfig[]          // flat list (backwards compat + canAccess)
  sections: ModuleSection[]        // grouped view for dashboard
  quickActions: string[]           // hrefs of 2 hero modules
  bottomNav: BottomNavItem[]       // 3-5 bottom tabs
}

// ─── Moduły ────────────────────────────────────────────────

const MOD_CHECKLIST: ModuleConfig = {
  href: '/checklist',
  icon: '✅',
  title: 'Checklist',
  subtitle: 'Otwarcie · W ciagu dnia · Zamkniecie',
  borderColor: 'border-emerald-200',
  bgColor: 'bg-emerald-50',
}

const MOD_TASKS: ModuleConfig = {
  href: '/tasks',
  icon: '📋',
  title: 'Zadania',
  subtitle: 'Lista zadan do wykonania',
  borderColor: 'border-amber-200',
  bgColor: 'bg-amber-50',
}

const MOD_SCHEDULE: ModuleConfig = {
  href: '/schedule',
  icon: '📅',
  title: 'Grafik zmianowy',
  subtitle: 'Twoje zmiany i kto z Toba pracuje',
  borderColor: 'border-violet-100',
  bgColor: 'bg-violet-50',
}

const MOD_MEALS: ModuleConfig = {
  href: '/meals',
  icon: '🍽️',
  title: 'Posilek pracowniczy',
  subtitle: 'Zapisz swoj posilek',
  borderColor: 'border-red-100',
  bgColor: 'bg-red-50',
}

const MOD_AWARIE: ModuleConfig = {
  href: '/awarie',
  icon: '🔧',
  title: 'Zglos awarie',
  subtitle: 'Usterka ze zdjeciem i opisem',
  borderColor: 'border-orange-100',
  bgColor: 'bg-orange-50',
}

const MOD_SANEPID: ModuleConfig = {
  href: '/sanepid',
  icon: '🧾',
  title: 'Sanepid / HACCP',
  subtitle: 'Temperatury · Czystosc · Straty',
  borderColor: 'border-teal-200',
  bgColor: 'bg-teal-50',
}

const MOD_TEMPERATURE: ModuleConfig = {
  href: '/temperature',
  icon: '🌡️',
  title: 'Temperatury',
  subtitle: 'Pomiary urzadzen chlodniczych',
  borderColor: 'border-sky-200',
  bgColor: 'bg-sky-50',
}

const MOD_CLEANING: ModuleConfig = {
  href: '/cleaning',
  icon: '🧹',
  title: 'Czystosc',
  subtitle: 'Tygodniowe zadania sprzatania',
  borderColor: 'border-green-200',
  bgColor: 'bg-green-50',
}

const MOD_STRATY: ModuleConfig = {
  href: '/straty',
  icon: '📉',
  title: 'Straty',
  subtitle: 'Rejestracja strat zywnosci',
  borderColor: 'border-rose-200',
  bgColor: 'bg-rose-50',
}

const MOD_WOKI_TALKIE: ModuleConfig = {
  href: '/woki-talkie',
  icon: '📻',
  title: 'WOKI TALKIE',
  subtitle: 'Polecenia glosowe i tekstowe',
  borderColor: 'border-indigo-200',
  bgColor: 'bg-indigo-50',
}

const MOD_FOOD_COST: ModuleConfig = {
  href: '/food-cost',
  icon: '💰',
  title: 'Food Cost',
  subtitle: 'Przepisy, skladniki, koszty',
  borderColor: 'border-lime-200',
  bgColor: 'bg-lime-50',
}

const MOD_RAPORTY: ModuleConfig = {
  href: '/sanepid/raport',
  icon: '📊',
  title: 'Raporty Sanepid',
  subtitle: 'Raporty HACCP dzienne i tygodniowe',
  borderColor: 'border-cyan-200',
  bgColor: 'bg-cyan-50',
}

const MOD_DAILY_REPORT: ModuleConfig = {
  href: '/daily-report',
  icon: '📈',
  title: 'Raport dzienny',
  subtitle: 'Podsumowanie zmiany',
  borderColor: 'border-blue-200',
  bgColor: 'bg-blue-50',
}

const MOD_WORKER_PROFILES: ModuleConfig = {
  href: '/worker',
  icon: '📁',
  title: 'Teczki pracownikow',
  subtitle: 'Dane, umowy, stawki, godziny',
  borderColor: 'border-blue-200',
  bgColor: 'bg-blue-50',
}

const MOD_FAKTURY: ModuleConfig = {
  href: '/faktury',
  icon: '🧾',
  title: 'Faktury',
  subtitle: 'Skanuj, porownuj ceny, archiwum',
  borderColor: 'border-blue-200',
  bgColor: 'bg-blue-50',
}

const MOD_DOSTAWY: ModuleConfig = {
  href: '/sanepid/dostawy',
  icon: '📦',
  title: 'Dostawy',
  subtitle: 'Przyjmij dostawe + nota Sanepid',
  borderColor: 'border-teal-200',
  bgColor: 'bg-teal-50',
}

const MOD_USTAWIENIA: ModuleConfig = {
  href: '/settings',
  icon: '⚙️',
  title: 'Ustawienia',
  subtitle: 'Uzytkownicy, role, lokale',
  borderColor: 'border-gray-200',
  bgColor: 'bg-gray-50',
}

const MOD_STARS: ModuleConfig = {
  href: '/stars',
  icon: '⭐',
  title: 'Gwiazdki',
  subtitle: 'Pochwaly i osiagniecia',
  borderColor: 'border-yellow-200',
  bgColor: 'bg-yellow-50',
}

// ─── Definicje ról ──────────────────────────────────────────

export const ROLES: Record<RoleType, RoleConfig> = {
  kitchen: {
    key: 'kitchen',
    label: 'Kitchen',
    labelPl: 'Kuchnia',
    icon: '🍳',
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    gradientFrom: 'from-orange-500',
    gradientTo: 'to-amber-400',
    description: 'Temperatury, czystosc, straty, HACCP',
    modules: [MOD_CHECKLIST, MOD_SANEPID, MOD_MEALS, MOD_TASKS, MOD_SCHEDULE, MOD_AWARIE, MOD_WOKI_TALKIE, MOD_FOOD_COST, MOD_DOSTAWY, MOD_FAKTURY],
    quickActions: ['/checklist', '/tasks'],
    sections: [
      {
        title: 'Twoja zmiana',
        items: [MOD_MEALS, MOD_SCHEDULE],
      },
      {
        title: 'Bezpieczenstwo zywnosci',
        items: [MOD_TEMPERATURE, MOD_CLEANING, MOD_STRATY],
      },
      {
        title: 'Dostawy i faktury',
        items: [MOD_DOSTAWY, MOD_FAKTURY],
      },
      {
        title: 'Komunikacja',
        items: [MOD_WOKI_TALKIE, MOD_AWARIE],
      },
    ],
    bottomNav: [
      { icon: '🏠', label: 'Start', href: '/' },
      { icon: '✅', label: 'Checklist', href: '/checklist' },
      { icon: '📋', label: 'Zadania', href: '/tasks' },
      { icon: '🧾', label: 'HACCP', href: '/sanepid' },
    ],
  },
  hall: {
    key: 'hall',
    label: 'Hall',
    labelPl: 'Sala',
    icon: '🍽️',
    color: 'text-purple-700',
    bgColor: 'bg-purple-50',
    gradientFrom: 'from-purple-500',
    gradientTo: 'to-fuchsia-400',
    description: 'Zadania, grafik, posilki, usterki',
    modules: [MOD_CHECKLIST, MOD_TASKS, MOD_SCHEDULE, MOD_MEALS, MOD_AWARIE],
    quickActions: ['/checklist', '/tasks'],
    sections: [
      {
        title: 'Twoja zmiana',
        items: [MOD_MEALS, MOD_SCHEDULE],
      },
      {
        title: 'Zgloszenia',
        items: [MOD_AWARIE],
      },
    ],
    bottomNav: [
      { icon: '🏠', label: 'Start', href: '/' },
      { icon: '✅', label: 'Checklist', href: '/checklist' },
      { icon: '📋', label: 'Zadania', href: '/tasks' },
      { icon: '📅', label: 'Grafik', href: '/schedule' },
    ],
  },
  manager: {
    key: 'manager',
    label: 'Manager',
    labelPl: 'Menager',
    icon: '👔',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    gradientFrom: 'from-blue-600',
    gradientTo: 'to-cyan-400',
    description: 'Pelen dostep + gwiazdki + raporty',
    modules: [MOD_CHECKLIST, MOD_SANEPID, MOD_TASKS, MOD_SCHEDULE, MOD_MEALS, MOD_AWARIE, MOD_RAPORTY, MOD_DAILY_REPORT, MOD_WOKI_TALKIE, MOD_FOOD_COST, MOD_FAKTURY, MOD_WORKER_PROFILES],
    quickActions: ['/daily-report', '/tasks'],
    sections: [
      {
        title: 'Zespol',
        items: [MOD_SCHEDULE, MOD_WORKER_PROFILES, MOD_STARS, MOD_MEALS],
      },
      {
        title: 'HACCP i kontrola',
        items: [MOD_TEMPERATURE, MOD_CLEANING, MOD_STRATY, MOD_RAPORTY],
      },
      {
        title: 'Operacje i finanse',
        items: [MOD_CHECKLIST, MOD_AWARIE, MOD_DOSTAWY, MOD_FOOD_COST, MOD_FAKTURY],
      },
    ],
    bottomNav: [
      { icon: '🏠', label: 'Start', href: '/' },
      { icon: '📈', label: 'Raporty', href: '/daily-report' },
      { icon: '📋', label: 'Zadania', href: '/tasks' },
      { icon: '📻', label: 'WOKI', href: '/woki-talkie' },
      { icon: '👥', label: 'Zespol', href: '/schedule' },
    ],
  },
  owner: {
    key: 'owner',
    label: 'Owner',
    labelPl: 'Owner',
    icon: '🥷',
    color: 'text-gray-900',
    bgColor: 'bg-gray-900/5',
    gradientFrom: 'from-gray-900',
    gradientTo: 'to-gray-700',
    description: 'Podglad wszystkiego + ustawienia',
    modules: [MOD_CHECKLIST, MOD_SANEPID, MOD_TASKS, MOD_SCHEDULE, MOD_MEALS, MOD_AWARIE, MOD_RAPORTY, MOD_DAILY_REPORT, MOD_WOKI_TALKIE, MOD_FOOD_COST, MOD_FAKTURY, MOD_WORKER_PROFILES, MOD_USTAWIENIA],
    quickActions: ['/daily-report', '/woki-talkie'],
    sections: [
      {
        title: 'Zespol i grafik',
        items: [MOD_SCHEDULE, MOD_WORKER_PROFILES, MOD_STARS, MOD_MEALS],
      },
      {
        title: 'HACCP i kontrola',
        items: [MOD_CHECKLIST, MOD_TEMPERATURE, MOD_CLEANING, MOD_STRATY, MOD_RAPORTY],
      },
      {
        title: 'Finanse i koszty',
        items: [MOD_DOSTAWY, MOD_FOOD_COST, MOD_FAKTURY, MOD_DAILY_REPORT],
      },
      {
        title: 'Komunikacja',
        items: [MOD_WOKI_TALKIE, MOD_TASKS, MOD_AWARIE],
      },
      {
        title: 'System',
        items: [MOD_USTAWIENIA],
      },
    ],
    bottomNav: [
      { icon: '🏠', label: 'Pulse', href: '/' },
      { icon: '📈', label: 'Raporty', href: '/daily-report' },
      { icon: '📻', label: 'WOKI', href: '/woki-talkie' },
      { icon: '👥', label: 'Zespol', href: '/schedule' },
      { icon: '⚙️', label: 'Wiecej', href: '/settings' },
    ],
  },
}

// ─── Helpers ────────────────────────────────────────────────

const SANEPID_SUBPAGES = ['/temperature', '/cleaning', '/straty', '/sanepid']

export function canAccess(role: RoleType, pathname: string): boolean {
  const config = ROLES[role]
  if (!config) return false
  if (role === 'owner' || role === 'manager') return true
  if (SANEPID_SUBPAGES.some(sp => pathname.startsWith(sp))) {
    return config.modules.some(m => m.href === '/sanepid')
  }
  return config.modules.some(m => pathname.startsWith(m.href))
}

export function isAdminRole(role: string): boolean {
  const normalized = normalizeRole(role)
  return normalized === 'manager' || normalized === 'owner'
}
