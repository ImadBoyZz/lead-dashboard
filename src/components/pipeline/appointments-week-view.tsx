"use client";

import { useMemo } from "react";
import Link from "next/link";

interface Appointment {
  businessId: string;
  name: string;
  meetingAt: Date;
}

interface AppointmentsWeekViewProps {
  appointments: Appointment[];
}

function getWeekDays(): Date[] {
  const now = new Date();
  const dayOfWeek = now.getDay();
  // Start from Monday (dayOfWeek: 0=Sun, 1=Mon, ..., 6=Sat)
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

const DAY_NAMES = ["Ma", "Di", "Wo", "Do", "Vr"];

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function AppointmentsWeekView({ appointments }: AppointmentsWeekViewProps) {
  const weekDays = useMemo(() => getWeekDays(), []);
  const today = useMemo(() => new Date(), []);

  const appointmentsByDay = useMemo(() => {
    const map = new Map<number, Appointment[]>();
    for (const day of weekDays) {
      map.set(day.getTime(), []);
    }
    for (const apt of appointments) {
      const aptDate = new Date(apt.meetingAt);
      for (const day of weekDays) {
        if (isSameDay(aptDate, day)) {
          map.get(day.getTime())!.push(apt);
          break;
        }
      }
    }
    return map;
  }, [appointments, weekDays]);

  return (
    <div className="mb-4 rounded-xl border border-card-border bg-card p-4">
      <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
        Deze week
      </h4>
      <div className="grid grid-cols-5 gap-2">
        {weekDays.map((day, i) => {
          const dayAppointments = appointmentsByDay.get(day.getTime()) ?? [];
          const isToday = isSameDay(day, today);

          return (
            <div
              key={i}
              className={`rounded-lg border p-2 min-h-[80px] ${
                isToday
                  ? "border-accent/40 bg-accent/5"
                  : "border-card-border bg-white"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className={`text-xs font-semibold ${
                    isToday ? "text-accent" : "text-muted"
                  }`}
                >
                  {DAY_NAMES[i]}
                </span>
                <span
                  className={`text-xs ${
                    isToday ? "text-accent font-bold" : "text-muted"
                  }`}
                >
                  {day.getDate()}
                </span>
              </div>
              <div className="space-y-1">
                {dayAppointments.length === 0 ? (
                  <p className="text-[10px] text-muted/50 italic">Geen</p>
                ) : (
                  dayAppointments.map((apt) => (
                    <Link
                      key={apt.businessId}
                      href={`/leads/${apt.businessId}`}
                      className="block rounded bg-indigo-50 border border-indigo-100 px-1.5 py-1 hover:bg-indigo-100 transition-colors"
                    >
                      <p className="text-[10px] font-medium text-indigo-800 truncate">
                        {apt.name}
                      </p>
                      <p className="text-[9px] text-indigo-600">
                        {new Date(apt.meetingAt).toLocaleTimeString("nl-BE", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </Link>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
