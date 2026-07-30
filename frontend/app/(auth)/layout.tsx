import { CalendarCheck, LibraryBig, ReceiptIndianRupee, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/logo';
import { ThemeToggle } from '@/components/common/theme-toggle';

const HIGHLIGHTS = [
  {
    icon: Users,
    title: 'Every record in one place',
    description: 'Admissions, profiles, guardians and documents, kept current across departments.',
  },
  {
    icon: CalendarCheck,
    title: 'Attendance that takes minutes',
    description: 'Mark a full class in a single pass, then lock it against later edits.',
  },
  {
    icon: ReceiptIndianRupee,
    title: 'Fees without the spreadsheet',
    description: 'Invoices, installments, scholarships and receipts reconciled automatically.',
  },
  {
    icon: LibraryBig,
    title: 'Library, hostel and transport',
    description: 'Issue books, allocate rooms and assign routes from the same system.',
  },
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col lg:grid lg:grid-cols-[1.1fr_1fr] xl:grid-cols-[1.25fr_1fr]">
      {/* Brand panel — hidden below lg so the form owns small screens. */}
      <aside className="bg-sidebar text-sidebar-foreground relative hidden overflow-hidden border-r p-10 lg:flex lg:flex-col xl:p-14">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-24 size-96 rounded-full bg-primary/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -left-20 size-96 rounded-full bg-info/10 blur-3xl"
        />

        <Logo size="lg" />

        <div className="relative mt-auto max-w-lg">
          <h1 className="text-3xl font-semibold tracking-tight text-balance xl:text-4xl">
            The operational backbone of your institution.
          </h1>
          <p className="text-muted-foreground mt-4 text-base text-pretty">
            EduCore brings admissions, academics, examinations, finance and facilities into a single
            system your whole campus can rely on.
          </p>

          <ul className="mt-10 grid gap-6 sm:grid-cols-2">
            {HIGHLIGHTS.map(({ icon: Icon, title, description }) => (
              <li key={title} className="flex flex-col gap-2">
                <span className="bg-primary-muted text-primary grid size-9 place-items-center rounded-lg">
                  <Icon className="size-4.5" aria-hidden />
                </span>
                <span className="text-sm font-medium">{title}</span>
                <span className="text-muted-foreground text-sm">{description}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-muted-foreground relative mt-auto pt-10 text-xs">
          © {new Date().getFullYear()} EduCore. All rights reserved.
        </p>
      </aside>

      {/* Form panel */}
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between px-6 py-5 lg:justify-end">
          <Logo className="lg:hidden" />
          <ThemeToggle />
        </header>

        <main
          id="main-content"
          className="flex flex-1 items-center justify-center px-6 pb-16 sm:px-10"
        >
          <div className="w-full max-w-md">{children}</div>
        </main>
      </div>
    </div>
  );
}
