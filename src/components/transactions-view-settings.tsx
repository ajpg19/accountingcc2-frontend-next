"use client"

import * as React from "react"
import { SettingsIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useIsMobile } from "@/hooks/use-mobile"

// User-configurable options for how the movements list is displayed. Kept as an
// object so new toggles can be added without touching the context shape.
export type TransactionsViewSettings = {
  // Collapse each direct-payment pair (expense + contribution) into a single
  // representative row. When false, both underlying movements are listed.
  groupDirectos: boolean
}

const DEFAULT_SETTINGS: TransactionsViewSettings = {
  groupDirectos: true,
}

const STORAGE_KEY = "transactions-view-settings"

type ContextValue = {
  settings: TransactionsViewSettings
  setSetting: <K extends keyof TransactionsViewSettings>(
    key: K,
    value: TransactionsViewSettings[K]
  ) => void
}

const ViewSettingsContext = React.createContext<ContextValue | null>(null)

// Shares the list display settings between the gear button (rendered in the
// page header) and the data table, which live in different subtrees.
export function TransactionsViewSettingsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [settings, setSettings] =
    React.useState<TransactionsViewSettings>(DEFAULT_SETTINGS)

  // Load the persisted preference after mount to avoid a hydration mismatch
  // (the server always renders with DEFAULT_SETTINGS).
  React.useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as Partial<TransactionsViewSettings>
      setSettings((prev) => ({ ...prev, ...parsed }))
    } catch {
      // Ignore malformed storage and keep the defaults.
    }
  }, [])

  const setSetting = React.useCallback<ContextValue["setSetting"]>(
    (key, value) => {
      setSettings((prev) => {
        const next = { ...prev, [key]: value }
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        return next
      })
    },
    []
  )

  const value = React.useMemo(
    () => ({ settings, setSetting }),
    [settings, setSetting]
  )

  return (
    <ViewSettingsContext.Provider value={value}>
      {children}
    </ViewSettingsContext.Provider>
  )
}

export function useTransactionsViewSettings() {
  const ctx = React.useContext(ViewSettingsContext)
  if (!ctx) {
    throw new Error(
      "useTransactionsViewSettings must be used within a TransactionsViewSettingsProvider"
    )
  }
  return ctx
}

// Gear button + drawer that let the user configure how the list is shown.
export function TransactionsViewSettingsButton() {
  const { settings, setSetting } = useTransactionsViewSettings()
  const isMobile = useIsMobile()

  return (
    <Drawer direction={isMobile ? "bottom" : "right"}>
      <DrawerTrigger asChild>
        <Button variant="outline" size="icon" className="size-8" aria-label="Configurar listado">
          <SettingsIcon />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <div className="mx-auto w-full max-w-md">
          <DrawerHeader>
            <DrawerTitle>Configurar listado</DrawerTitle>
            <DrawerDescription>
              Ajusta cómo se muestran los movimientos.
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-2">
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="group-directos">Agrupar pagos directos</Label>
                <p className="text-sm text-muted-foreground">
                  Muestra el gasto y su atribución como una sola fila.
                </p>
              </div>
              <Switch
                id="group-directos"
                checked={settings.groupDirectos}
                onCheckedChange={(checked) =>
                  setSetting("groupDirectos", checked)
                }
              />
            </div>
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="outline">Cerrar</Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
