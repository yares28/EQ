"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { CompanyIntakeDialog } from "@/components/eq/company-intake";
import { SettingsDialog } from "@/components/eq/settings-dialog";
import {
  ChartBar,
  CurrencyEur,
  List,
  Scales,
  SealCheck,
} from "@/components/eq/icon";
import { cn } from "@/lib/utils";

const NAV_SPRING = { type: "spring" as const, stiffness: 420, damping: 36 };
const NAV_ENTER = { type: "spring" as const, stiffness: 360, damping: 32, delay: 0.04 };

const DESTINATIONS: {
  href: string;
  label: string;
  icon: typeof CurrencyEur;
  exact?: boolean;
}[] = [
  { href: "/salary", label: "Salary", icon: CurrencyEur },
  { href: "/compare", label: "Compare", icon: Scales },
  { href: "/scores", label: "Scores", icon: SealCheck },
  { href: "/charts", label: "Charts", icon: ChartBar },
] as const;

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  href,
  label,
  exact,
  pathname,
  onNavigate,
  className,
}: {
  href: string;
  label: string;
  exact?: boolean;
  pathname: string;
  onNavigate?: () => void;
  className?: string;
}) {
  const active = isActive(pathname, href, exact);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative rounded-full px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "text-primary-foreground" : "text-foreground/70 hover:bg-white/40 hover:text-foreground",
        className
      )}
    >
      {active && (
        <motion.span
          layoutId="eq-nav-active-pill"
          className="absolute inset-0 rounded-full bg-foreground shadow-sm"
          transition={NAV_SPRING}
        />
      )}
      <span className="relative z-10">{label}</span>
    </Link>
  );
}

export function Nav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <>
      <header className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-4 pb-3 sm:pt-5 sm:pb-4">
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={NAV_ENTER}
          className="eq-nav-glass pointer-events-auto flex w-full max-w-[min(100%,52rem)] items-center gap-1 rounded-full px-2 py-1.5 sm:max-w-none sm:w-auto"
        >
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} transition={NAV_SPRING}>
            <Link
              href="/"
              className="block shrink-0 rounded-full px-3 py-2 text-[15px] font-semibold tracking-tight text-foreground"
            >
              EQ
            </Link>
          </motion.div>

          <nav
            className="hidden min-w-0 flex-1 items-center justify-center gap-0.5 lg:flex"
            aria-label="Primary"
          >
            {DESTINATIONS.map(({ href, label, exact }) => (
              <NavLink
                key={href}
                href={href}
                label={label}
                exact={exact}
                pathname={pathname}
              />
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1.5 pl-1">
            <CompanyIntakeDialog />
            <SettingsDialog />
            <motion.button
              type="button"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={NAV_SPRING}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors lg:hidden",
                menuOpen
                  ? "bg-foreground text-primary-foreground"
                  : "text-foreground/70 hover:bg-white/45 hover:text-foreground"
              )}
              aria-expanded={menuOpen}
              aria-controls="eq-mobile-nav"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <motion.span
                animate={{ rotate: menuOpen ? 90 : 0 }}
                transition={NAV_SPRING}
                className="inline-flex"
              >
                <List size={18} weight="regular" />
              </motion.span>
              <span className="sr-only sm:not-sr-only">Menu</span>
            </motion.button>
          </div>
        </motion.div>
      </header>

      <AnimatePresence>
        {menuOpen && (
          <motion.nav
            id="eq-mobile-nav"
            initial={{ opacity: 0, y: -10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={NAV_SPRING}
            className="eq-nav-glass fixed inset-x-4 top-[4.75rem] z-40 mx-auto max-w-sm rounded-[20px] p-2 lg:hidden"
            aria-label="Mobile primary"
          >
            <motion.ul
              initial="hidden"
              animate="visible"
              exit="hidden"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.035, delayChildren: 0.04 } },
              }}
              className="grid gap-0.5"
            >
              {DESTINATIONS.map(({ href, label, icon: Icon, exact }) => {
                const active = isActive(pathname, href, exact);
                return (
                  <motion.li
                    key={href}
                    variants={{
                      hidden: { opacity: 0, x: -10 },
                      visible: { opacity: 1, x: 0 },
                    }}
                    transition={NAV_SPRING}
                  >
                    <Link
                      href={href}
                      onClick={() => setMenuOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                        active
                          ? "bg-foreground text-primary-foreground"
                          : "text-foreground/70 hover:bg-white/45 hover:text-foreground"
                      )}
                    >
                      <Icon size={18} weight="light" />
                      {label}
                    </Link>
                  </motion.li>
                );
              })}
            </motion.ul>
          </motion.nav>
        )}
      </AnimatePresence>
    </>
  );
}
