"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { NotificationBell } from "@/components/NotificationBell";
import fr from "@/locales/fr";

export function Header() {
  const { user, status, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.push("/");
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="text-lg font-semibold text-blue-700">
          {fr.appName}
        </Link>

        <nav className="flex flex-wrap items-center gap-4 text-sm">
          <Link href="/doctors" className="text-slate-700 hover:text-blue-700">
            {fr.nav.search}
          </Link>

          {status === "authenticated" && user?.role === "PATIENT" && (
            <>
              <Link href="/patient/appointments" className="text-slate-700 hover:text-blue-700">
                {fr.nav.myAppointments}
              </Link>
              <Link href="/patient/profile" className="text-slate-700 hover:text-blue-700">
                {fr.nav.myProfile}
              </Link>
            </>
          )}

          {status === "authenticated" && user?.role === "DOCTOR" && (
            <>
              <Link href="/doctor" className="text-slate-700 hover:text-blue-700">
                {fr.doctorDashboard.nav.overview}
              </Link>
              <Link href="/doctor/availability" className="text-slate-700 hover:text-blue-700">
                {fr.doctorDashboard.nav.availability}
              </Link>
              <Link href="/doctor/appointments" className="text-slate-700 hover:text-blue-700">
                {fr.doctorDashboard.nav.appointments}
              </Link>
            </>
          )}

          {status === "authenticated" && user?.role === "ADMIN" && (
            <>
              <Link href="/admin" className="text-slate-700 hover:text-blue-700">
                {fr.adminDashboard.nav.overview}
              </Link>
              <Link href="/admin/doctors" className="text-slate-700 hover:text-blue-700">
                {fr.adminDashboard.nav.doctors}
              </Link>
              <Link href="/admin/users" className="text-slate-700 hover:text-blue-700">
                {fr.adminDashboard.nav.users}
              </Link>
              <Link href="/admin/appointments" className="text-slate-700 hover:text-blue-700">
                {fr.adminDashboard.nav.appointments}
              </Link>
            </>
          )}

          {status === "authenticated" && <NotificationBell />}

          {status === "authenticated" ? (
            <button type="button" onClick={handleLogout} className="text-slate-700 hover:text-blue-700">
              {fr.nav.logout}
            </button>
          ) : status === "unauthenticated" ? (
            <>
              <Link href="/login" className="text-slate-700 hover:text-blue-700">
                {fr.nav.login}
              </Link>
              <Link href="/register" className="rounded-md bg-blue-700 px-3 py-1.5 text-white hover:bg-blue-800">
                {fr.nav.register}
              </Link>
            </>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
