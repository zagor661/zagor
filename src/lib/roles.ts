// ============================================================
// System ról — Kitchen Ops
// 4 role z osobnymi modułami, ikonami i kolorami
// ============================================================

export type RoleType = 'kitchen' | 'hall' | 'manager' | 'owner'

// Backwards compatibility — mapuj stare role na nowe
export function normalizeRole(role: string): RoleType {
  switch (role) {
    case 'kitchen': return 'kitchen'
    case 'hall': return 'hall'
    case 'manager': return 'manager'
    case 'owner': return 'owner'
    // Legacy mappings
    case 'admin': return 'owner'
    case 'worker': return 'kitchen' // domyślnie kuchnia dla starych workerów
    default: return 'kitchen'
  }
}

export interface RoleConfig {
  key: RoleType
  label: string
  labelPl: string
  icon: string
  color: string        // tailwind border/text
  bgColor: string      // tailwind bg
  gradientFrom: string
  gradientTo: string
  description: string
  modules: ModuleConfig[]
}

export interface ModuleConfig {
  href: string
  icon: string
  title: string
  subtitle: string
  borderColor: string
  bgColor: string
}

// ─── Moduły wspólne ─────────────────────────────────────────

const MOD_TASKS: ModuleConfig = {
  href: '/tasks',
  icon: '📋',
  title: 'Zadania',
  subtitle: 'Lista zadań do wykonania',
  borderColor: 'border-amber-200',
  bgColor: 'bg-amber-50',
}

const MOD_SCHEDULE: ModuleConfig = {
  href: '/schedule',
  icon: '📅',
  title: 'Grafik zmianowy',
  subtitle: 'Twoje zmiany i kto z Tobą pracuje',
  borderColor: 'border-purple-200',
  bgColor: 'bg-purple-50',
}

const MOD_MEALS: ModuleConfig = {
  href: '/meals',
  icon: '🍽️',
  title: 'Posiłek pracowniczy',
  subtitle: 'Zapisz swój posiłek',
  borderColor: 'border-red-100',
  bgColor: 'bg-red-50',
}

const MOD_AWARIE: ModuleConfig = {
  href: '/awarie',
  icon: '🔧',
  title: 'Awarie i usterki',
  subtitle: 'Zgłoś usterkę ze zdjęciem i opisem',
  borderColor: 'border-orange-100',
  bgColor: 'bg-orange-50',
}

const MOD_STARS: ModuleConfig = {
  href: '/stars',
  icon: '⭐',
  title: 'Gwiazdki',
  subtitle: 'Pochwały i osiągnięcia',
  borderColor: 'border-yellow-200',
  bgColor: 'bg-yellow-50',
}

const MOD_CHECKLIST: ModuleConfig = {
  href: '/checklist',
  icon: '✅',
  title: 'Checklist',
  subtitle: 'Otwarcie · W ciągu dnia · Zamknięcie · Tydzień',
  borderColor: 'border-emerald-200',
  bgColor: 'bg-gradient-to-br from-emerald-50 to-green-50',
}

// ─── Moduły kuchni ──────────────────────────────────────────

const MOD_SANEPID: ModuleConfig = {
  href: '/sanepid',
  icon: '🧾',
  title: 'Sanepid / HACCP',
  subtitle: 'Temperatury · Czystość · Straty · Raporty',
  borderColor: 'border-teal-200',
  bgColor: 'bg-gradient-to-br from-teal-50 to-blue-50',
}

const MOD_TEMPERATURE: ModuleConfig = {
  href: '/temperature',
  icon: '🌡️',
  title: 'Temperatury',
  subtitle: 'Pomiary temperatur urządzeń chłodniczych',
  borderColor: 'border-blue-200',
  bgColor: 'bg-blue-50',
}

const MOD_CLEANING: ModuleConfig = {
  href: '/cleaning',
  icon: '🧹',
  title: 'Czystość',
  subtitle: 'Tygodniowe zadania sprzątania',
  borderColor: 'border-green-200',
  bgColor: 'bg-green-50',
}

const MOD_STRATY: ModuleConfig = {
  href: '/straty',
  icon: '📉',
  title: 'Straty',
  subtitle: 'Rejestracja strat żywności',
  borderColor: 'border-rose-200',
  bgColor: 'bg-rose-50',
}

// ─── Moduły menagera/właściciela ────────────────────────────

const MOD_WOKI_TALKIE: ModuleConfig = {
  href: '/woki-talkie',
  icon: '📻',
  title: 'WOKI TALKIE',
  subtitle: 'Komunikacja głosowa i tekstowa',
  borderColor: 'border-indigo-300',
  bgColor: 'bg-gradient-to-br from-indigo-50 to-purple-50',
}

const MOD_RAPORTY: ModuleConfig = {
  href: '/sanepid/raport',
  icon: '📊',
  title: 'Raporty',
  subtitle: 'Raporty dzienne i tygodniowe',
  borderColor: 'border-cyan-200',
  bgColor: 'bg-cyan-50',
}

const MOD_USTAWIENIA: ModuleConfig = {
  href: '/settings',
  icon: '⚙️',
  title: 'Ustawienia',
  subtitle: 'Użytkownicy, role, lokale',
  borderColor: 'border-gray-300',
  bgColor: 'bg-gray-50',
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
    description: 'Temperatury, czystość, straty, HACCP',
    modules: [MOD_CHECKLIST, MOD_SANEPID, MOD_MEALS, MOD_TASKS, MOD_SCHEDULE, MOD_AWARIE],
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
    description: 'Zadania, grafik, posiłki, usterki',
    modules: [MOD_CHECKLIST, MOD_TASKS, MOD_SCHEDULE, MOD_MEALS, MOD_AWARIE],
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
    description: 'Pełen dostęp + gwiazdki + raporty',
    modules: [MOD_CHECKLIST, MOD_SANEPID, MOD_TASKS, MOD_SCHEDULE, MOD_MEALS, MOD_AWARIE, MOD_RAPORTY, MOD_WOKI_TALKIE],
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
    description: 'Podgląd wszystkiego + ustawienia',
    modules: [MOD_CHECKLIST, MOD_SANEPID, MOD_TASKS, MOD_SCHEDULE, MOD_MEALS, MOD_AWARIE, MOD_RAPORTY, MOD_WOKI_TALKIE, MOD_USTAWIENIA],
  },
}

// ─── Helpers ────────────────────────────────────────────────

// Ścieżki podstron Sanepid — dostępne dla każdego kto ma dostęp do /sanepid
const SANEPID_SUBPAGES = ['/temperature', '/cleaning', '/straty', '/sanepid']

/** Sprawdź czy rola ma dostęp do danej ścieżki */
export function canAccess(role: RoleType, pathname: string): boolean {
  const config = ROLES[role]
  if (!config) return false
  // Owner i manager mają dostęp do wszystkiego
  if (role === 'owner' || role === 'manager') return true
  // Sanepid subpages — kto ma /sanepid, ma też /temperature, /cleaning, /straty
  if (SANEPID_SUBPAGES.some(sp => pathname.startsWith(sp))) {
    return config.modules.some(m => m.href === '/sanepid')
  }
  // Sprawdź czy moduł jest w liście
  return config.modules.some(m => pathname.startsWith(m.href))
}

/** Czy rola to admin (manager lub owner) */
export function isAdminRole(role: string): boolean {
  const normalized = normalizeRole(role)
  return normalized === 'manager' || normalized === 'owner'
}
